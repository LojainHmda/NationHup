import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package, Truck, ArrowRightLeft, BarChart3, Search, ChevronDown, ChevronUp,
  Check, X, AlertTriangle, Clock, CheckCircle2, CircleDot, Eye,
  Boxes, ArrowRight, ArrowLeft, Tags, User, ShoppingBag, ChevronRight,
  ScanBarcode, Hash, Upload, Calendar, FileSpreadsheet, Minus, Plus,
} from "lucide-react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────

interface FulfillmentRecord {
  id: string;
  orderId: string;
  productId: string;
  sku: string;
  size: string;
  quantityOrdered: number;
  quantityFulfilled: number;
  status: string;
}

interface PreOrder {
  id: string;
  orderName?: string;
  customerName?: string;
  customerEmail?: string;
  customerUsername?: string;
  userId?: string;
  status: string;
  workflowStage: string;
  total: string;
  items: Array<{
    productId: string;
    productName: string;
    sku: string;
    brand: string;
    size: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  createdAt: string;
  fulfillmentSummary: {
    totalOrdered: number;
    totalFulfilled: number;
    fulfillmentStatus: string;
  };
  fulfillmentDetails: FulfillmentRecord[];
}

interface ShipmentItem {
  id: string;
  shipmentId: string;
  productId: string;
  sku: string;
  productName: string;
  size: string;
  quantityExpected: number;
  quantityReceived: number;
  quantityAllocated: number;
  availableToAllocate?: number;
}

interface Shipment {
  id: string;
  referenceNumber: string;
  supplierName: string;
  status: string;
  notes?: string;
  expectedDate?: string;
  receivedDate?: string;
  createdAt: string;
  items: ShipmentItem[];
}

interface Allocation {
  id: string;
  shipmentItemId: string;
  orderId: string;
  productId: string;
  sku: string;
  size: string;
  quantityAllocated: number;
  status: string;
  allocatedAt: string;
  notes?: string;
}

interface Summary {
  totalPreOrders: number;
  totalItemsOrdered: number;
  totalItemsFulfilled: number;
  fullyFulfilledOrders: number;
  partiallyFulfilledOrders: number;
  unfulfilledOrders: number;
  totalShipments: number;
  pendingShipments: number;
  totalReceived: number;
  totalAllocated: number;
  unallocatedStock: number;
}

type Tab = "dashboard" | "orders" | "brand-fulfill";

interface ShotUpload {
  id: string;
  date: string;
  fileName: string;
  items: Array<{ upc: string; sizes: Record<string, number> }>;
}

/** Match shot Excel size column header to order line size (handles "42" vs "42.0", commas, trim). */
function orderLineSizeMatchesShotSize(shotSizeKey: string, orderSize: string): boolean {
  const a = String(shotSizeKey ?? "").trim();
  const b = String(orderSize ?? "").trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const norm = (s: string) => s.replace(",", ".").trim();
  const na = Number(norm(a));
  const nb = Number(norm(b));
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na === nb) return true;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }) === 0;
}

function computeShotInventory(shot: ShotUpload) {
  let total = 0;
  for (const row of shot.items) {
    for (const qty of Object.values(row.sizes)) total += qty;
  }
  return { total };
}

const SHOT_DIST_STORAGE_KEY = "preorder-shot-distributions";
/** Fired in-tab when Brand Fulfillment saves distribute quantities (storage event is cross-tab only). */
const SHOT_DIST_CHANGED_EVENT = "preorder-shot-distributions-changed";

function loadShotDistributions(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SHOT_DIST_STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

/** Sum numeric distribute values for keys starting with `${shotScope}|` */
function sumDistributedForShotScope(dist: Record<string, string>, shotScope: string): number {
  const p = `${shotScope}|`;
  let s = 0;
  for (const [k, v] of Object.entries(dist)) {
    if (!k.startsWith(p)) continue;
    const n = parseInt(String(v), 10);
    if (!Number.isNaN(n) && n > 0) s += n;
  }
  return s;
}

/** Total manually distributed (each map entry counted once). */
function sumAllDistributedValues(dist: Record<string, string>): number {
  let s = 0;
  for (const v of Object.values(dist)) {
    const n = parseInt(String(v), 10);
    if (!Number.isNaN(n) && n > 0) s += n;
  }
  return s;
}

/** First shot (upload order) whose sheet includes this UPC (case-insensitive). */
function firstShotIdContainingUpc(allShots: ShotUpload[], sku: string): string | null {
  const u = String(sku ?? "").toLowerCase();
  if (!u) return null;
  for (const sh of allShots) {
    if (sh.items.some((it) => String(it.upc ?? "").toLowerCase() === u)) return sh.id;
  }
  return null;
}

/**
 * Shown on a shot chip: sums keys scoped to that shot plus every `__all__|…` row whose SKU
 * appears in that shot first among uploaded shots (same UPC in multiple shots → first wins).
 */
function distributedForShotChip(shotId: string, allShots: ShotUpload[], dist: Record<string, string>): number {
  let s = sumDistributedForShotScope(dist, shotId);
  const ap = `__all__|`;
  for (const [k, v] of Object.entries(dist)) {
    if (!k.startsWith(ap)) continue;
    const parts = k.split("|");
    if (parts.length < 6) continue;
    const sku = parts[3];
    const n = parseInt(String(v), 10);
    if (Number.isNaN(n) || n < 1) continue;
    if (firstShotIdContainingUpc(allShots, sku) === shotId) s += n;
  }
  return s;
}

/** Key: orderId → sum of shot “Distribute” line quantities for that order (from localStorage). */
function buildShotDistUnitsByOrder(dist: Record<string, string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const [k, v] of Object.entries(dist)) {
    const parts = k.split("|");
    if (parts.length < 6) continue;
    const orderId = parts[2];
    const n = parseInt(String(v), 10);
    if (Number.isNaN(n) || n < 1) continue;
    m.set(orderId, (m.get(orderId) || 0) + n);
  }
  return m;
}

function useShotDistributeUnitsByOrderId(): Map<string, number> {
  const [byOrder, setByOrder] = useState(() => buildShotDistUnitsByOrder(loadShotDistributions()));

  useEffect(() => {
    const sync = () => setByOrder(buildShotDistUnitsByOrder(loadShotDistributions()));
    const onStorage = (e: StorageEvent) => {
      if (e.key === SHOT_DIST_STORAGE_KEY || e.key === null) sync();
    };
    window.addEventListener(SHOT_DIST_CHANGED_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SHOT_DIST_CHANGED_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return byOrder;
}

/** Live full map for per-line shot Assign (localStorage + same-tab events). */
function useShotDistributionsLive(): Record<string, string> {
  const [dist, setDist] = useState(loadShotDistributions);
  useEffect(() => {
    const sync = () => setDist(loadShotDistributions());
    const onStorage = (e: StorageEvent) => {
      if (e.key === SHOT_DIST_STORAGE_KEY || e.key === null) sync();
    };
    window.addEventListener(SHOT_DIST_CHANGED_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SHOT_DIST_CHANGED_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return dist;
}

/**
 * Sum Assign qty for keys `scope|productId|orderId|sku|size|rowIdx` matching this order line
 * (same segments Brand Fulfillment uses).
 */
function shotAssignQtyForOrderLine(
  dist: Record<string, string>,
  orderId: string,
  productId: string,
  sku: string,
  size: string,
): number {
  let sum = 0;
  for (const [k, v] of Object.entries(dist)) {
    const parts = k.split("|");
    if (parts.length < 6) continue;
    const pid = parts[1];
    const oid = parts[2];
    const sk = parts[3];
    const sz = parts[4];
    if (oid !== orderId || pid !== productId || sk !== sku || sz !== size) continue;
    const n = parseInt(String(v), 10);
    if (!Number.isNaN(n) && n > 0) sum += n;
  }
  return sum;
}

/** Order-level stats matching Pre-Orders ProgressBar: effective fulfilled includes shot Distribute. */
function computeDashboardFulfillmentFromOrders(
  preOrders: PreOrder[],
  shotDistByOrder: Map<string, number>,
): {
  fullyFulfilledOrders: number;
  partiallyFulfilledOrders: number;
  unfulfilledOrders: number;
  effectiveItemsFulfilled: number;
} {
  let fullyFulfilledOrders = 0;
  let partiallyFulfilledOrders = 0;
  let unfulfilledOrders = 0;
  let effectiveItemsFulfilled = 0;

  for (const order of preOrders) {
    const fs = order.fulfillmentSummary;
    const shot = shotDistByOrder.get(order.id) ?? 0;
    const eff = Math.min(fs.totalOrdered, fs.totalFulfilled + shot);
    effectiveItemsFulfilled += eff;

    if (fs.totalOrdered <= 0) {
      unfulfilledOrders++;
      continue;
    }
    if (eff >= fs.totalOrdered) fullyFulfilledOrders++;
    else if (eff <= 0) unfulfilledOrders++;
    else partiallyFulfilledOrders++;
  }

  return { fullyFulfilledOrders, partiallyFulfilledOrders, unfulfilledOrders, effectiveItemsFulfilled };
}

function isOrderCompleted(order: PreOrder) {
  const st = (order.workflowStage || "").toLowerCase();
  const status = (order.status || "").toLowerCase();
  return st === "completed" || status === "completed";
}

// ─── API helpers ─────────────────────────────────────────────────────────

const apiFetch = async (url: string, options?: RequestInit) => {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || res.statusText);
  }
  return res.json();
};

// ─── Reusable small components ──────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: number | string; icon: any; color: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-start gap-3 shadow-sm">
      <div className={cn("p-2.5 rounded-lg", color)}>
        <Icon className="w-[18px] h-[18px] text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5 leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{sub}</p>}
      </div>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    fulfilled: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Fulfilled" },
    partially_fulfilled: { bg: "bg-amber-50", text: "text-amber-700", label: "Partial" },
    unfulfilled: { bg: "bg-red-50", text: "text-red-700", label: "Unfulfilled" },
    pending: { bg: "bg-gray-100", text: "text-gray-600", label: "Pending" },
    in_transit: { bg: "bg-blue-50", text: "text-blue-700", label: "In Transit" },
    partially_received: { bg: "bg-amber-50", text: "text-amber-700", label: "Partial Received" },
    received: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Received" },
    cancelled: { bg: "bg-red-50", text: "text-red-600", label: "Cancelled" },
    allocated: { bg: "bg-indigo-50", text: "text-indigo-700", label: "Allocated" },
    shipped: { bg: "bg-blue-50", text: "text-blue-700", label: "Shipped" },
    delivered: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Delivered" },
  };
  const s = map[status] || { bg: "bg-gray-100", text: "text-gray-600", label: status };
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold", s.bg, s.text)}>
      {s.label}
    </span>
  );
}

function ProgressBar({ fulfilled, ordered }: { fulfilled: number; ordered: number }) {
  const pct = ordered > 0 ? Math.min(100, Math.round((fulfilled / ordered) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 min-w-[120px] max-w-[200px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-500" : "bg-gray-300",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap tabular-nums">{fulfilled}/{ordered}</span>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────

export default function PreorderManagementPage() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "dashboard", label: "Dashboard", icon: BarChart3 },
    { key: "orders", label: "Pre-Orders", icon: Package },
    { key: "brand-fulfill", label: "Brand Fulfillment", icon: Tags },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-5 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight truncate">Pre-order Management</h1>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 leading-snug">Warehouse fulfillment & stock allocation</p>
            </div>
          </div>
          <div className="flex gap-0.5 mt-2 -mb-px overflow-x-auto">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
                  activeTab === t.key
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
                )}
              >
                <t.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-5 py-3">
        {activeTab === "dashboard" && <DashboardTab />}
        {activeTab === "orders" && <OrdersTab />}
        {activeTab === "brand-fulfill" && <BrandFulfillTab />}
      </div>
    </div>
  );
}

// ─── Dashboard Tab ──────────────────────────────────────────────────────

function DashboardTab() {
  const shotDistByOrder = useShotDistributeUnitsByOrderId();
  const { data: summary, isLoading: loadingSummary } = useQuery<Summary>({
    queryKey: ["/api/admin/preorder-management/summary"],
    queryFn: () => apiFetch("/api/admin/preorder-management/summary"),
  });
  const { data: preOrders = [], isLoading: loadingOrders } = useQuery<PreOrder[]>({
    queryKey: ["/api/admin/preorder-management/orders"],
    queryFn: () => apiFetch("/api/admin/preorder-management/orders"),
  });

  const dashFulfill = useMemo(
    () => computeDashboardFulfillmentFromOrders(preOrders, shotDistByOrder),
    [preOrders, shotDistByOrder],
  );

  if (loadingSummary || loadingOrders) return <LoadingSpinner />;
  if (!summary) return <EmptyState message="No data yet" />;

  const orderTotal = preOrders.length;
  const itemsFulfilledDisplay = dashFulfill.effectiveItemsFulfilled;
  const fulfillRatePct =
    summary.totalItemsOrdered > 0
      ? Math.min(100, Math.round((itemsFulfilledDisplay / summary.totalItemsOrdered) * 100))
      : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Pre-Orders" value={summary.totalPreOrders} icon={Package} color="bg-indigo-500" />
        <StatCard label="Items Ordered" value={summary.totalItemsOrdered} icon={Boxes} color="bg-blue-500" sub={`${itemsFulfilledDisplay} fulfilled`} />
        <StatCard label="Total Shipments" value={summary.totalShipments} icon={Truck} color="bg-violet-500" sub={`${summary.pendingShipments} pending`} />
        <StatCard label="Unallocated Stock" value={summary.unallocatedStock} icon={ArrowRightLeft} color="bg-amber-500" sub="Units received but not assigned" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Order Fulfillment</h3>
          <div className="space-y-3">
            <FulfillmentRow label="Fully Fulfilled" count={dashFulfill.fullyFulfilledOrders} total={orderTotal} color="bg-emerald-500" />
            <FulfillmentRow label="Partially Fulfilled" count={dashFulfill.partiallyFulfilledOrders} total={orderTotal} color="bg-amber-500" />
            <FulfillmentRow label="Unfulfilled" count={dashFulfill.unfulfilledOrders} total={orderTotal} color="bg-red-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Stock Pipeline</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Total Received</span>
              <span className="text-base font-bold text-gray-900 tabular-nums">{summary.totalReceived}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Allocated to Orders</span>
              <span className="text-base font-bold text-indigo-600 tabular-nums">{summary.totalAllocated}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Available to Allocate</span>
              <span className="text-base font-bold text-amber-600 tabular-nums">{summary.unallocatedStock}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Fulfillment Rate</h3>
          <div className="flex items-center justify-center py-4 min-h-[7rem]">
            <div className="text-center">
              <p className="text-4xl font-bold text-indigo-600 tabular-nums leading-none">
                {fulfillRatePct}%
              </p>
              <p className="text-xs text-gray-500 mt-1.5">of ordered units</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FulfillmentRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-900 tabular-nums">{count}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Orders Tab ─────────────────────────────────────────────────────────

function OrdersTab() {
  const shotDistByOrder = useShotDistributeUnitsByOrderId();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  const { data: preOrders = [], isLoading } = useQuery<PreOrder[]>({
    queryKey: ["/api/admin/preorder-management/orders"],
    queryFn: () => apiFetch("/api/admin/preorder-management/orders"),
  });

  const qc = useQueryClient();
  const initFulfillment = useMutation({
    mutationFn: (orderId: string) =>
      apiFetch(`/api/admin/preorder-management/orders/${orderId}/init-fulfillment`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/preorder-management/orders"] }),
  });

  const filtered = useMemo(() => {
    return preOrders.filter(o => {
      const matchSearch = !search ||
        (o.orderName || "").toLowerCase().includes(search.toLowerCase()) ||
        (o.customerName || "").toLowerCase().includes(search.toLowerCase()) ||
        o.id.toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === "all" || o.fulfillmentSummary.fulfillmentStatus === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [preOrders, search, filterStatus]);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by order name, customer, or ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="unfulfilled">Unfulfilled</option>
            <option value="partially_fulfilled">Partially Fulfilled</option>
            <option value="fulfilled">Fulfilled</option>
          </select>
          <span className="text-xs text-gray-500">{filtered.length} orders</span>
        </div>
      </div>

      {/* Orders Table */}
      {filtered.length === 0 ? (
        <EmptyState message="No pre-orders found" />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2">Order</th>
                <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2">Customer</th>
                <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2">Items</th>
                <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2">Fulfillment</th>
                <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2">Status</th>
                <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2">Date</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(order => (
                <OrderRow
                  key={order.id}
                  order={order}
                  shotDistributeUnits={shotDistByOrder.get(order.id) ?? 0}
                  isExpanded={expandedOrder === order.id}
                  onToggle={() => {
                    if (expandedOrder === order.id) {
                      setExpandedOrder(null);
                    } else {
                      setExpandedOrder(order.id);
                      if (order.fulfillmentDetails.length === 0) {
                        initFulfillment.mutate(order.id);
                      }
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrderRow({
  order,
  shotDistributeUnits,
  isExpanded,
  onToggle,
}: {
  order: PreOrder;
  shotDistributeUnits: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { fulfillmentSummary: fs } = order;
  const fulfilledDisplay = Math.min(fs.totalOrdered, fs.totalFulfilled + shotDistributeUnits);

  return (
    <>
      <tr className={cn("hover:bg-gray-50/50 transition-colors cursor-pointer", isExpanded && "bg-indigo-50/30")} onClick={onToggle}>
        <td className="px-4 py-2">
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-snug">{order.orderName || order.id.slice(0, 8)}</p>
            <p className="text-[11px] text-gray-400 font-mono">#{order.id.slice(0, 8)}</p>
          </div>
        </td>
        <td className="px-4 py-2">
          <p className="text-sm text-gray-900 leading-snug">{order.customerName || "—"}</p>
          <p className="text-[11px] text-gray-400 leading-snug">{order.customerEmail || ""}</p>
        </td>
        <td className="px-4 py-2">
          <span className="text-sm font-medium text-gray-900">{order.items.length} lines</span>
          <span className="text-[11px] text-gray-400 ml-1">({fs.totalOrdered} units)</span>
        </td>
        <td className="px-4 py-2">
          <ProgressBar fulfilled={fulfilledDisplay} ordered={fs.totalOrdered} />
        </td>
        <td className="px-4 py-2">
          <Badge status={fs.fulfillmentStatus} />
        </td>
        <td className="px-4 py-2">
          <span className="text-[11px] text-gray-500 tabular-nums">{new Date(order.createdAt).toLocaleDateString()}</span>
        </td>
        <td className="px-4 py-2">
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="bg-gray-50/70 px-4 py-3">
            <OrderDetails order={order} />
          </td>
        </tr>
      )}
    </>
  );
}

function OrderDetails({ order }: { order: PreOrder }) {
  const shotDist = useShotDistributionsLive();
  const { data: allocations = [] } = useQuery<Allocation[]>({
    queryKey: ["/api/admin/preorder-management/allocations", order.id],
    queryFn: () => apiFetch(`/api/admin/preorder-management/allocations?orderId=${order.id}`),
  });

  const fulfillmentMap = new Map<string, FulfillmentRecord>();
  for (const f of order.fulfillmentDetails) {
    fulfillmentMap.set(`${f.productId}|${f.size}`, f);
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-gray-700">Line Items</h4>
      <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/80 text-[10px] text-gray-500 uppercase">
              <th className="text-left px-3 py-1.5 font-semibold">Product</th>
              <th className="text-left px-3 py-1.5 font-semibold">SKU</th>
              <th className="text-left px-3 py-1.5 font-semibold">Size</th>
              <th className="text-center px-3 py-1.5 font-semibold">Ordered</th>
              <th className="text-center px-3 py-1.5 font-semibold">Fulfilled</th>
              <th className="text-center px-3 py-1.5 font-semibold">Remaining</th>
              <th className="text-left px-3 py-1.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {order.items.map((item, idx) => {
              const f = fulfillmentMap.get(`${item.productId}|${item.size}`);
              const apiFulfilled = f?.quantityFulfilled || 0;
              const shotLine = shotAssignQtyForOrderLine(shotDist, order.id, item.productId, item.sku, item.size);
              const covered = Math.min(item.quantity, apiFulfilled + shotLine);
              const remaining = item.quantity - covered;
              const shotShows = Math.max(0, covered - apiFulfilled);
              const lineStatus =
                item.quantity <= 0
                  ? "unfulfilled"
                  : covered >= item.quantity
                    ? "fulfilled"
                    : covered > 0
                      ? "partially_fulfilled"
                      : "unfulfilled";
              return (
                <tr key={idx} className="hover:bg-gray-50/50">
                  <td className="px-3 py-1.5 text-xs text-gray-900 font-medium">{item.productName}</td>
                  <td className="px-3 py-1.5 text-[11px] text-gray-500 font-mono">{item.sku}</td>
                  <td className="px-3 py-1.5 text-xs text-gray-700">{item.size}</td>
                  <td className="px-3 py-1.5 text-xs text-center font-semibold text-gray-900 tabular-nums">{item.quantity}</td>
                  <td className="px-3 py-1.5 text-xs text-center font-semibold tabular-nums">
                    <span className="text-indigo-700">{covered}</span>
                    {shotShows > 0 ? (
                      <span className="block text-[9px] font-medium text-indigo-500 mt-px">
                        {apiFulfilled} stock + {shotShows} shot
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-center font-semibold tabular-nums">
                    <span className={remaining > 0 ? "text-amber-600" : "text-emerald-600"}>{remaining}</span>
                  </td>
                  <td className="px-3 py-1.5"><Badge status={lineStatus} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {allocations.length > 0 && (
        <div className="mt-2">
          <h4 className="text-xs font-semibold text-gray-700 mb-1.5">Allocation History</h4>
          <div className="space-y-1">
            {allocations.map(a => (
              <div key={a.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-1.5 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span className="text-gray-700">
                  <strong>{a.quantityAllocated}</strong> x {a.sku} (Size {a.size})
                </span>
                <ArrowRight className="w-3 h-3 text-gray-400" />
                <Badge status={a.status} />
                <span className="text-xs text-gray-400 ml-auto">{new Date(a.allocatedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Brand Fulfillment Tab ──────────────────────────────────────────────

function BrandFulfillTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: preOrders = [], isLoading: loadingOrders } = useQuery<PreOrder[]>({
    queryKey: ["/api/admin/preorder-management/orders"],
    queryFn: () => apiFetch("/api/admin/preorder-management/orders"),
  });
  const { data: brands = [] } = useQuery<any[]>({
    queryKey: ["/api/brands"],
    queryFn: () => apiFetch("/api/brands"),
  });
  const { data: shipments = [] } = useQuery<Shipment[]>({
    queryKey: ["/api/admin/preorder-management/shipments"],
    queryFn: () => apiFetch("/api/admin/preorder-management/shipments"),
  });

  const initFulfillment = useMutation({
    mutationFn: (orderId: string) =>
      apiFetch(`/api/admin/preorder-management/orders/${orderId}/init-fulfillment`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/preorder-management/orders"] }),
  });

  const allocateMutation = useMutation({
    mutationFn: (payload: { shipmentItemId: string; orderId: string; productId: string; sku: string; size: string; quantity: number }) =>
      apiFetch("/api/admin/preorder-management/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/preorder-management"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/preorder-management/orders"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/preorder-management/shipments"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/preorder-management/allocations"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/preorder-management/summary"] });
      toast({ title: "Stock allocated successfully" });
    },
    onError: (err: any) => toast({ title: "Allocation failed", description: err.message, variant: "destructive" }),
  });

  // Build brand map: brandId/name -> slug to match order item.brand
  const brandMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string; logoUrl?: string }>();
    for (const b of brands) {
      m.set(b.id, b);
      m.set(b.name?.toLowerCase(), b);
      m.set(b.slug?.toLowerCase(), b);
    }
    return m;
  }, [brands]);

  // Index: brand -> customers -> orders with items from that brand
  const brandIndex = useMemo(() => {
    const index = new Map<string, {
      brandId: string;
      brandName: string;
      logoUrl?: string;
      customers: Map<string, {
        customerId: string;
        customerName: string;
        customerEmail: string;
        orders: Array<{
          order: PreOrder;
          brandItems: PreOrder["items"];
        }>;
        totalUnits: number;
      }>;
      totalUnits: number;
      totalCustomers: number;
    }>();

    for (const order of preOrders) {
      for (const item of order.items) {
        const bKey = (item.brand || "").toLowerCase();
        const brand = brandMap.get(bKey);
        const brandName = brand?.name || item.brand || "Unknown";
        const brandId = brand?.id || bKey;

        if (!index.has(brandId)) {
          index.set(brandId, {
            brandId,
            brandName,
            logoUrl: brand?.logoUrl,
            customers: new Map(),
            totalUnits: 0,
            totalCustomers: 0,
          });
        }
        const bEntry = index.get(brandId)!;
        bEntry.totalUnits += item.quantity;

        const custKey = order.userId || order.customerEmail || order.customerName || order.id;
        const custName = order.customerName || "Guest Customer";
        const custEmail = order.customerEmail || "";

        if (!bEntry.customers.has(custKey)) {
          bEntry.customers.set(custKey, {
            customerId: custKey,
            customerName: custName,
            customerEmail: custEmail,
            orders: [],
            totalUnits: 0,
          });
        }
        const cEntry = bEntry.customers.get(custKey)!;

        let existing = cEntry.orders.find(o => o.order.id === order.id);
        if (!existing) {
          existing = { order, brandItems: [] };
          cEntry.orders.push(existing);
        }
        existing.brandItems.push(item);
        cEntry.totalUnits += item.quantity;
      }
    }

    for (const b of index.values()) {
      b.totalCustomers = b.customers.size;
    }

    return index;
  }, [preOrders, brandMap]);

  // Build UPC/SKU search index: sku -> [{order, item, customerName}]
  const skuIndex = useMemo(() => {
    const m = new Map<string, Array<{
      order: PreOrder;
      item: PreOrder["items"][0];
      customerName: string;
      customerEmail: string;
      fulfillment?: FulfillmentRecord;
    }>>();
    for (const order of preOrders) {
      const fMap = new Map<string, FulfillmentRecord>();
      for (const f of order.fulfillmentDetails) fMap.set(`${f.productId}|${f.size}`, f);

      for (const item of order.items) {
        const sku = item.sku?.toLowerCase() || "";
        if (!sku) continue;
        if (!m.has(sku)) m.set(sku, []);
        m.get(sku)!.push({
          order,
          item,
          customerName: order.customerName || "Guest",
          customerEmail: order.customerEmail || "",
          fulfillment: fMap.get(`${item.productId}|${item.size}`),
        });
      }
    }
    return m;
  }, [preOrders]);

  // Navigation state
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [upcSearch, setUpcSearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [shotProductSearch, setShotProductSearch] = useState("");
  const [shotSizeSearch, setShotSizeSearch] = useState("");

  // ─── Shot Upload State ───
  const [shots, setShots] = useState<ShotUpload[]>(() => {
    try {
      const saved = localStorage.getItem('preorder-shots');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [selectedShotProductId, setSelectedShotProductId] = useState<string | null>(null);
  const [selectedShotSize, setSelectedShotSize] = useState<string | null>(null);
  /** Manual per-line distribute qty. Keys: `${shotScope}|${productId}|${orderId}|${sku}|${size}|${idx}` (persisted) */
  const [shotLineDistributeQty, setShotLineDistributeQty] = useState<Record<string, string>>(loadShotDistributions);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('preorder-shots', JSON.stringify(shots));
  }, [shots]);

  useEffect(() => {
    try {
      localStorage.setItem(SHOT_DIST_STORAGE_KEY, JSON.stringify(shotLineDistributeQty));
    } catch { /* ignore quota */ }
    window.dispatchEvent(new CustomEvent(SHOT_DIST_CHANGED_EVENT));
  }, [shotLineDistributeQty]);

  const selectedShot = shots.find(s => s.id === selectedShotId) || null;

  const upcToBrand = useMemo(() => {
    const m = new Map<string, { brandId: string; brandName: string; logoUrl?: string }>();
    for (const order of preOrders) {
      for (const item of order.items) {
        const sku = (item.sku || "").toLowerCase();
        if (!sku) continue;
        const bKey = (item.brand || "").toLowerCase();
        const brand = brandMap.get(bKey);
        m.set(sku, {
          brandId: brand?.id || bKey,
          brandName: brand?.name || item.brand || "Unknown",
          logoUrl: brand?.logoUrl,
        });
      }
    }
    return m;
  }, [preOrders, brandMap]);

  const activeShots = useMemo(() => {
    if (shots.length === 0) return null;
    if (selectedShot) return [selectedShot];
    return shots;
  }, [selectedShot, shots]);

  const shotBrandSummary = useMemo(() => {
    if (!activeShots) return null;
    const brandTotals = new Map<string, { brandId: string; brandName: string; logoUrl?: string; totalUnits: number }>();
    for (const shot of activeShots) {
      for (const item of shot.items) {
        const upc = item.upc.toLowerCase();
        const brand = upcToBrand.get(upc);
        const brandId = brand?.brandId || "unknown";
        const brandName = brand?.brandName || "Unknown";
        if (!brandTotals.has(brandId)) {
          brandTotals.set(brandId, { brandId, brandName, logoUrl: brand?.logoUrl, totalUnits: 0 });
        }
        const entry = brandTotals.get(brandId)!;
        entry.totalUnits += Object.values(item.sizes).reduce((s, v) => s + v, 0);
      }
    }
    return Array.from(brandTotals.values()).sort((a, b) => b.totalUnits - a.totalUnits);
  }, [activeShots, upcToBrand]);

  const shotProductsForBrand = useMemo(() => {
    if (!activeShots || !selectedBrand) return null;
    const shotUpcs = new Map<string, number>();
    for (const shot of activeShots) {
      for (const item of shot.items) {
        const brand = upcToBrand.get(item.upc.toLowerCase());
        if (brand?.brandId !== selectedBrand) continue;
        const u = item.upc.toLowerCase();
        const add = Object.values(item.sizes).reduce((s, v) => s + v, 0);
        shotUpcs.set(u, (shotUpcs.get(u) || 0) + add);
      }
    }
    if (shotUpcs.size === 0) return [];
    const acc = new Map<string, { productId: string; productName: string; skus: Set<string> }>();
    for (const order of preOrders) {
      for (const item of order.items) {
        const sku = (item.sku || "").toLowerCase();
        if (!shotUpcs.has(sku)) continue;
        const bKey = (item.brand || "").toLowerCase();
        const bm = brandMap.get(bKey);
        const bid = bm?.id || bKey;
        if (bid !== selectedBrand) continue;
        const pid = item.productId;
        if (!acc.has(pid)) acc.set(pid, { productId: pid, productName: item.productName, skus: new Set() });
        acc.get(pid)!.skus.add(sku);
        acc.get(pid)!.productName = item.productName;
      }
    }
    return Array.from(acc.values())
      .map(p => ({
        productId: p.productId,
        productName: p.productName,
        primarySku: Array.from(p.skus)[0] || "",
        unitsInShot: Array.from(p.skus).reduce((s, sku) => s + (shotUpcs.get(sku) || 0), 0),
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName));
  }, [activeShots, selectedBrand, preOrders, upcToBrand, brandMap]);

  const completedOrdersForShotProduct = useMemo(() => {
    if (!activeShots || !selectedBrand || !selectedShotProductId) return null;
    const shotSkus = new Set<string>();
    for (const shot of activeShots) {
      for (const item of shot.items) {
        const brand = upcToBrand.get(item.upc.toLowerCase());
        if (brand?.brandId === selectedBrand) shotSkus.add(item.upc.toLowerCase());
      }
    }
    const rows: Array<{
      orderId: string;
      orderName: string;
      customerName: string;
      customerEmail: string;
      createdAt: string;
      sku: string;
      size: string;
      qty: number;
    }> = [];
    for (const order of preOrders) {
      if (!isOrderCompleted(order)) continue;
      for (const line of order.items) {
        if (line.productId !== selectedShotProductId) continue;
        const sku = (line.sku || "").toLowerCase();
        if (!shotSkus.has(sku)) continue;
        const cn = String(order.customerName ?? "").trim();
        const cu = String(order.customerUsername ?? "").trim();
        const displayCustomer = cn || cu || "Guest";
        rows.push({
          orderId: order.id,
          orderName: order.orderName || `Order #${order.id.slice(0, 8)}`,
          customerName: displayCustomer,
          customerEmail: order.customerEmail || "",
          createdAt: order.createdAt,
          sku: line.sku,
          size: line.size,
          qty: line.quantity,
        });
      }
    }
    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [activeShots, selectedBrand, selectedShotProductId, preOrders, upcToBrand]);

  /** Per-size quantities in the active shot(s) for the selected product’s SKUs that appear in the shot. */
  const shotSizesForSelectedProduct = useMemo(() => {
    if (!activeShots || !selectedBrand || !selectedShotProductId) return null;
    const shotUpcs = new Set<string>();
    for (const shot of activeShots) {
      for (const item of shot.items) {
        const brand = upcToBrand.get(item.upc.toLowerCase());
        if (brand?.brandId === selectedBrand) shotUpcs.add(item.upc.toLowerCase());
      }
    }
    const productSkus = new Set<string>();
    for (const order of preOrders) {
      for (const line of order.items) {
        if (line.productId !== selectedShotProductId) continue;
        const sku = (line.sku || "").toLowerCase();
        if (!sku || !shotUpcs.has(sku)) continue;
        const bKey = (line.brand || "").toLowerCase();
        const bm = brandMap.get(bKey);
        const bid = bm?.id || bKey;
        if (bid !== selectedBrand) continue;
        productSkus.add(sku);
      }
    }
    const sizeTotals = new Map<string, number>();
    for (const shot of activeShots) {
      for (const shotItem of shot.items) {
        const u = shotItem.upc.toLowerCase();
        if (!productSkus.has(u)) continue;
        for (const [size, qty] of Object.entries(shotItem.sizes)) {
          if (qty <= 0) continue;
          sizeTotals.set(size, (sizeTotals.get(size) || 0) + qty);
        }
      }
    }
    return Array.from(sizeTotals.entries())
      .map(([size, qty]) => ({ size, qty }))
      .sort((a, b) => a.size.localeCompare(b.size, undefined, { numeric: true, sensitivity: "base" }));
  }, [activeShots, selectedBrand, selectedShotProductId, preOrders, upcToBrand, brandMap]);

  const shotProductsForBrandFiltered = useMemo(() => {
    if (!shotProductsForBrand) return null;
    const q = shotProductSearch.trim().toLowerCase();
    if (!q) return shotProductsForBrand;
    return shotProductsForBrand.filter(p =>
      p.productName.toLowerCase().includes(q) ||
      (p.primarySku || "").toLowerCase().includes(q),
    );
  }, [shotProductsForBrand, shotProductSearch]);

  const shotSizesForSelectedProductFiltered = useMemo(() => {
    if (!shotSizesForSelectedProduct) return null;
    const q = shotSizeSearch.trim().toLowerCase();
    if (!q) return shotSizesForSelectedProduct;
    return shotSizesForSelectedProduct.filter(({ size }) =>
      String(size).toLowerCase().includes(q),
    );
  }, [shotSizesForSelectedProduct, shotSizeSearch]);

  const completedOrdersForShotProductFiltered = useMemo(() => {
    if (!completedOrdersForShotProduct) return null;
    if (!selectedShotSize) return completedOrdersForShotProduct;
    return completedOrdersForShotProduct.filter(row =>
      orderLineSizeMatchesShotSize(selectedShotSize, row.size));
  }, [completedOrdersForShotProduct, selectedShotSize]);

  /** Per shot size column: sum of Distribute inputs whose order line size matches that label (same scope as shot chips). */
  const shotSizeDistributedByLabel = useMemo(() => {
    const m = new Map<string, number>();
    if (!selectedShotProductId || !shotSizesForSelectedProduct) return m;
    const shotScope = selectedShotId ?? "__all__";
    const productId = selectedShotProductId;
    const prefix = `${shotScope}|${productId}|`;
    for (const [k, v] of Object.entries(shotLineDistributeQty)) {
      if (!k.startsWith(prefix)) continue;
      const parts = k.split("|");
      if (parts.length < 6) continue;
      const lineSize = parts[4];
      const n = parseInt(String(v), 10);
      if (Number.isNaN(n) || n < 1) continue;
      for (const { size: shotSz } of shotSizesForSelectedProduct) {
        if (orderLineSizeMatchesShotSize(shotSz, lineSize)) {
          m.set(shotSz, (m.get(shotSz) || 0) + n);
          break;
        }
      }
    }
    return m;
  }, [selectedShotId, selectedShotProductId, shotLineDistributeQty, shotSizesForSelectedProduct]);

  const handleShotUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });
      if (rows.length < 2) {
        toast({ title: "Empty file", description: "No data rows found", variant: "destructive" });
        return;
      }
      const headers = (rows[0] as any[]).map((h: any) => String(h).trim());
      const sizeHeaders = headers.slice(1);
      const items: ShotUpload["items"] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] as any[];
        if (!row[0]) continue;
        const upc = String(row[0]).trim();
        const sizes: Record<string, number> = {};
        for (let j = 0; j < sizeHeaders.length; j++) {
          const qty = parseInt(row[j + 1]) || 0;
          if (qty > 0) sizes[sizeHeaders[j]] = qty;
        }
        if (Object.keys(sizes).length > 0) items.push({ upc, sizes });
      }
      if (items.length === 0) {
        toast({ title: "No valid data", description: "No UPCs with quantities found", variant: "destructive" });
        return;
      }
      const shot: ShotUpload = { id: Date.now().toString(), date: new Date().toLocaleDateString(), fileName: file.name, items };
      setShots(prev => [...prev, shot]);
      setSelectedShotId(shot.id);
      setSelectedBrand(null);
      setSelectedShotProductId(null);
      setSelectedShotSize(null);
      setShotProductSearch("");
      setShotSizeSearch("");
      setSelectedCustomer(null);
      setShowUploadModal(false);
      toast({ title: "Shot uploaded", description: `${items.length} UPCs loaded from ${file.name}` });
    };
    reader.readAsArrayBuffer(file);
  };

  const deleteShot = (shotId: string) => {
    setShots(prev => prev.filter(s => s.id !== shotId));
    setShotLineDistributeQty((prev) => {
      const p = `${shotId}|`;
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (k.startsWith(p)) delete next[k];
      }
      return next;
    });
    if (selectedShotId === shotId) { setSelectedShotId(null); setSelectedBrand(null); setSelectedShotProductId(null); setSelectedShotSize(null); setShotProductSearch(""); setShotSizeSearch(""); setSelectedCustomer(null); }
  };

  const shotInventoryById = useMemo(() => {
    const m = new Map<string, { total: number }>();
    for (const s of shots) m.set(s.id, computeShotInventory(s));
    return m;
  }, [shots]);

  const shotDistributedById = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shots) {
      m.set(s.id, distributedForShotChip(s.id, shots, shotLineDistributeQty));
    }
    return m;
  }, [shots, shotLineDistributeQty]);

  const allShotsInventory = useMemo(() => {
    let total = 0;
    for (const s of shots) {
      const inv = shotInventoryById.get(s.id);
      total += inv?.total ?? 0;
    }
    const distributed = sumAllDistributedValues(shotLineDistributeQty);
    return { total, distributed };
  }, [shots, shotInventoryById, shotLineDistributeQty]);

  const sortedBrands = useMemo(() =>
    Array.from(brandIndex.values())
      .filter(b => !brandSearch || b.brandName.toLowerCase().includes(brandSearch.toLowerCase()))
      .sort((a, b) => b.totalUnits - a.totalUnits),
    [brandIndex, brandSearch],
  );

  const selectedBrandData = selectedBrand ? brandIndex.get(selectedBrand) : null;
  const sortedCustomers = useMemo(() =>
    selectedBrandData
      ? Array.from(selectedBrandData.customers.values()).sort((a, b) => b.totalUnits - a.totalUnits)
      : [],
    [selectedBrandData],
  );
  const selectedCustomerData = selectedCustomer
    ? selectedBrandData?.customers.get(selectedCustomer)
    : null;

  const selectedOrderData = selectedOrderId
    ? selectedCustomerData?.orders.find(o => o.order.id === selectedOrderId)
    : null;

  // UPC search results
  const upcResults = useMemo(() => {
    const q = upcSearch.trim().toLowerCase();
    if (!q) return null;
    const exact = skuIndex.get(q);
    if (exact) return exact;
    const partial: typeof exact = [];
    for (const [sku, entries] of skuIndex) {
      if (sku.includes(q)) partial.push(...entries);
    }
    return partial.length > 0 ? partial : null;
  }, [upcSearch, skuIndex]);

  // Available supply for allocation
  const getSupplyForItem = (productId: string, size: string) => {
    const results: Array<ShipmentItem & { shipmentRef: string }> = [];
    for (const s of shipments) {
      for (const item of s.items) {
        if (item.productId === productId && item.size === size) {
          const available = item.quantityReceived - item.quantityAllocated;
          if (available > 0) results.push({ ...item, shipmentRef: s.referenceNumber, availableToAllocate: available });
        }
      }
    }
    return results;
  };

  const shotDistributeLineKey = (
    shotScope: string,
    productId: string,
    row: { orderId: string; sku: string; size: string },
    idx: number,
  ) => `${shotScope}|${productId}|${row.orderId}|${row.sku}|${row.size}|${idx}`;

  const commitShotDistributeQty = (key: string, orderedQty: number) => {
    setShotLineDistributeQty((prev) => {
      const raw = prev[key];
      if (raw === undefined || String(raw).trim() === "") {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      const n = parseInt(String(raw), 10);
      if (Number.isNaN(n) || n < 1) {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: String(Math.min(orderedQty, n)) };
    });
  };

  if (loadingOrders) return <LoadingSpinner />;

  return (
    <div className="space-y-2">
      {/* ─── Upload + Shot bar ─── */}
      <div className="bg-white rounded-lg border border-gray-200 px-3 py-2 flex flex-wrap items-center gap-2 shadow-sm">
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-md hover:bg-indigo-700 transition-colors flex-shrink-0"
        >
          <Upload className="w-3.5 h-3.5" /> Upload Shot
        </button>
        {shots.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => { setSelectedShotId(null); setSelectedBrand(null); setSelectedShotProductId(null); setSelectedShotSize(null); setShotProductSearch(""); setShotSizeSearch(""); setSelectedCustomer(null); setSelectedOrderId(null); }}
              className={cn("px-2.5 py-1.5 text-left rounded-md transition-colors min-w-[7.5rem]",
                !selectedShotId ? "bg-gray-900 text-white shadow-sm" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}
              title="All uploaded shots combined"
            >
              <span className="text-[11px] font-semibold leading-tight block">All shots</span>
              <div className={cn("mt-1 flex flex-wrap gap-0.5", !selectedShotId ? "text-white/95" : "")}>
                <span className={cn("rounded px-1 py-px text-[9px] tabular-nums font-medium leading-tight", !selectedShotId ? "bg-white/15" : "bg-white text-gray-600 ring-1 ring-gray-200/80")}>
                  {allShotsInventory.total} in shot
                </span>
                <span className={cn("rounded px-1 py-px text-[9px] tabular-nums font-medium leading-tight", !selectedShotId ? "bg-emerald-400/25" : "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100")}>
                  {allShotsInventory.distributed} assigned
                </span>
              </div>
            </button>
            {shots.map(shot => {
              const inv = shotInventoryById.get(shot.id) || { total: 0 };
              const dist = shotDistributedById.get(shot.id) ?? 0;
              return (
              <div key={shot.id} className="flex items-stretch">
                <button
                  onClick={() => { setSelectedShotId(shot.id); setSelectedBrand(null); setSelectedShotProductId(null); setSelectedShotSize(null); setShotProductSearch(""); setShotSizeSearch(""); setSelectedCustomer(null); setSelectedOrderId(null); }}
                  className={cn("px-2.5 py-1.5 rounded-l-md transition-colors flex flex-col items-stretch leading-tight text-left min-w-[6.75rem]",
                    selectedShotId === shot.id ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}
                  title={shot.fileName}
                >
                  <span className="flex items-center gap-1 text-[10px] font-medium">
                    <Calendar className="w-3 h-3 flex-shrink-0 opacity-90" />
                    <span className="tabular-nums">{shot.date}</span>
                  </span>
                  <div className={cn("mt-0.5 flex flex-wrap gap-0.5", selectedShotId === shot.id ? "text-white/95" : "")}>
                    <span className={cn("rounded px-1 py-px text-[9px] tabular-nums font-medium leading-tight", selectedShotId === shot.id ? "bg-white/15" : "bg-white text-gray-600 ring-1 ring-gray-200/80")}>
                      {inv.total} in shot
                    </span>
                    <span className={cn("rounded px-1 py-px text-[9px] tabular-nums font-medium leading-tight", selectedShotId === shot.id ? "bg-emerald-400/25" : "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100")}>
                      {dist} assigned
                    </span>
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteShot(shot.id); }}
                  className={cn("px-1 py-1 text-[10px] rounded-r-md transition-colors self-stretch flex items-center",
                    selectedShotId === shot.id ? "bg-indigo-700 text-white/70 hover:text-white" : "bg-gray-100 text-gray-400 hover:text-red-500")}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Main layout ─── */}
      <div className="flex gap-0 h-[calc(100vh-11.5rem)] min-h-[360px] sm:min-h-[420px]">
      {/* ─── Shot drill-down sidebar: brands → products → sizes (single column) ─── */}
      <div className="w-[260px] sm:w-[280px] min-h-0 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col rounded-l-lg overflow-hidden">
        {activeShots && shotBrandSummary ? (
          <>
            {!selectedBrand && (
              <>
                <div className="px-2.5 pt-2 pb-1.5 border-b border-gray-100 bg-white">
                  <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Brands in shot</p>
                  <p className="text-[10px] text-gray-400 mt-px leading-tight">Select a brand</p>
                </div>
                <div className="px-2.5 py-1.5 border-b border-gray-100 bg-gray-50/60 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search brands..."
                      value={brandSearch}
                      onChange={e => setBrandSearch(e.target.value)}
                      className="w-full pl-7 pr-2 py-1.5 bg-white border border-gray-200 rounded-md text-[11px] shadow-sm focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-400 outline-none"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {shotBrandSummary.filter(b => !brandSearch || b.brandName.toLowerCase().includes(brandSearch.toLowerCase())).length === 0 ? (
                    <div className="p-6 text-center">
                      <Tags className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-xs text-gray-400">No matching brands in shot</p>
                    </div>
                  ) : (
                    shotBrandSummary
                      .filter(b => !brandSearch || b.brandName.toLowerCase().includes(brandSearch.toLowerCase()))
                      .map(b => (
                        <button
                          key={b.brandId}
                          type="button"
                          onClick={() => { setSelectedBrand(b.brandId); setSelectedShotProductId(null); setSelectedShotSize(null); setShotProductSearch(""); setShotSizeSearch(""); setSelectedCustomer(null); setSelectedOrderId(null); setUpcSearch(""); }}
                          className={cn(
                            "w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors border-b border-gray-50/80 border-l-[3px] border-l-transparent",
                            selectedBrand === b.brandId ? "bg-indigo-50/90 border-l-indigo-600" : "hover:bg-gray-50",
                          )}
                        >
                          {b.logoUrl ? (
                            <img src={b.logoUrl} alt="" className="w-7 h-7 rounded-md object-contain bg-gray-50 p-0.5 ring-1 ring-gray-100" />
                          ) : (
                            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center ring-1 ring-gray-100">
                              <Tags className="w-3.5 h-3.5 text-gray-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-xs font-semibold truncate leading-snug", selectedBrand === b.brandId ? "text-indigo-800" : "text-gray-900")}>{b.brandName}</p>
                            <p className="text-[10px] text-gray-500">{b.totalUnits} in shot</p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                        </button>
                      ))
                  )}
                </div>
              </>
            )}

            {selectedBrand && !selectedShotProductId && (
              <>
                <div className="shrink-0 flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-200 bg-gradient-to-b from-slate-50 to-gray-50/80">
                  <button
                    type="button"
                    aria-label="Back to brands"
                    onClick={() => { setSelectedBrand(null); setSelectedShotProductId(null); setSelectedShotSize(null); setShotProductSearch(""); setShotSizeSearch(""); setSelectedCustomer(null); setSelectedOrderId(null); }}
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white hover:text-gray-900 hover:shadow-sm ring-1 ring-transparent hover:ring-gray-200/80"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2.25} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Products</p>
                    <p className="text-[11px] font-semibold text-gray-900 truncate leading-tight">{shotBrandSummary.find(br => br.brandId === selectedBrand)?.brandName || ""}</p>
                  </div>
                </div>
                <div className="px-2.5 py-1.5 border-b border-gray-100 bg-gray-50/60 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={shotProductSearch}
                      onChange={e => setShotProductSearch(e.target.value)}
                      className="w-full pl-7 pr-2 py-1.5 bg-white border border-gray-200 rounded-md text-[11px] shadow-sm focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-400 outline-none"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {!shotProductsForBrand || shotProductsForBrand.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-400">No products in shot for this brand</div>
                  ) : !shotProductsForBrandFiltered || shotProductsForBrandFiltered.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-400">No matching products</div>
                  ) : (
                    shotProductsForBrandFiltered.map(p => (
                      <button
                        key={p.productId}
                        type="button"
                        onClick={() => { setSelectedShotProductId(p.productId); setSelectedShotSize(null); setShotSizeSearch(""); setSelectedCustomer(null); setSelectedOrderId(null); }}
                        className={cn(
                          "w-full flex items-start gap-1.5 px-2.5 py-1.5 border-b border-gray-50/80 text-left transition-colors border-l-[3px]",
                          selectedShotProductId === p.productId ? "bg-violet-50/95 border-l-violet-600 pl-[7px]" : "border-l-transparent hover:bg-gray-50 pl-2.5",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-[11px] font-semibold line-clamp-2 leading-snug", selectedShotProductId === p.productId ? "text-violet-900" : "text-gray-900")}>{p.productName}</p>
                          <p className="text-[9px] text-gray-500 font-mono truncate mt-0.5">{p.primarySku}</p>
                          <p className="text-[9px] text-gray-500">{p.unitsInShot} in shot</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-px" />
                      </button>
                    ))
                  )}
                </div>
              </>
            )}

            {selectedBrand && selectedShotProductId && (
              <>
                <div className="shrink-0 flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-200 bg-gradient-to-b from-slate-50 to-gray-50/80">
                  <button
                    type="button"
                    aria-label="Back to products"
                    onClick={() => { setSelectedShotProductId(null); setSelectedShotSize(null); setShotSizeSearch(""); }}
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white hover:text-gray-900 hover:shadow-sm ring-1 ring-transparent hover:ring-gray-200/80"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2.25} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Sizes</p>
                    <p className="text-[11px] font-semibold text-gray-900 line-clamp-2 leading-tight">{shotProductsForBrand?.find(pr => pr.productId === selectedShotProductId)?.productName || ""}</p>
                  </div>
                </div>
                <div className="px-2.5 py-1.5 border-b border-gray-100 bg-gray-50/60 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search sizes..."
                      value={shotSizeSearch}
                      onChange={e => setShotSizeSearch(e.target.value)}
                      className="w-full pl-7 pr-2 py-1.5 bg-white border border-gray-200 rounded-md text-[11px] shadow-sm focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-400 outline-none"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {!shotSizesForSelectedProduct || shotSizesForSelectedProduct.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-400">No size rows for this product in the shot</div>
                  ) : !shotSizesForSelectedProductFiltered || shotSizesForSelectedProductFiltered.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-400">No matching sizes</div>
                  ) : (
                    shotSizesForSelectedProductFiltered.map(({ size, qty }) => {
                      const isSel = selectedShotSize === size;
                      const dist = shotSizeDistributedByLabel.get(size) ?? 0;
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setSelectedShotSize(prev => (prev === size ? null : size))}
                          title={`${qty} units in this shot upload`}
                          className={cn(
                            "active:scale-[0.99] w-full flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-gray-50/80 text-left transition-colors border-l-[3px]",
                            isSel ? "bg-slate-50 border-l-indigo-600 pl-[7px]" : "border-l-transparent hover:bg-gray-50 pl-2.5",
                          )}
                        >
                          <span className={cn("text-xs font-semibold tabular-nums", isSel ? "text-indigo-950" : "text-gray-900")}>{size}</span>
                          <div className="flex flex-col items-end gap-px shrink-0">
                            <span className={cn("text-[9px] tabular-nums font-medium", isSel ? "text-slate-600" : "text-gray-500")}>
                              {qty} in shot
                            </span>
                            {dist > 0 ? (
                              <span className={cn("text-[9px] tabular-nums font-semibold", isSel ? "text-indigo-700" : "text-indigo-600")}>
                                {dist} assigned
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-center flex-1">
            <Upload className="w-8 h-8 text-gray-200 mb-2" />
            <p className="text-xs font-medium text-gray-400">No shots uploaded</p>
            <p className="text-[10px] text-gray-300 mt-0.5">Upload a shot to see brands</p>
          </div>
        )}
      </div>

      {/* ─── Main Content Area ─── */}
      <div className="flex-1 bg-white rounded-r-lg border border-l-0 border-gray-200 flex flex-col overflow-hidden">
        {/* UPC Search Bar */}
        <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
          <ScanBarcode className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <div className="relative flex-1 max-w-md min-w-0">
            <Hash className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
            <input
              type="text"
              placeholder="UPC / SKU…"
              value={upcSearch}
              onChange={e => { setUpcSearch(e.target.value); if (e.target.value) { setSelectedOrderId(null); setSelectedShotProductId(null); setSelectedShotSize(null); setShotProductSearch(""); setShotSizeSearch(""); } }}
              className="w-full pl-7 pr-7 py-1.5 border border-gray-200 rounded-md text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
            {upcSearch && (
              <button type="button" onClick={() => setUpcSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100">
                <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
          {upcResults && (
            <span className="text-[10px] text-gray-500 whitespace-nowrap">{upcResults.length} hit{upcResults.length !== 1 ? "s" : ""}</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {/* ─── UPC Search Results ─── */}
          {upcSearch.trim() && upcResults ? (
            <UPCSearchResults
              results={upcResults}
              query={upcSearch}
              getSupply={getSupplyForItem}
              onAllocate={(si, oid, pid, sku, size, qty) => allocateMutation.mutate({ shipmentItemId: si, orderId: oid, productId: pid, sku, size, quantity: qty })}
              isAllocating={allocateMutation.isPending}
              onInitFulfillment={(oid) => initFulfillment.mutate(oid)}
            />
          ) : upcSearch.trim() && !upcResults ? (
            <div className="flex flex-col items-center justify-center py-10">
              <ScanBarcode className="w-9 h-9 text-gray-300 mb-2" />
              <p className="text-xs text-gray-400">No orders for “{upcSearch}”</p>
            </div>
          ) : !selectedBrand ? (
            <div className="flex flex-col items-center justify-center h-full py-10">
              <Tags className="w-12 h-12 text-gray-200 mb-2" />
              <p className="text-sm font-medium text-gray-400">Select a brand</p>
              <p className="text-xs text-gray-400 mt-0.5 text-center px-4">{activeShots ? "Choose a brand from the shot" : "Upload a shot to get started"}</p>
            </div>
          ) : activeShots && selectedBrand && !selectedShotProductId ? (
            <div className="flex flex-col items-center justify-center h-full py-10 px-4 text-center">
              <Boxes className="w-11 h-11 text-gray-200 mb-2" />
              <p className="text-sm font-medium text-gray-500">Select a product</p>
              <p className="text-xs text-gray-400 mt-0.5 max-w-sm leading-snug">Pick a product in the sidebar for completed orders that match the shot.</p>
            </div>
          ) : activeShots && selectedBrand && selectedShotProductId ? (
            <>
              {!completedOrdersForShotProduct || completedOrdersForShotProduct.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 py-10 text-center">
                  <CheckCircle2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">No completed orders for this product.</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Orders need workflow or status “completed”.</p>
                </div>
              ) : !completedOrdersForShotProductFiltered || completedOrdersForShotProductFiltered.length === 0 ? (
                <div className="rounded-lg border border-dashed border-emerald-200/80 bg-emerald-50/40 py-10 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-200 mx-auto mb-2" />
                  <p className="text-xs text-gray-600">No lines for size <span className="font-semibold text-emerald-800">{selectedShotSize}</span>.</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Pick another size or click the size again to clear.</p>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 shadow-sm overflow-hidden bg-white">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wide">
                        <th className="text-left px-3 py-1.5 font-semibold">Customer</th>
                        <th className="text-left px-3 py-1.5 font-semibold">Order</th>
                        <th className="text-left px-3 py-1.5 font-semibold">SKU</th>
                        <th className="text-left px-3 py-1.5 font-semibold">Size</th>
                        <th className="text-center px-3 py-1.5 font-semibold">Qty</th>
                        {selectedShotSize ? (
                          <th
                            className="text-center px-2 py-1.5 font-semibold bg-slate-50 text-slate-700 border-x border-slate-200/90"
                            title="Up to line quantity · saved in this browser"
                          >
                            <span className="normal-case tracking-normal text-[11px] text-slate-800">Assign</span>
                          </th>
                        ) : null}
                        <th className="text-left px-3 py-1.5 font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {completedOrdersForShotProductFiltered.map((row, idx) => {
                        const shotScope = selectedShotId ?? "__all__";
                        const pid = selectedShotProductId ?? "";
                        const dKey = shotDistributeLineKey(shotScope, pid, row, idx);
                        const draftVal = shotLineDistributeQty[dKey];
                        const distShown = (() => {
                          const n = parseInt(String(draftVal ?? ""), 10);
                          if (Number.isNaN(n) || n < 1) return 0;
                          return Math.min(row.qty, n);
                        })();
                        return (
                        <tr key={`${row.orderId}-${row.sku}-${row.size}-${idx}`} className="hover:bg-gray-50/50">
                          <td className="px-3 py-1.5">
                            <p className="text-xs font-medium text-gray-900 leading-snug">{row.customerName}</p>
                            {row.customerEmail ? (
                              <p className="text-[10px] text-gray-400 truncate max-w-[200px] mt-px">{row.customerEmail}</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 leading-snug">{row.orderName}</td>
                          <td className="px-3 py-1.5 text-[10px] font-mono text-gray-600">{row.sku}</td>
                          <td className="px-3 py-1.5 text-xs tabular-nums text-gray-700">{row.size}</td>
                          <td className="px-3 py-1.5 text-xs text-center align-middle tabular-nums">
                            <span className="font-semibold text-gray-900 block">{row.qty}</span>
                            {selectedShotSize && distShown > 0 ? (
                              <span className="inline-flex mt-0.5 rounded-full bg-indigo-50 text-indigo-800 px-1.5 py-px text-[9px] font-semibold ring-1 ring-indigo-100/80">
                                {distShown} assigned
                              </span>
                            ) : null}
                          </td>
                          {selectedShotSize ? (
                            <td className="px-2 py-1.5 align-middle bg-slate-50/40 border-x border-slate-100">
                              <div className="flex flex-col items-center gap-0.5">
                                <div className="inline-flex items-stretch rounded-lg border border-slate-200/90 bg-white shadow-sm overflow-hidden">
                                  <button
                                    type="button"
                                    aria-label="Decrease assigned quantity"
                                    className="flex h-7 w-7 items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-35 disabled:pointer-events-none transition-colors"
                                    disabled={!draftVal || String(draftVal).trim() === "" || (parseInt(String(draftVal), 10) || 0) <= 0}
                                    onClick={() => {
                                      const n = parseInt(String(draftVal), 10);
                                      if (Number.isNaN(n) || n <= 1) {
                                        setShotLineDistributeQty((prev) => {
                                          const { [dKey]: _r, ...rest } = prev;
                                          return rest;
                                        });
                                      } else {
                                        setShotLineDistributeQty((prev) => ({ ...prev, [dKey]: String(n - 1) }));
                                      }
                                    }}
                                  >
                                    <Minus className="w-3.5 h-3.5" strokeWidth={2.25} />
                                  </button>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    placeholder="—"
                                    aria-label={`Assign quantity for ${row.customerName}, up to ${row.qty}`}
                                    title={`1–${row.qty}`}
                                    value={draftVal ?? ""}
                                    onChange={(e) => {
                                      const next = e.target.value.trim();
                                      if (next === "") {
                                        setShotLineDistributeQty((prev) => {
                                          const { [dKey]: _r, ...rest } = prev;
                                          return rest;
                                        });
                                        return;
                                      }
                                      if (!/^\d+$/.test(next)) return;
                                      const n = parseInt(next, 10);
                                      if (n < 1 || n > row.qty) return;
                                      setShotLineDistributeQty((prev) => ({ ...prev, [dKey]: String(n) }));
                                    }}
                                    onBlur={() => commitShotDistributeQty(dKey, row.qty)}
                                    className={cn(
                                      "w-9 min-w-[2.25rem] border-x border-slate-200/90 bg-white py-1.5 text-center text-xs tabular-nums",
                                      "placeholder:text-slate-300",
                                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/50",
                                    )}
                                  />
                                  <button
                                    type="button"
                                    aria-label="Increase assigned quantity"
                                    className="flex h-7 w-7 items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-35 disabled:pointer-events-none transition-colors"
                                    disabled={(() => {
                                      const n = parseInt(String(draftVal ?? ""), 10);
                                      if (Number.isNaN(n) || !draftVal) return false;
                                      return n >= row.qty;
                                    })()}
                                    onClick={() => {
                                      const n = parseInt(String(draftVal ?? ""), 10);
                                      const next = Number.isNaN(n) || !draftVal ? 1 : n + 1;
                                      if (next > row.qty) return;
                                      if (next < 1) return;
                                      setShotLineDistributeQty((prev) => ({ ...prev, [dKey]: String(next) }));
                                    }}
                                  >
                                    <Plus className="w-3.5 h-3.5" strokeWidth={2.25} />
                                  </button>
                                </div>
                                <span className="text-[9px] text-slate-400 tabular-nums">max {row.qty}</span>
                              </div>
                            </td>
                          ) : null}
                          <td className="px-3 py-1.5 text-[10px] text-gray-500 whitespace-nowrap tabular-nums">{new Date(row.createdAt).toLocaleDateString()}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : !selectedCustomer ? (
            <BrandCustomerList
              brandData={selectedBrandData!}
              customers={sortedCustomers}
              onSelectCustomer={(id) => { setSelectedCustomer(id); setSelectedOrderId(null); }}
            />
          ) : !selectedOrderId ? (
            <CustomerOrderList
              customerData={selectedCustomerData!}
              brandName={selectedBrandData!.brandName}
              onSelectOrder={(id) => {
                setSelectedOrderId(id);
                const o = selectedCustomerData?.orders.find(o => o.order.id === id);
                if (o && o.order.fulfillmentDetails.length === 0) initFulfillment.mutate(id);
              }}
              onBack={() => setSelectedCustomer(null)}
            />
          ) : (
            <OrderAllocationView
              orderData={selectedOrderData!}
              brandName={selectedBrandData!.brandName}
              customerName={selectedCustomerData!.customerName}
              getSupply={getSupplyForItem}
              onAllocate={(si, oid, pid, sku, size, qty) => allocateMutation.mutate({ shipmentItemId: si, orderId: oid, productId: pid, sku, size, quantity: qty })}
              isAllocating={allocateMutation.isPending}
              onBack={() => setSelectedOrderId(null)}
            />
          )}
        </div>
      </div>

      </div>

      {/* Upload Shot Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowUploadModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600" /> Upload Shot Excel
              </h3>
              <button onClick={() => setShowUploadModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-600">Upload an Excel file with UPCs and size-based quantities. The first column should be UPC/SKU, and remaining columns are sizes with quantities underneath.</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-700 mb-2">Expected Template:</p>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr className="bg-indigo-50">
                      <th className="border border-gray-300 px-3 py-1.5 font-semibold text-indigo-700">UPC</th>
                      <th className="border border-gray-300 px-3 py-1.5 font-semibold text-indigo-700">38</th>
                      <th className="border border-gray-300 px-3 py-1.5 font-semibold text-indigo-700">39</th>
                      <th className="border border-gray-300 px-3 py-1.5 font-semibold text-indigo-700">40</th>
                      <th className="border border-gray-300 px-3 py-1.5 font-semibold text-indigo-700">41</th>
                      <th className="border border-gray-300 px-3 py-1.5 font-semibold text-indigo-700">42</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-gray-300 px-3 py-1.5 font-mono text-gray-600">ABC123456</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-center text-gray-600">5</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-center text-gray-600">10</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-center text-gray-600">8</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-center text-gray-600">12</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-center text-gray-600">6</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-3 py-1.5 font-mono text-gray-600">XYZ789012</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-center text-gray-600">3</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-center text-gray-600">7</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-center text-gray-600">5</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-center text-gray-600">9</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-center text-gray-600">4</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">First column = UPC/SKU, remaining columns = sizes with quantities per UPC</p>
            </div>
            <div className="flex items-center justify-center pt-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleShotUpload(file);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
              >
                <Upload className="w-4 h-4" /> Choose Excel File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Brand > Customer List ──────────────────────────────────────────────

function BrandCustomerList({ brandData, customers, onSelectCustomer }: {
  brandData: { brandName: string; logoUrl?: string; totalUnits: number; totalCustomers: number };
  customers: Array<{ customerId: string; customerName: string; customerEmail: string; orders: any[]; totalUnits: number }>;
  onSelectCustomer: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {brandData.logoUrl ? (
          <img src={brandData.logoUrl} alt="" className="w-10 h-10 rounded-lg object-contain bg-gray-50 p-1" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
            <Tags className="w-5 h-5 text-indigo-500" />
          </div>
        )}
        <div>
          <h3 className="text-lg font-bold text-gray-900">{brandData.brandName}</h3>
          <p className="text-xs text-gray-400">{brandData.totalCustomers} customers &middot; {brandData.totalUnits} total units ordered</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {customers.map(c => (
          <button
            key={c.customerId}
            onClick={() => onSelectCustomer(c.customerId)}
            className="bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-indigo-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">{c.customerName}</p>
                {c.customerEmail && <p className="text-xs text-gray-400 truncate">{c.customerEmail}</p>}
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-gray-500">
                    <ShoppingBag className="w-3 h-3 inline mr-1" />{c.orders.length} order{c.orders.length !== 1 ? "s" : ""}
                  </span>
                  <span className="text-xs font-semibold text-indigo-600">{c.totalUnits} units</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 mt-1 flex-shrink-0" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Customer > Orders List ─────────────────────────────────────────────

function CustomerOrderList({ customerData, brandName, onSelectOrder, onBack }: {
  customerData: { customerName: string; customerEmail: string; orders: Array<{ order: PreOrder; brandItems: PreOrder["items"] }>; totalUnits: number };
  brandName: string;
  onSelectOrder: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronDown className="w-4 h-4 text-gray-500 rotate-90" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
            <User className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">{customerData.customerName}</h3>
            <p className="text-xs text-gray-400">{brandName} &middot; {customerData.totalUnits} units across {customerData.orders.length} orders</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {customerData.orders.map(({ order, brandItems }) => {
          const totalQty = brandItems.reduce((s, i) => s + i.quantity, 0);
          const fMap = new Map<string, FulfillmentRecord>();
          for (const f of order.fulfillmentDetails) fMap.set(`${f.productId}|${f.size}`, f);
          const totalFulfilled = brandItems.reduce((s, i) => {
            const f = fMap.get(`${i.productId}|${i.size}`);
            return s + (f?.quantityFulfilled || 0);
          }, 0);

          return (
            <button
              key={order.id}
              onClick={() => onSelectOrder(order.id)}
              className="w-full bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-indigo-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                    {order.orderName || `Order #${order.id.slice(0, 8)}`}
                  </p>
                  <p className="text-xs text-gray-400">{new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400" />
              </div>

              <div className="space-y-1.5">
                {brandItems.map((item, idx) => {
                  const f = fMap.get(`${item.productId}|${item.size}`);
                  const filled = f?.quantityFulfilled || 0;
                  return (
                    <div key={idx} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-1.5">
                      <span className="text-gray-700 truncate flex-1">{item.productName}</span>
                      <span className="text-gray-400 mx-2">Size {item.size}</span>
                      <span className="font-mono">
                        <span className={filled >= item.quantity ? "text-emerald-600 font-semibold" : filled > 0 ? "text-amber-600 font-semibold" : "text-gray-500"}>
                          {filled}
                        </span>
                        <span className="text-gray-300">/{item.quantity}</span>
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <ProgressBar fulfilled={totalFulfilled} ordered={totalQty} />
                <Badge status={totalFulfilled >= totalQty ? "fulfilled" : totalFulfilled > 0 ? "partially_fulfilled" : "unfulfilled"} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Order Detail + Inline Allocation ───────────────────────────────────

function OrderAllocationView({ orderData, brandName, customerName, getSupply, onAllocate, isAllocating, onBack }: {
  orderData: { order: PreOrder; brandItems: PreOrder["items"] };
  brandName: string;
  customerName: string;
  getSupply: (productId: string, size: string) => Array<ShipmentItem & { shipmentRef: string; availableToAllocate?: number }>;
  onAllocate: (shipmentItemId: string, orderId: string, productId: string, sku: string, size: string, quantity: number) => void;
  isAllocating: boolean;
  onBack: () => void;
}) {
  const { order, brandItems } = orderData;
  const fMap = new Map<string, FulfillmentRecord>();
  for (const f of order.fulfillmentDetails) fMap.set(`${f.productId}|${f.size}`, f);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronDown className="w-4 h-4 text-gray-500 rotate-90" />
        </button>
        <div>
          <h3 className="text-base font-bold text-gray-900">{order.orderName || `Order #${order.id.slice(0, 8)}`}</h3>
          <p className="text-xs text-gray-400">{customerName} &middot; {brandName} &middot; {new Date(order.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="space-y-3">
        {brandItems.map((item, idx) => {
          const f = fMap.get(`${item.productId}|${item.size}`);
          const fulfilled = f?.quantityFulfilled || 0;
          const remaining = item.quantity - fulfilled;
          const supply = getSupply(item.productId, item.size);

          return (
            <AllocateLineCard
              key={`${item.productId}-${item.size}-${idx}`}
              item={item}
              fulfilled={fulfilled}
              remaining={remaining}
              supply={supply}
              orderId={order.id}
              onAllocate={onAllocate}
              isAllocating={isAllocating}
            />
          );
        })}
      </div>
    </div>
  );
}

function AllocateLineCard({ item, fulfilled, remaining, supply, orderId, onAllocate, isAllocating }: {
  item: PreOrder["items"][0];
  fulfilled: number;
  remaining: number;
  supply: Array<ShipmentItem & { shipmentRef: string; availableToAllocate?: number }>;
  orderId: string;
  onAllocate: (shipmentItemId: string, orderId: string, productId: string, sku: string, size: string, quantity: number) => void;
  isAllocating: boolean;
}) {
  const [selectedSource, setSelectedSource] = useState("");
  const [qty, setQty] = useState(0);
  const maxQty = Math.min(remaining, supply.find(s => s.id === selectedSource)?.availableToAllocate || 0);

  return (
    <div className={cn(
      "border rounded-xl p-4 transition-colors",
      remaining === 0 ? "border-emerald-200 bg-emerald-50/30" : "border-gray-200 bg-white",
    )}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{item.productName}</p>
          <p className="text-xs text-gray-400 font-mono">{item.sku} &middot; Size {item.size}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Fulfilled</span>
              <span className={cn(
                "text-sm font-bold",
                remaining === 0 ? "text-emerald-600" : fulfilled > 0 ? "text-amber-600" : "text-gray-400",
              )}>{fulfilled}</span>
              <span className="text-xs text-gray-300">/</span>
              <span className="text-sm font-bold text-gray-900">{item.quantity}</span>
            </div>
          </div>
          <Badge status={remaining === 0 ? "fulfilled" : fulfilled > 0 ? "partially_fulfilled" : "unfulfilled"} />
        </div>
      </div>

      {remaining > 0 && (
        <div className="bg-gray-50 rounded-lg p-3">
          {supply.length === 0 ? (
            <p className="text-xs text-gray-400 italic flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> No received stock available for this item
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedSource}
                onChange={e => { setSelectedSource(e.target.value); setQty(0); }}
                className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none min-w-[180px]"
              >
                <option value="">Select shipment source...</option>
                {supply.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.shipmentRef} — {s.availableToAllocate} avail.
                  </option>
                ))}
              </select>
              {selectedSource && (
                <>
                  <input
                    type="number"
                    min={1}
                    max={maxQty}
                    value={qty || ""}
                    placeholder="Qty"
                    onChange={e => setQty(Math.min(parseInt(e.target.value) || 0, maxQty))}
                    className="w-20 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <span className="text-[11px] text-gray-400">of {remaining} needed</span>
                  <button
                    onClick={() => {
                      if (qty > 0) {
                        onAllocate(selectedSource, orderId, item.productId, item.sku, item.size, qty);
                        setSelectedSource("");
                        setQty(0);
                      }
                    }}
                    disabled={qty <= 0 || isAllocating}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" /> Allocate
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── UPC Search Results ─────────────────────────────────────────────────

function UPCSearchResults({ results, query, getSupply, onAllocate, isAllocating, onInitFulfillment }: {
  results: Array<{ order: PreOrder; item: PreOrder["items"][0]; customerName: string; customerEmail: string; fulfillment?: FulfillmentRecord }>;
  query: string;
  getSupply: (productId: string, size: string) => Array<ShipmentItem & { shipmentRef: string; availableToAllocate?: number }>;
  onAllocate: (shipmentItemId: string, orderId: string, productId: string, sku: string, size: string, quantity: number) => void;
  isAllocating: boolean;
  onInitFulfillment: (orderId: string) => void;
}) {
  // Group by customer
  const byCustomer = useMemo(() => {
    const m = new Map<string, {
      customerName: string;
      customerEmail: string;
      entries: typeof results;
      totalOrdered: number;
      totalFulfilled: number;
    }>();
    for (const r of results) {
      const key = r.order.userId || r.customerName;
      if (!m.has(key)) m.set(key, { customerName: r.customerName, customerEmail: r.customerEmail, entries: [], totalOrdered: 0, totalFulfilled: 0 });
      const g = m.get(key)!;
      g.entries.push(r);
      g.totalOrdered += r.item.quantity;
      g.totalFulfilled += r.fulfillment?.quantityFulfilled || 0;
    }
    return Array.from(m.values()).sort((a, b) => b.totalOrdered - a.totalOrdered);
  }, [results]);

  const totalUnits = results.reduce((s, r) => s + r.item.quantity, 0);
  const productName = results[0]?.item.productName || query;

  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-violet-50">
          <ScanBarcode className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">{productName}</h3>
          <p className="text-xs text-gray-400">
            UPC/SKU: <span className="font-mono font-semibold text-gray-600">{query}</span> &middot; {byCustomer.length} customer{byCustomer.length !== 1 ? "s" : ""} &middot; {totalUnits} total units
          </p>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{byCustomer.length}</p>
          <p className="text-xs text-blue-500">Customers</p>
        </div>
        <div className="bg-indigo-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-indigo-700">{totalUnits}</p>
          <p className="text-xs text-indigo-500">Total Ordered</p>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-emerald-700">{results.reduce((s, r) => s + (r.fulfillment?.quantityFulfilled || 0), 0)}</p>
          <p className="text-xs text-emerald-500">Fulfilled</p>
        </div>
      </div>

      {/* Customer breakdown */}
      <div className="space-y-2">
        {byCustomer.map((group) => {
          const isExpanded = expandedCustomer === group.customerName;
          return (
            <div key={group.customerName} className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedCustomer(isExpanded ? null : group.customerName)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
                    <User className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-900">{group.customerName}</p>
                    <p className="text-xs text-gray-400">{group.entries.length} line{group.entries.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-sm font-bold text-gray-900">{group.totalOrdered}</span>
                    <span className="text-xs text-gray-400 ml-1">units</span>
                  </div>
                  <ProgressBar fulfilled={group.totalFulfilled} ordered={group.totalOrdered} />
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-gray-50/50">
                  {group.entries.map((entry, idx) => {
                    const fulfilled = entry.fulfillment?.quantityFulfilled || 0;
                    const remaining = entry.item.quantity - fulfilled;
                    const supply = getSupply(entry.item.productId, entry.item.size);

                    if (!entry.fulfillment) {
                      onInitFulfillment(entry.order.id);
                    }

                    return (
                      <AllocateLineCard
                        key={`${entry.order.id}-${entry.item.size}-${idx}`}
                        item={entry.item}
                        fulfilled={fulfilled}
                        remaining={remaining}
                        supply={supply}
                        orderId={entry.order.id}
                        onAllocate={onAllocate}
                        isAllocating={isAllocating}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Utility Components ─────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
      <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}
