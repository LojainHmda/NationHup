import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Home, 
  Package, 
  FileText, 
  Users, 
  LayoutDashboard, 
  Truck, 
  Search, 
  Filter, 
  CheckCircle, 
  Eye, 
  Sparkles,
  X,
  XCircle,
  RefreshCcw,
  MessageSquare,
  Send,
  DollarSign,
  Warehouse,
  ChevronRight,
  ShoppingCart,
  User,
  Mail,
  Calendar,
  Hash,
  Plus,
  LayoutGrid,
  List,
  Box,
  Pencil,
  Phone
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useCartContext } from '@/hooks/useCartContext';
import { useLocation, Link } from 'wouter';
import { useAdminOrderSocket } from '@/hooks/useAdminOrderSocket';
import { useAuth } from '@/hooks/useAuth';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { SHOP_ORDER_EDIT_SESSION_KEY } from '@/lib/shopOrderEditSession';
import type { Order, Product, Brand } from '@shared/schema';
import { ShopCartTable } from '@/components/shop/ShopCartTable';
import { useOrderEditShopCartModel } from '@/hooks/useOrderEditShopCartModel';
import { useCurrency } from '@/contexts/CurrencyContext';
import * as XLSX from 'xlsx';

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  admin: 'Administrator',
  sales: 'Sales Manager',
  finance: 'Finance Manager',
  user: 'Account Manager',
};

type WorkflowStage = 'new_order' | 'account_manager_approval' | 'sales_approval' | 'finance_approval' | 'admin_approval' | 'completed' | 'rejected';

const WORKFLOW_STAGES_DISPLAY: { stage: WorkflowStage; label: string; icon: any }[] = [
  { stage: 'new_order', label: 'New Order', icon: CheckCircle },
  { stage: 'account_manager_approval', label: 'Pending My Approval', icon: Users },
  { stage: 'sales_approval', label: 'Sales Approval', icon: DollarSign },
  { stage: 'finance_approval', label: 'Finance Approval', icon: FileText },
  { stage: 'admin_approval', label: 'Admin Approval', icon: Package },
  { stage: 'completed', label: 'Completed', icon: Package },
];

interface OrderFlowOrder {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  brand: string;
  workflowStage: WorkflowStage;
  date: string;
  /** Server timestamp for table sorting (newest first) */
  createdAt?: string | null;
  total: number;
  items: {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    price: number;
    total: number;
    brand: string;
  }[];
  rawItems: {
    productId: string;
    productName: string;
    sku: string;
    brand: string;
    size: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    color?: string;
    unitsPerCarton?: number;
    /** Set when building a cart in the UI; stripped before API calls */
    isPreOrder?: boolean;
  }[];
  workflowHistory: {
    stage: string;
    action: string;
    userId: string | null;
    userName: string | null;
    timestamp: string;
    notes?: string;
  }[];
  discountPercent?: number;
  paymentMethod?: string;
  deliveryMethod?: string;
  /** From server `status` (draft carts are not listed on this dashboard) */
  orderStatus?: string;
  rejectionReason?: string;
  rejectedBy?: string;
  /** Server `order_type`: stock orders are `regular` */
  orderType?: 'pre-order' | 'regular';
}

interface GroupedCartProduct {
  productId: string;
  name: string;
  sku: string;
  brand: string;
  color: string;
  price: number;
  sizes: string[];
  quantities: Record<string, number>;
  totalQty: number;
  totalPrice: number;
  unitsPerCarton?: number;
}

export type OrdersDashboardRole = 'account_manager' | 'sales' | 'finance' | 'admin';

type RejectedFilterMode = 'my_stage' | 'all';

type OrdersDashboardRoleConfig = {
  title: string;
  subtitle: string;
  avatarGradient: string;
  firstCardFilterValue: WorkflowStage;
  firstCardStages: readonly WorkflowStage[];
  firstCardLabel: string;
  firstCardIcon: typeof Package;
  myApprovalStages: readonly WorkflowStage[];
  approvedStages: readonly WorkflowStage[];
  relevantStages: readonly WorkflowStage[];
  approvalForwardMessage: string;
  showItemEdit: boolean;
  showReturnFlow: boolean;
  showAiChat: boolean;
  showNewOrderButton: boolean;
  rejectedFilterMode: RejectedFilterMode;
  ordersCardTitle: string;
};

const ROLE_CONFIG: Record<OrdersDashboardRole, OrdersDashboardRoleConfig> = {
  account_manager: {
    title: 'Account Manager Dashboard',
    subtitle: 'Manage pending orders and customer approvals',
    avatarGradient: 'from-blue-500 to-indigo-600',
    firstCardFilterValue: 'new_order',
    firstCardStages: ['new_order', 'account_manager_approval'],
    firstCardLabel: 'New Orders',
    firstCardIcon: Package,
    myApprovalStages: ['new_order', 'account_manager_approval'],
    approvedStages: ['sales_approval', 'finance_approval', 'admin_approval', 'completed'],
    relevantStages: ['new_order', 'account_manager_approval', 'sales_approval', 'finance_approval', 'admin_approval', 'completed'],
    approvalForwardMessage: 'approved and forwarded to Sales.',
    showItemEdit: true,
    showReturnFlow: true,
    showAiChat: true,
    showNewOrderButton: true,
    rejectedFilterMode: 'my_stage',
    ordersCardTitle: 'Orders',
  },
  sales: {
    title: 'Sales Dashboard',
    subtitle: 'Review and approve orders for sales verification',
    avatarGradient: 'from-purple-500 to-indigo-600',
    firstCardFilterValue: 'sales_approval',
    firstCardStages: ['sales_approval'],
    firstCardLabel: 'Pending My Approval',
    firstCardIcon: DollarSign,
    myApprovalStages: ['sales_approval'],
    approvedStages: ['finance_approval', 'admin_approval', 'completed'],
    // Include upstream stages so the table is not empty while orders are still with AM / new queue
    relevantStages: [
      'new_order',
      'account_manager_approval',
      'sales_approval',
      'finance_approval',
      'admin_approval',
      'completed',
    ],
    approvalForwardMessage: 'approved and forwarded to Finance.',
    showItemEdit: true,
    showReturnFlow: false,
    showAiChat: false,
    showNewOrderButton: true,
    rejectedFilterMode: 'my_stage',
    ordersCardTitle: 'Orders',
  },
  finance: {
    title: 'Finance Dashboard',
    subtitle: 'Review and approve orders for financial verification',
    avatarGradient: 'from-emerald-500 to-teal-600',
    firstCardFilterValue: 'finance_approval',
    firstCardStages: ['finance_approval'],
    firstCardLabel: 'Pending My Approval',
    firstCardIcon: DollarSign,
    myApprovalStages: ['finance_approval'],
    approvedStages: ['admin_approval', 'completed'],
    relevantStages: ['finance_approval', 'admin_approval', 'completed'],
    approvalForwardMessage: 'approved and forwarded to Admin.',
    showItemEdit: false,
    showReturnFlow: false,
    showAiChat: false,
    showNewOrderButton: false,
    rejectedFilterMode: 'my_stage',
    ordersCardTitle: 'Orders',
  },
  admin: {
    title: 'Admin Dashboard',
    subtitle: 'Final approval for orders and system oversight',
    avatarGradient: 'from-purple-500 to-indigo-600',
    firstCardFilterValue: 'admin_approval',
    firstCardStages: ['admin_approval'],
    firstCardLabel: 'Pending My Approval',
    firstCardIcon: Package,
    myApprovalStages: ['admin_approval'],
    approvedStages: ['sales_approval', 'finance_approval', 'completed'],
    relevantStages: ['admin_approval', 'sales_approval', 'finance_approval', 'completed', 'rejected'],
    approvalForwardMessage: 'approved and marked as completed.',
    showItemEdit: false,
    showReturnFlow: false,
    showAiChat: false,
    showNewOrderButton: true,
    rejectedFilterMode: 'all',
    ordersCardTitle: 'Orders Overview',
  },
};


/** Per-size row for add-item grid */
type AddItemSizeEntry = {
  size: string;
  /** Caps qty for stock products only; null = no stock-based cap (preorder or unknown stock) */
  stockCap: number | null;
  /** Optional label in header (show catalog stock when present, even for preorder) */
  stockDisplay: number | null;
  limitOrder?: number;
};

function parseAddItemSizeEntries(product: any): AddItemSizeEntry[] {
  const raw = product?.availableSizes;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const isPreOrder = !!product?.isPreOrder;

  const rows = raw
    .map((x: any) => {
      const size = String(x?.size ?? '').trim();
      const rawSt = x?.stock;
      let stockDisplay: number | null = null;
      if (rawSt !== undefined && rawSt !== null && rawSt !== '') {
        const n = typeof rawSt === 'number' ? rawSt : parseInt(String(rawSt), 10);
        if (Number.isFinite(n)) stockDisplay = Math.max(0, n);
      }
      const lo =
        x?.limitOrder != null && x?.limitOrder !== ''
          ? Number(x.limitOrder)
          : undefined;
      const limitOrder =
        lo !== undefined && Number.isFinite(lo) && lo >= 1 ? lo : undefined;

      // Preorder: never cap by stock; cap only by limitOrder (per size or product).
      // Stock: cap by stock when we have a figure; missing stock field = no stock cap (staff can enter any qty).
      const stockCap = isPreOrder ? null : stockDisplay;

      return { size, stockCap, stockDisplay, limitOrder };
    })
    .filter((x) => x.size);

  rows.sort((a, b) => {
    const na = parseFloat(a.size);
    const nb = parseFloat(b.size);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.size.localeCompare(b.size);
  });
  return rows;
}

/** Max quantity: undefined = no upper limit. Only applies stock and/or preorder/order limits. */
function addItemMaxQtyForSize(
  entry: AddItemSizeEntry,
  productLimitOrder: number | null | undefined,
): number | undefined {
  const pln = Number(productLimitOrder);
  const pl =
    productLimitOrder != null && Number.isFinite(pln) && pln >= 1 ? pln : undefined;
  const lim =
    entry.limitOrder != null && entry.limitOrder >= 1 ? entry.limitOrder : pl;

  const cap = entry.stockCap;
  if (cap == null) {
    return lim;
  }
  if (lim == null) return cap;
  return Math.min(cap, lim);
}

/** Unit price for orders: wholesale first (catalog field), then price, then retail. */
function unitPriceFromProduct(p: any): number {
  if (!p) return 0;
  for (const key of ['wholesalePrice', 'price', 'retailPrice'] as const) {
    const v = p[key];
    if (v === undefined || v === null || v === '') continue;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function mergePendingCartLine(
  prev: OrderFlowOrder['rawItems'],
  line: OrderFlowOrder['rawItems'][number],
): OrderFlowOrder['rawItems'] {
  const idx = prev.findIndex(
    (i) => i.productId === line.productId && i.size === line.size && i.sku === line.sku,
  );
  if (idx >= 0) {
    const nq = prev[idx].quantity + line.quantity;
    const next = [...prev];
    next[idx] = {
      ...next[idx],
      quantity: nq,
      totalPrice: nq * next[idx].unitPrice,
      isPreOrder: next[idx].isPreOrder ?? line.isPreOrder,
    };
    return next;
  }
  return [...prev, line];
}

function AddItemProductThumb({ product }: { product: any }) {
  const [broken, setBroken] = useState(false);
  const src = String(product?.image1 || product?.imageUrl || product?.image_url || '').trim();
  if (!src || broken) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-400">
        <Package size={20} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="h-12 w-12 shrink-0 rounded-md border border-slate-200 object-cover bg-white"
      onError={() => setBroken(true)}
    />
  );
}

export function OrdersDashboard({ role = 'account_manager' }: { role?: OrdersDashboardRole }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { createDraftAsync, isCreatingDraft, draftsQueryKey, setActiveDraftId, setOpenCartId } =
    useCartContext();
  const { user } = useAuth();
  const { getCurrencySymbol, userCurrency } = useCurrency();
  const config = ROLE_CONFIG[role];
  
  // Real-time order updates via WebSocket
  useAdminOrderSocket(true);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [activeStageFilter, setActiveStageFilter] = useState<WorkflowStage | 'approved' | 'rejected' | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderFlowOrder | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [itemViewMode, setItemViewMode] = useState<'cart' | 'list'>('cart');

  const mainScrollRestoreRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = document.getElementById('main-scroll-container');
    if (!el) return;
    if (selectedOrder) {
      if (mainScrollRestoreRef.current === null) {
        mainScrollRestoreRef.current = el.scrollTop;
      }
      return;
    }
    const y = mainScrollRestoreRef.current;
    mainScrollRestoreRef.current = null;
    if (y !== null) {
      requestAnimationFrame(() => {
        el.scrollTop = y;
      });
    }
  }, [selectedOrder]);
  
  // Account Manager approval form state
  const [showApprovalForm, setShowApprovalForm] = useState(false);
  const [approvalOrderId, setApprovalOrderId] = useState<string | null>(null);
  const [discountPercent, setDiscountPercent] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [deliveryMethod, setDeliveryMethod] = useState<string>('');
  const [approvalNotes, setApprovalNotes] = useState<string>('');
  
  // Reject dialog state  
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  
  // Order editing state
  const [isViewOnlyOrder, setIsViewOnlyOrder] = useState(false);
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [editedItems, setEditedItems] = useState<OrderFlowOrder['rawItems']>([]);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [selectedProductForAdd, setSelectedProductForAdd] = useState<any>(null);
  const [addItemQuantities, setAddItemQuantities] = useState<Record<string, number>>({});
  const [addItemManualSize, setAddItemManualSize] = useState('');
  const [addItemManualQty, setAddItemManualQty] = useState(1);
  const [editingDetails, setEditingDetails] = useState(false);
  const [editDiscount, setEditDiscount] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editDeliveryMethod, setEditDeliveryMethod] = useState('');

  const [showCreateCartDialog, setShowCreateCartDialog] = useState(false);
  const [newCartSearchTerm, setNewCartSearchTerm] = useState('');
  const [newCartDebouncedSearch, setNewCartDebouncedSearch] = useState('');
  const [newCartSearchFocused, setNewCartSearchFocused] = useState(false);
  const [newCartSuggestHighlight, setNewCartSuggestHighlight] = useState(-1);
  const [newCartSelectedProduct, setNewCartSelectedProduct] = useState<any>(null);
  const [newCartQuantities, setNewCartQuantities] = useState<Record<string, number>>({});
  const [newCartManualSize, setNewCartManualSize] = useState('');
  const [newCartManualQty, setNewCartManualQty] = useState(1);
  const [newCartPendingLines, setNewCartPendingLines] = useState<OrderFlowOrder['rawItems']>([]);
  const [createCartCustomerId, setCreateCartCustomerId] = useState<string>('');
  const [isFinalizingNewCart, setIsFinalizingNewCart] = useState(false);
  const [isLaunchingShopEdit, setIsLaunchingShopEdit] = useState(false);

  const { data: ordersData = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ['/api/admin/orders'],
  });

  const editProductIds = useMemo(
    () => [...new Set(editedItems.map((i) => i.productId).filter(Boolean))],
    [editedItems],
  );

  const { data: editOrderProducts = [], isLoading: editOrderProductsLoading } = useQuery<Product[]>({
    queryKey: ['/api/products/by-ids', editProductIds],
    queryFn: async () => {
      if (editProductIds.length === 0) return [];
      const res = await fetch('/api/products/by-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: editProductIds }),
      });
      if (!res.ok) throw new Error('Failed to fetch order edit products');
      return res.json();
    },
    enabled: isEditingOrder && editProductIds.length > 0,
  });

  const { data: orderEditBrands = [] } = useQuery<Brand[]>({
    queryKey: ['/api/brands'],
    enabled: isEditingOrder,
  });

  const orderEditCartModel = useOrderEditShopCartModel(
    editedItems,
    setEditedItems,
    editOrderProducts,
    orderEditBrands,
    isEditingOrder,
  );

  const [debouncedProductSearch, setDebouncedProductSearch] = useState('');
  useEffect(() => {
    if (!showAddItemDialog) {
      setDebouncedProductSearch('');
      return;
    }
    const t = window.setTimeout(() => setDebouncedProductSearch(productSearchTerm), 300);
    return () => window.clearTimeout(t);
  }, [productSearchTerm, showAddItemDialog]);

  const addItemProductsQueryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set('limit', '80');
    const q = debouncedProductSearch.trim();
    if (q) p.set('search', q);
    return p.toString();
  }, [debouncedProductSearch]);

  const { data: addItemProducts = [], isFetching: addItemProductsLoading } = useQuery<any[]>({
    queryKey: ['/api/products', addItemProductsQueryParams],
    enabled: showAddItemDialog,
  });

  useEffect(() => {
    if (!showCreateCartDialog) {
      setNewCartDebouncedSearch('');
      return;
    }
    const t = window.setTimeout(() => setNewCartDebouncedSearch(newCartSearchTerm), 300);
    return () => window.clearTimeout(t);
  }, [newCartSearchTerm, showCreateCartDialog]);

  const newCartSuggestQueryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set('limit', '80');
    const q = newCartDebouncedSearch.trim();
    if (q) p.set('search', q);
    return p.toString();
  }, [newCartDebouncedSearch]);

  const { data: newCartSuggestions = [], isFetching: newCartSuggestionsLoading } = useQuery<any[]>({
    queryKey: ['/api/products', newCartSuggestQueryParams],
    enabled:
      showCreateCartDialog &&
      !newCartSelectedProduct &&
      newCartDebouncedSearch.trim().length > 0,
  });

  useEffect(() => {
    setNewCartSuggestHighlight(-1);
  }, [newCartDebouncedSearch, newCartSuggestions.length]);

  const { data: assignableCustomers = [] } = useQuery<
    { id: string; displayName: string | null; email: string | null; username: string }[]
  >({
    queryKey: ['/api/staff/customers/search', 'create-cart-dialog'],
    queryFn: async () => {
      const res = await apiRequest('/api/staff/customers/search', 'GET');
      if (!res.ok) throw new Error('Failed to load customers');
      return res.json();
    },
    enabled: showCreateCartDialog,
  });

  const orders: OrderFlowOrder[] = useMemo(() => {
    const nonDraft = ordersData.filter((order) => order.status !== 'draft');
    return nonDraft.map((order) => {
      const items = (order.items || []).map((item: any, idx: number) => ({
        id: item.productId || `item-${idx}`,
        name: item.productName || 'Unknown Product',
        sku: item.sku || 'N/A',
        quantity: item.quantity || 0,
        price: typeof item.unitPrice === 'number' ? item.unitPrice : parseFloat(item.unitPrice) || 0,
        total: typeof item.totalPrice === 'number' ? item.totalPrice : parseFloat(item.totalPrice) || ((item.quantity || 0) * (parseFloat(item.unitPrice) || 0)),
        brand: item.brand || 'Unknown',
      }));

      const primaryBrand = items[0]?.brand || 'Others';
      const normalizedBrand = primaryBrand.toLowerCase().includes('adidas') ? 'Adidas' :
                              primaryBrand.toLowerCase().includes('nike') ? 'Nike' :
                              primaryBrand.toLowerCase().includes('reebok') ? 'Reebok' : 'Others';

      // Workflow from API (camelCase or snake_case). Trust explicit `new_order` — do not map `status: submitted` over it.
      const raw = String(
        (order as any).workflowStage ?? (order as any).workflow_stage ?? '',
      ).trim();
      const explicitStages: WorkflowStage[] = [
        'new_order',
        'account_manager_approval',
        'sales_approval',
        'finance_approval',
        'admin_approval',
        'completed',
        'rejected',
      ];
      const parsedStage = explicitStages.includes(raw as WorkflowStage)
        ? (raw as WorkflowStage)
        : null;

      let workflowStage: WorkflowStage;
      if (!parsedStage) {
        workflowStage = 'new_order';
        if (order.approvalStatus === 'approved') workflowStage = 'completed';
        else if (order.approvalStatus === 'rejected') workflowStage = 'rejected';
        else if (order.status === 'submitted') workflowStage = 'account_manager_approval';
      } else if (parsedStage === 'new_order') {
        workflowStage = 'new_order';
        if (order.approvalStatus === 'approved') workflowStage = 'completed';
        else if (order.approvalStatus === 'rejected') workflowStage = 'rejected';
      } else {
        workflowStage = parsedStage;
      }

      return {
        id: order.id,
        customerName: order.customerName || 'Unknown Customer',
        customerEmail: order.customerEmail || '',
        customerPhone: String((order as any).customerPhone || '').trim() || undefined,
        brand: normalizedBrand,
        workflowStage,
        orderStatus: (order as any).status,
        createdAt: order.createdAt ?? null,
        date: order.createdAt ? new Date(order.createdAt).toLocaleDateString() : new Date().toLocaleDateString(),
        total: typeof order.total === 'number' ? order.total : parseFloat(order.total) || 0,
        items,
        rawItems: (order.items || []).map((item: any) => ({
          productId: item.productId || '',
          productName: item.productName || 'Unknown Product',
          sku: item.sku || '',
          brand: item.brand || '',
          size: item.size || '',
          quantity: item.quantity || 0,
          unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : parseFloat(item.unitPrice) || 0,
          totalPrice: typeof item.totalPrice === 'number' ? item.totalPrice : parseFloat(item.totalPrice) || 0,
          color: item.color || '',
          unitsPerCarton: item.unitsPerCarton || undefined,
        })),
        workflowHistory: ((order as any).workflowHistory || []) as OrderFlowOrder['workflowHistory'],
        discountPercent: (order as any).discountPercent,
        paymentMethod: (order as any).paymentMethod,
        deliveryMethod: (order as any).deliveryMethod,
        rejectionReason: (() => {
          const r = (order as any).rejectionReason;
          if (r == null || r === '') return undefined;
          return String(r);
        })(),
        rejectedBy: (() => {
          const last = ((order as any).workflowHistory || []).filter((h: any) => h.action === 'rejected').pop();
          return last?.userName ? String(last.userName) : undefined;
        })(),
        orderType: (order as any).orderType === 'pre-order' ? 'pre-order' : 'regular',
      };
    });
  }, [ordersData]);

  const groupItemsForCartView = (rawItems: OrderFlowOrder['rawItems']): { products: GroupedCartProduct[], allSizes: string[] } => {
    const productMap = new Map<string, GroupedCartProduct>();
    const allSizesSet = new Set<string>();

    rawItems.forEach(item => {
      const key = `${item.productId}-${item.sku}`;
      if (item.size) allSizesSet.add(item.size);

      if (productMap.has(key)) {
        const existing = productMap.get(key)!;
        existing.quantities[item.size] = (existing.quantities[item.size] || 0) + item.quantity;
        if (!existing.sizes.includes(item.size)) {
          existing.sizes.push(item.size);
        }
        existing.totalQty += item.quantity;
        existing.totalPrice += item.totalPrice;
        if (!existing.unitsPerCarton && item.unitsPerCarton) {
          existing.unitsPerCarton = item.unitsPerCarton;
        }
      } else {
        productMap.set(key, {
          productId: item.productId,
          name: item.productName,
          sku: item.sku,
          brand: item.brand,
          color: item.color || '',
          price: item.unitPrice,
          sizes: item.size ? [item.size] : [],
          quantities: item.size ? { [item.size]: item.quantity } : {},
          totalQty: item.quantity,
          totalPrice: item.totalPrice,
          unitsPerCarton: item.unitsPerCarton,
        });
      }
    });

    const allSizes = [...allSizesSet].sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });

    return { products: [...productMap.values()], allSizes };
  };

  const stats = useMemo(() => ({
    firstCount: orders.filter(o => config.firstCardStages.includes(o.workflowStage)).length,
    approved: orders.filter(o => config.approvedStages.includes(o.workflowStage)).length,
    rejected: orders.filter(o => {
      if (o.workflowStage !== 'rejected') return false;
      if (config.rejectedFilterMode === 'all') return true;
      const lastRejection = o.workflowHistory.filter(h => h.action === 'rejected').pop();
      return lastRejection?.stage === config.myApprovalStages[config.myApprovalStages.length - 1];
    }).length,
  }), [orders, config]);

  const isOrderRejectedByMe = (order: OrderFlowOrder) => {
    if (order.workflowStage !== 'rejected') return false;
    if (config.rejectedFilterMode === 'all') return true;
    const lastRejection = order.workflowHistory.filter(h => h.action === 'rejected').pop();
    return config.myApprovalStages.includes(lastRejection?.stage as any);
  };

  const filteredOrders = useMemo(() => {
    const list = orders.filter((o) => {
      const isRelevantStage = config.relevantStages.includes(o.workflowStage) || isOrderRejectedByMe(o);
      const matchesSearch = o.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            o.customerName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStage = activeStageFilter 
        ? (activeStageFilter === 'approved' ? config.approvedStages.includes(o.workflowStage) : 
           activeStageFilter === 'rejected' ? isOrderRejectedByMe(o) :
           activeStageFilter === config.firstCardFilterValue ? config.firstCardStages.includes(o.workflowStage) :
           o.workflowStage === activeStageFilter)
        : true;
      return isRelevantStage && matchesSearch && matchesStage;
    });
    const time = (o: OrderFlowOrder) => {
      const t = o.createdAt ? new Date(o.createdAt).getTime() : NaN;
      return Number.isFinite(t) ? t : 0;
    };
    return [...list].sort((a, b) => time(b) - time(a));
  }, [orders, searchTerm, activeStageFilter, config]);

  /** Per visible row: 1 = oldest in current filter, N = newest (table still sorts newest first). */
  const orderTableSequence = useMemo(() => {
    const t = (o: OrderFlowOrder) => {
      const ms = o.createdAt ? new Date(o.createdAt).getTime() : NaN;
      return Number.isFinite(ms) ? ms : 0;
    };
    const ranked = [...filteredOrders].sort((a, b) => {
      const d = t(a) - t(b);
      if (d !== 0) return d;
      return a.id.localeCompare(b.id);
    });
    const map = new Map<string, number>();
    ranked.forEach((o, i) => map.set(o.id, i + 1));
    return map;
  }, [filteredOrders]);

  // Account Manager approval mutation with required fields
  const accountManagerApproveMutation = useMutation({
    mutationFn: async ({ orderId, discountPercent, paymentMethod, deliveryMethod, notes }: { 
      orderId: string; 
      discountPercent: string; 
      paymentMethod: string; 
      deliveryMethod: string;
      notes?: string;
    }) => {
      return apiRequest(`/api/orders/${orderId}/account-manager-approve`, 'PATCH', {
        discountPercent: parseFloat(discountPercent),
        paymentMethod,
        deliveryMethod,
        notes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({ title: 'Order Approved', description: `The order has been ${config.approvalForwardMessage}` });
      setShowApprovalForm(false);
      setApprovalOrderId(null);
      setDiscountPercent('0');
      setPaymentMethod('');
      setDeliveryMethod('');
      setApprovalNotes('');
      setSelectedOrder(null);
    },
    onError: (error: any) => {
      const message = error?.message || 'Failed to approve order.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  });

  const returnMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest(`/api/orders/${orderId}/return`, 'PATCH', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({ title: 'Order Returned', description: 'The order has been returned for correction.' });
      setSelectedOrder(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to return order.', variant: 'destructive' });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      return apiRequest(`/api/orders/${orderId}/reject`, 'PATCH', { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({ title: 'Order Rejected', description: 'The order has been rejected.' });
      setShowRejectDialog(false);
      setRejectOrderId(null);
      setRejectReason('');
      setSelectedOrder(null);
    },
    onError: (error: any) => {
      const message = error?.message || 'Failed to reject order.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  });

  // Sales: simple approve (no form)
  const salesApproveMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest(`/api/orders/${orderId}/approve`, 'PATCH', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({ title: 'Order Approved', description: `The order has been ${config.approvalForwardMessage}` });
      setSelectedOrder(null);
    },
    onError: (error: any) => {
      const message = error?.message || 'Failed to approve order.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  });

  // Sales: update order details (discount, payment, delivery)
  const updateDetailsMutation = useMutation({
    mutationFn: async ({ orderId, discountPercent, paymentMethod, deliveryMethod }: { 
      orderId: string; 
      discountPercent: string; 
      paymentMethod: string; 
      deliveryMethod: string;
    }) => {
      return apiRequest(`/api/orders/${orderId}/update-details`, 'PATCH', { 
        discountPercent, 
        paymentMethod, 
        deliveryMethod 
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      if (selectedOrder) {
        setSelectedOrder({
          ...selectedOrder,
          discountPercent: parseFloat(editDiscount) || 0,
          paymentMethod: editPaymentMethod,
          deliveryMethod: editDeliveryMethod,
          total: data?.total ? parseFloat(data.total) : selectedOrder.total,
        });
      }
      toast({ title: 'Details Updated', description: 'Order details have been updated successfully.' });
      setEditingDetails(false);
    },
    onError: (error: any) => {
      const message = error?.message || 'Failed to update order details.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  });

  // Order items update mutation for editing
  const updateItemsMutation = useMutation({
    mutationFn: async ({ orderId, items }: { orderId: string; items: any[] }) => {
      const res = await apiRequest(`/api/orders/${orderId}/items`, 'PATCH', { items });
      return res.json() as Promise<any>;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({ title: 'Order Updated', description: 'Order items have been updated.' });
      setIsEditingOrder(false);
      setEditedItems([]);
      setSelectedOrder((prev) => {
        if (!prev || !data) return prev;
        const orderItems = Array.isArray(data.items) ? data.items : [];
        const rawItems = orderItems.map((item: any) => ({
          productId: item.productId || '',
          productName: item.productName || 'Unknown Product',
          sku: item.sku || '',
          brand: item.brand || '',
          size: item.size || '',
          quantity: item.quantity || 0,
          unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : parseFloat(item.unitPrice) || 0,
          totalPrice: typeof item.totalPrice === 'number' ? item.totalPrice : parseFloat(item.totalPrice) || 0,
          color: item.color || '',
          unitsPerCarton: item.unitsPerCarton || undefined,
        }));
        const items = orderItems.map((item: any, idx: number) => ({
          id: item.productId || `item-${idx}`,
          name: item.productName || 'Unknown Product',
          sku: item.sku || 'N/A',
          quantity: item.quantity || 0,
          price: typeof item.unitPrice === 'number' ? item.unitPrice : parseFloat(item.unitPrice) || 0,
          total:
            typeof item.totalPrice === 'number'
              ? item.totalPrice
              : parseFloat(item.totalPrice) ||
                (item.quantity || 0) * (parseFloat(item.unitPrice) || 0),
          brand: item.brand || 'Unknown',
        }));
        const total =
          typeof data.total === 'number' ? data.total : parseFloat(String(data.total ?? 0)) || 0;
        const workflowHistory = (data.workflowHistory || prev.workflowHistory || []) as OrderFlowOrder['workflowHistory'];
        return {
          ...prev,
          rawItems,
          items,
          total,
          workflowHistory,
        };
      });
    },
    onError: (error: any) => {
      const message = error?.message || 'Failed to update order items.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  });

  const handleStartEditing = () => {
    if (selectedOrder) {
      setEditedItems([...selectedOrder.rawItems]);
      setIsEditingOrder(true);
    }
  };

  const handleCancelEditing = () => {
    setIsEditingOrder(false);
    setEditedItems([]);
  };

  const handleSaveEdits = () => {
    if (!selectedOrder) return;
    const filteredItems = editedItems.filter(item => item.quantity > 0);
    if (filteredItems.length === 0) {
      toast({ title: 'Error', description: 'Order must have at least one item.', variant: 'destructive' });
      return;
    }
    updateItemsMutation.mutate({ orderId: selectedOrder.id, items: filteredItems });
  };

  const addItemSizeEntries = useMemo(
    () => (selectedProductForAdd ? parseAddItemSizeEntries(selectedProductForAdd) : []),
    [selectedProductForAdd],
  );

  useEffect(() => {
    if (!selectedProductForAdd) {
      setAddItemQuantities({});
      return;
    }
    const entries = parseAddItemSizeEntries(selectedProductForAdd);
    const q: Record<string, number> = {};
    entries.forEach((e) => {
      q[e.size] = 0;
    });
    setAddItemQuantities(q);
    setAddItemManualSize('');
    setAddItemManualQty(1);
  }, [selectedProductForAdd?.id]);

  const newCartSizeEntries = useMemo(
    () => (newCartSelectedProduct ? parseAddItemSizeEntries(newCartSelectedProduct) : []),
    [newCartSelectedProduct],
  );

  useEffect(() => {
    if (!newCartSelectedProduct) {
      setNewCartQuantities({});
      return;
    }
    const entries = parseAddItemSizeEntries(newCartSelectedProduct);
    const q: Record<string, number> = {};
    entries.forEach((e) => {
      q[e.size] = 0;
    });
    setNewCartQuantities(q);
    setNewCartManualSize('');
    setNewCartManualQty(1);
  }, [newCartSelectedProduct?.id]);

  const resetCreateCartDialog = () => {
    setNewCartSearchTerm('');
    setNewCartDebouncedSearch('');
    setNewCartSearchFocused(false);
    setNewCartSuggestHighlight(-1);
    setNewCartSelectedProduct(null);
    setNewCartQuantities({});
    setNewCartManualSize('');
    setNewCartManualQty(1);
    setNewCartPendingLines([]);
    setCreateCartCustomerId('');
    setIsFinalizingNewCart(false);
  };

  const handleSelectProductForNewCart = (product: any) => {
    setNewCartSelectedProduct(product);
  };

  const pickNewCartSuggestion = (product: any) => {
    handleSelectProductForNewCart(product);
    setNewCartSearchTerm('');
    setNewCartDebouncedSearch('');
    setNewCartSearchFocused(false);
    setNewCartSuggestHighlight(-1);
  };

  const resolveNewCartSearchList = async (term: string): Promise<any[]> => {
    const t = term.trim();
    if (!t) return [];
    if (
      newCartDebouncedSearch.trim() === t &&
      Array.isArray(newCartSuggestions) &&
      newCartSuggestions.length > 0
    ) {
      return newCartSuggestions;
    }
    const p = new URLSearchParams();
    p.set('limit', '80');
    p.set('search', t);
    const products = await queryClient.fetchQuery<any[]>({
      queryKey: ['/api/products', p.toString()],
    });
    return Array.isArray(products) ? products : [];
  };

  const submitNewCartProductSearch = async (preferIndex?: number) => {
    const term = newCartSearchTerm.trim();
    if (!term) {
      toast({
        title: 'Enter a search',
        description: 'Type a product name or SKU.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const list = await resolveNewCartSearchList(term);
      if (preferIndex != null && preferIndex >= 0 && preferIndex < list.length) {
        pickNewCartSuggestion(list[preferIndex]);
        return;
      }
      if (list.length === 0) {
        toast({
          title: 'No results',
          description: `No products found for "${term}".`,
          variant: 'destructive',
        });
        return;
      }
      const tlow = term.toLowerCase();
      const exact =
        list.find(
          (pr: any) =>
            String(pr.sku || '')
              .trim()
              .toLowerCase() === tlow ||
            String(pr.barcode || '')
              .trim()
              .toLowerCase() === tlow,
        ) ?? null;
      pickNewCartSuggestion(exact ?? list[0]);
    } catch (e: any) {
      toast({
        title: 'Search failed',
        description: e?.message || 'Try again.',
        variant: 'destructive',
      });
    }
  };

  const handleAddCurrentProductToNewCartList = () => {
    if (!newCartSelectedProduct) {
      toast({
        title: 'Error',
        description: 'Please select a product.',
        variant: 'destructive',
      });
      return;
    }
    const lineIsPreOrder = !!newCartSelectedProduct.isPreOrder;
    if (newCartPendingLines.length > 0) {
      const existingPreOrder = !!newCartPendingLines[0].isPreOrder;
      if (existingPreOrder !== lineIsPreOrder) {
        toast({
          title: 'Stock and pre-order cannot mix',
          description:
            'Clear the list or finish this cart, then start another for the other product type.',
          variant: 'destructive',
        });
        return;
      }
    }
    const unitPrice = unitPriceFromProduct(newCartSelectedProduct);
    const limRaw = Number(newCartSelectedProduct.limitOrder);
    const productLimit =
      newCartSelectedProduct.limitOrder != null &&
      Number.isFinite(limRaw) &&
      limRaw >= 1
        ? limRaw
        : undefined;
    if (newCartSizeEntries.length > 0) {
      const lines: OrderFlowOrder['rawItems'] = [];
      for (const e of newCartSizeEntries) {
        const qty = newCartQuantities[e.size] ?? 0;
        if (qty < 1) continue;
        const maxQ = addItemMaxQtyForSize(e, productLimit);
        if (maxQ !== undefined && qty > maxQ) {
          toast({
            title: 'Quantity too high',
            description: `Size ${e.size}: maximum allowed is ${maxQ} (stock / limit).`,
            variant: 'destructive',
          });
          return;
        }
        lines.push({
          productId: newCartSelectedProduct.id,
          productName: newCartSelectedProduct.name,
          sku: newCartSelectedProduct.sku || '',
          brand: newCartSelectedProduct.brand || '',
          size: e.size,
          quantity: qty,
          unitPrice,
          totalPrice: qty * unitPrice,
          color: newCartSelectedProduct.color || '',
          unitsPerCarton: newCartSelectedProduct.unitsPerCarton || undefined,
          isPreOrder: lineIsPreOrder,
        });
      }
      if (lines.length === 0) {
        toast({
          title: 'Error',
          description: 'Enter a quantity for at least one size.',
          variant: 'destructive',
        });
        return;
      }
      setNewCartPendingLines((prev) => lines.reduce((acc, line) => mergePendingCartLine(acc, line), prev));
      setNewCartSelectedProduct(null);
      toast({
        title: 'Added to list',
        description:
          lines.length === 1
            ? `${lines[0].productName} (${lines[0].size})`
            : `${lines.length} size lines for ${newCartSelectedProduct.name}`,
      });
      return;
    }

    if (!newCartManualSize.trim() || newCartManualQty < 1) {
      toast({
        title: 'Error',
        description: 'Please enter a size and quantity.',
        variant: 'destructive',
      });
      return;
    }
    const line: OrderFlowOrder['rawItems'][number] = {
      productId: newCartSelectedProduct.id,
      productName: newCartSelectedProduct.name,
      sku: newCartSelectedProduct.sku || '',
      brand: newCartSelectedProduct.brand || '',
      size: newCartManualSize.trim(),
      quantity: newCartManualQty,
      unitPrice,
      totalPrice: newCartManualQty * unitPrice,
      color: newCartSelectedProduct.color || '',
      unitsPerCarton: newCartSelectedProduct.unitsPerCarton || undefined,
      isPreOrder: lineIsPreOrder,
    };
    setNewCartPendingLines((prev) => mergePendingCartLine(prev, line));
    setNewCartSelectedProduct(null);
    toast({
      title: 'Added to list',
      description: `${line.productName} (${line.size})`,
    });
  };

  const handleFinalizeNewCart = async () => {
    if (!createCartCustomerId.trim()) {
      toast({
        title: 'Select a customer',
        description: 'Choose which customer this cart is for.',
        variant: 'destructive',
      });
      return;
    }
    if (newCartPendingLines.length === 0) {
      toast({
        title: 'Cart is empty',
        description: 'Add at least one product line before creating the cart.',
        variant: 'destructive',
      });
      return;
    }
    setIsFinalizingNewCart(true);
    try {
      const cartUsesPreOrder = newCartPendingLines.some((l) => l.isPreOrder);
      const cartUsesStock = newCartPendingLines.some((l) => !l.isPreOrder);
      if (cartUsesPreOrder && cartUsesStock) {
        toast({
          title: 'Mixed cart',
          description: 'Stock and pre-order lines cannot go in one cart. Remove one type or split into two carts.',
          variant: 'destructive',
        });
        setIsFinalizingNewCart(false);
        return;
      }
      const draft = await createDraftAsync(
        undefined,
        cartUsesPreOrder ? 'pre-order' : 'stock',
        createCartCustomerId.trim(),
        { activateInShopCart: false },
      );
      const apiItems = newCartPendingLines.map(({ isPreOrder: _t, ...item }) => item);
      const res = await apiRequest(`/api/orders/${draft.id}/items`, 'POST', { items: apiItems });
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        toast({
          title: 'Cannot add items',
          description: (data as { message?: string }).message || 'Cart type conflict.',
          variant: 'destructive',
        });
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        toast({
          title: 'Failed to save lines',
          description: text || res.statusText,
          variant: 'destructive',
        });
        return;
      }
      const submitRes = await apiRequest(
        `/api/orders/${encodeURIComponent(draft.id)}/submit?placement=new_order`,
        'POST',
        {
          targetUserId: createCartCustomerId.trim(),
          paymentMethod: 'card',
          deliveryMethod: 'pickup_from_warehouse',
          discountPercent: 0,
          forAccountManagerQueue: true,
        },
      );
      if (!submitRes.ok) {
        const text = await submitRes.text();
        toast({
          title: 'Order lines saved but submit failed',
          description: text || submitRes.statusText,
          variant: 'destructive',
        });
        await queryClient.invalidateQueries({ queryKey: draftsQueryKey });
        await queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
        return;
      }
      const submittedOrder = (await submitRes.json()) as Order;
      queryClient.setQueryData<Order[]>(['/api/admin/orders'], (old) => {
        const list = Array.isArray(old) ? old : [];
        const rest = list.filter((o) => o.id !== submittedOrder.id);
        return [submittedOrder, ...rest];
      });
      {
        const ws = String((submittedOrder as any).workflowStage ?? '').trim() as WorkflowStage;
        const stages: readonly WorkflowStage[] = [
          'new_order',
          'account_manager_approval',
          'sales_approval',
          'finance_approval',
          'admin_approval',
          'completed',
          'rejected',
        ];
        if (ws && stages.includes(ws) && config.relevantStages.includes(ws)) {
          setActiveStageFilter(ws);
        } else {
          setActiveStageFilter(null);
        }
      }
      await queryClient.invalidateQueries({ queryKey: draftsQueryKey });
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      setShowCreateCartDialog(false);
      resetCreateCartDialog();
      toast({
        title: 'Order created',
        description:
          'The order was submitted as a new order (pending). It appears in your orders table for review and approval.',
      });
    } catch (e: any) {
      toast({
        title: 'Could not create cart',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsFinalizingNewCart(false);
    }
  };

  const handleOpenAddItemDialog = () => {
    setShowAddItemDialog(true);
    setProductSearchTerm('');
    setSelectedProductForAdd(null);
    setAddItemQuantities({});
    setAddItemManualSize('');
    setAddItemManualQty(1);
  };

  const handleAddItemViaShop = async () => {
    if (!selectedOrder) return;
    const lines = editedItems.filter((i) => (i.quantity || 0) > 0);
    if (lines.length === 0) {
      toast({
        title: 'Nothing to add',
        description: 'This order has no line items to copy. Add quantities in the table first.',
        variant: 'destructive',
      });
      return;
    }

    const items = lines.map((it) => {
      const qty = Math.max(0, Number(it.quantity) || 0);
      const unit = typeof it.unitPrice === 'number' ? it.unitPrice : parseFloat(String(it.unitPrice)) || 0;
      return {
        productId: it.productId,
        productName: it.productName,
        sku: it.sku,
        brand: it.brand,
        size: it.size || '',
        quantity: qty,
        unitPrice: unit,
        totalPrice: qty * unit,
        color: it.color || undefined,
        unitsPerCarton: it.unitsPerCarton,
      };
    });
    const subtotalNum = items.reduce((s, i) => s + i.totalPrice, 0);
    const subtotal = subtotalNum.toFixed(2);
    /** Same suffix as the orders table column `#{order.id.slice(-6)}` */
    const orderLabel = selectedOrder.id.slice(-6);
    const nickname = `Editing of #${orderLabel}`;

    setIsLaunchingShopEdit(true);
    try {
      const res = await apiRequest('/api/orders', 'POST', {
        orderName: nickname,
        nickname,
        status: 'draft',
        items,
        subtotal,
        total: subtotal,
        discount: '0',
        orderType: selectedOrder.orderType === 'pre-order' ? 'pre-order' : 'regular',
      });
      const created = (await res.json()) as Order;

      sessionStorage.setItem(
        SHOP_ORDER_EDIT_SESSION_KEY,
        JSON.stringify({ sourceOrderId: selectedOrder.id, draftId: created.id }),
      );

      queryClient.setQueryData<Order[]>(draftsQueryKey, (old) => (old ? [created, ...old] : [created]));
      setActiveDraftId(created.id);
      setOpenCartId(created.id);
      await queryClient.invalidateQueries({ queryKey: draftsQueryKey });

      setSelectedOrder(null);
      setIsEditingOrder(false);

      const path = selectedOrder.orderType === 'pre-order' ? '/shop/pre-order' : '/shop/stock';
      navigate(path);

      toast({
        title: 'Shop opened',
        description: `Use this cart to add or change items, then update the order from the cart page.`,
      });
    } catch (e: any) {
      toast({
        title: 'Could not open shop',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLaunchingShopEdit(false);
    }
  };

  const mergeEditedLine = (
    prev: OrderFlowOrder['rawItems'],
    line: OrderFlowOrder['rawItems'][number],
  ) => {
    const idx = prev.findIndex(
      (i) =>
        i.productId === line.productId &&
        i.size === line.size &&
        i.sku === line.sku,
    );
    if (idx >= 0) {
      const nq = prev[idx].quantity + line.quantity;
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        quantity: nq,
        totalPrice: nq * next[idx].unitPrice,
      };
      return next;
    }
    return [...prev, line];
  };

  const handleConfirmAddItem = () => {
    if (!selectedProductForAdd) {
      toast({
        title: 'Error',
        description: 'Please select a product.',
        variant: 'destructive',
      });
      return;
    }
    const unitPrice = unitPriceFromProduct(selectedProductForAdd);
    const limRaw = Number(selectedProductForAdd.limitOrder);
    const productLimit =
      selectedProductForAdd.limitOrder != null &&
      Number.isFinite(limRaw) &&
      limRaw >= 1
        ? limRaw
        : undefined;

    if (addItemSizeEntries.length > 0) {
      const lines: OrderFlowOrder['rawItems'] = [];
      for (const e of addItemSizeEntries) {
        const qty = addItemQuantities[e.size] ?? 0;
        if (qty < 1) continue;
        const maxQ = addItemMaxQtyForSize(e, productLimit);
        if (maxQ !== undefined && qty > maxQ) {
          toast({
            title: 'Quantity too high',
            description: `Size ${e.size}: maximum allowed is ${maxQ} (stock / limit).`,
            variant: 'destructive',
          });
          return;
        }
        lines.push({
          productId: selectedProductForAdd.id,
          productName: selectedProductForAdd.name,
          sku: selectedProductForAdd.sku || '',
          brand: selectedProductForAdd.brand || '',
          size: e.size,
          quantity: qty,
          unitPrice,
          totalPrice: qty * unitPrice,
          color: selectedProductForAdd.color || '',
          unitsPerCarton: selectedProductForAdd.unitsPerCarton || undefined,
        });
      }
      if (lines.length === 0) {
        toast({
          title: 'Error',
          description: 'Enter a quantity for at least one size.',
          variant: 'destructive',
        });
        return;
      }
      setEditedItems((prev) => lines.reduce((acc, line) => mergeEditedLine(acc, line), prev));
      setShowAddItemDialog(false);
      const summary =
        lines.length === 1
          ? `${lines[0].productName} (Size ${lines[0].size})`
          : `${lines.length} size lines for ${selectedProductForAdd.name}`;
      toast({ title: 'Items added', description: summary });
      return;
    }

    if (!addItemManualSize.trim() || addItemManualQty < 1) {
      toast({
        title: 'Error',
        description: 'Please enter a size and quantity.',
        variant: 'destructive',
      });
      return;
    }
    const line: OrderFlowOrder['rawItems'][number] = {
      productId: selectedProductForAdd.id,
      productName: selectedProductForAdd.name,
      sku: selectedProductForAdd.sku || '',
      brand: selectedProductForAdd.brand || '',
      size: addItemManualSize.trim(),
      quantity: addItemManualQty,
      unitPrice,
      totalPrice: addItemManualQty * unitPrice,
      color: selectedProductForAdd.color || '',
      unitsPerCarton: selectedProductForAdd.unitsPerCarton || undefined,
    };
    setEditedItems((prev) => mergeEditedLine(prev, line));
    setShowAddItemDialog(false);
    toast({
      title: 'Item Added',
      description: `${selectedProductForAdd.name} (Size ${addItemManualSize.trim()}) added to order.`,
    });
  };

  const handleOpenApprovalForm = (orderId: string) => {
    setApprovalOrderId(orderId);
    setShowApprovalForm(true);
  };

  const handleSubmitApproval = () => {
    if (!approvalOrderId) return;
    
    // Validate all required fields
    const discountValue = parseFloat(discountPercent);
    if (discountPercent === '' || isNaN(discountValue)) {
      toast({ title: 'Validation Error', description: 'Please enter a discount percentage.', variant: 'destructive' });
      return;
    }
    if (discountValue < 0 || discountValue > 100) {
      toast({ title: 'Validation Error', description: 'Discount must be between 0% and 100%.', variant: 'destructive' });
      return;
    }
    if (!paymentMethod) {
      toast({ title: 'Validation Error', description: 'Please select a payment method.', variant: 'destructive' });
      return;
    }
    if (!deliveryMethod) {
      toast({ title: 'Validation Error', description: 'Please select a delivery method.', variant: 'destructive' });
      return;
    }
    
    accountManagerApproveMutation.mutate({
      orderId: approvalOrderId,
      discountPercent,
      paymentMethod,
      deliveryMethod,
      notes: approvalNotes
    });
  };

  const handleReturn = (id: string) => {
    returnMutation.mutate(id);
  };

  const handleOpenRejectDialog = (orderId: string) => {
    setRejectOrderId(orderId);
    setShowRejectDialog(true);
  };

  const handleExportOrderExcel = (order: OrderFlowOrder) => {
    const exportRows = order.rawItems.map((item, index) => ({
      'Line No': index + 1,
      'Order ID': order.id,
      Customer: order.customerName,
      Brand: item.brand || order.brand || '',
      SKU: item.sku,
      'Product Name': item.productName,
      Color: item.color || '',
      Size: item.size,
      Quantity: item.quantity,
      'Unit Price': item.unitPrice,
      'Line Total': item.totalPrice,
      Date: order.date,
    }));

    if (exportRows.length === 0) {
      toast({
        title: 'No items to export',
        description: 'This order does not contain any items.',
        variant: 'destructive',
      });
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet['!cols'] = [
      { wch: 8 },
      { wch: 22 },
      { wch: 20 },
      { wch: 14 },
      { wch: 16 },
      { wch: 30 },
      { wch: 14 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Order');

    const orderSuffix = order.id.slice(-6).toUpperCase();
    const fileName = `order_${orderSuffix}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    toast({
      title: 'Excel exported',
      description: `Order #${orderSuffix} exported to ${fileName}`,
    });
  };

  const handleConfirmReject = () => {
    if (!rejectOrderId) return;
    rejectMutation.mutate({ orderId: rejectOrderId, reason: rejectReason });
  };

  const handleStartEditDetails = () => {
    if (selectedOrder) {
      setEditDiscount(selectedOrder.discountPercent?.toString() || '0');
      setEditPaymentMethod(selectedOrder.paymentMethod || '');
      setEditDeliveryMethod(selectedOrder.deliveryMethod || '');
      setEditingDetails(true);
    }
  };

  const handleSaveDetails = () => {
    if (!selectedOrder) return;
    updateDetailsMutation.mutate({
      orderId: selectedOrder.id,
      discountPercent: editDiscount,
      paymentMethod: editPaymentMethod,
      deliveryMethod: editDeliveryMethod
    });
  };

  const handleCancelEditDetails = () => {
    setEditingDetails(false);
  };

  const handleSalesApprove = (orderId: string) => {
    salesApproveMutation.mutate(orderId);
  };

  const handleGeneralChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    setChatInput('');
    
    try {
      const response = await apiRequest('POST', '/api/orders/ai-assistant', { 
        message: msg, 
        ordersContext: orders.slice(0, 10)
      });
      const data = await response.json();
      setChatMessages(prev => [...prev, { role: 'ai', text: data?.response || 'No response received.' }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'ai', text: 'Sorry, I encountered an error. Please try again.' }]);
    }
  };

  const getStageBadge = (stage: WorkflowStage) => {
    switch (stage) {
      case 'new_order':
      case 'account_manager_approval':
        return <Badge className="bg-blue-100 text-black hover:bg-blue-100" data-testid={`badge-stage-${stage}`}>New Order</Badge>;
      case 'sales_approval':
        return <Badge className="bg-purple-100 text-black hover:bg-purple-100" data-testid={`badge-stage-${stage}`}>Sales Approval</Badge>;
      case 'finance_approval':
        return <Badge className="bg-blue-100 text-black hover:bg-blue-100" data-testid={`badge-stage-${stage}`}>Finance Approval</Badge>;
      case 'admin_approval':
        return <Badge className="bg-amber-100 text-black hover:bg-amber-100" data-testid={`badge-stage-${stage}`}>Admin Approval</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-black hover:bg-green-100" data-testid={`badge-stage-${stage}`}>Completed</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-black hover:bg-red-100" data-testid={`badge-stage-${stage}`}>Rejected</Badge>;
      default:
        return <Badge className="text-black" data-testid={`badge-stage-${stage}`}>{stage}</Badge>;
    }
  };

  const getOrderStageBadge = (order: OrderFlowOrder) => {
    if (order.orderStatus === 'draft') {
      return (
        <Badge
          className="bg-slate-200 text-slate-800 hover:bg-slate-200"
          data-testid="badge-stage-draft-cart"
        >
          Draft cart
        </Badge>
      );
    }
    return getStageBadge(order.workflowStage);
  };

  const FirstCardIcon = config.firstCardIcon;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <main className="flex-1 max-w-7xl mx-auto w-full p-2 md:p-4 space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h1
                className="text-2xl font-bold text-slate-800 leading-tight"
                data-testid={role === 'admin' ? 'heading-admin-orders' : 'text-page-title'}
              >
                {config.title}
              </h1>
              <p className="text-slate-500 text-sm mt-0.5">{config.subtitle}</p>
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3 md:ml-auto">
              {config.showNewOrderButton && (
              <>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-10 shrink-0 border-slate-200 bg-white shadow-sm hover:bg-slate-50"
                  data-testid="button-shop-stock"
                >
                  <Link href="/shop/stock">
                    <ShoppingCart className="mr-2 h-4 w-4 text-green-600" />
                    Stock Shop
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-10 shrink-0 border-slate-200 bg-white shadow-sm hover:bg-slate-50"
                  data-testid="button-shop-pre-order"
                >
                  <Link href="/shop/pre-order">
                    <ShoppingCart className="mr-2 h-4 w-4 text-green-600" />
                    Pre order
                  </Link>
                </Button>
              </>
              )}
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2 flex items-center gap-2 shadow-sm">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${config.avatarGradient} flex items-center justify-center text-white font-bold text-base`}>
                  {user?.displayName?.charAt(0) || user?.username?.charAt(0) || 'U'}
                </div>
                <div>
                  <div
                    className="font-semibold text-slate-800"
                    data-testid={role === 'admin' ? 'text-admin-name' : 'text-manager-name'}
                  >
                    {user?.displayName || user?.username || 'User'}
                  </div>
                  <div className="text-xs text-slate-400">
                    {ROLE_DISPLAY_NAMES[user?.role || 'user'] ||
                      (role === 'sales'
                        ? 'Sales Manager'
                        : role === 'finance'
                          ? 'Finance Manager'
                          : role === 'admin'
                            ? 'Administrator'
                            : 'Account Manager')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Card className="shadow-sm border-slate-200 overflow-hidden">
          <CardHeader className="border-b border-slate-200 bg-white">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-2">
              <div className="flex items-center gap-2 shrink-0">
                <LayoutDashboard className="text-slate-400 shrink-0" size={18} />
                <CardTitle className="text-lg shrink-0" data-testid="text-orders-title">
                  {config.ordersCardTitle}
                </CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:ml-auto min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveStageFilter(activeStageFilter === config.firstCardFilterValue ? null : config.firstCardFilterValue)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors ${
                      activeStageFilter === config.firstCardFilterValue
                        ? 'border-blue-600 bg-blue-100 ring-2 ring-blue-400 text-slate-900'
                        : 'border-blue-300 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                    data-testid={role === 'admin' ? 'card-admin-approval' : 'card-new-order'}
                  >
                    <FirstCardIcon className="text-blue-500 shrink-0" size={16} />
                    <span
                      className="font-semibold tabular-nums"
                      data-testid={role === 'admin' ? 'text-admin-approval-count' : 'text-new-order-count'}
                    >
                      {stats.firstCount}
                    </span>
                    <span className="text-xs text-slate-600 max-w-[7rem] leading-tight sm:max-w-none">{config.firstCardLabel}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveStageFilter(activeStageFilter === 'approved' ? null : 'approved')}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors ${
                      activeStageFilter === 'approved'
                        ? 'border-green-600 bg-green-100 ring-2 ring-green-400 text-slate-900'
                        : 'border-green-300 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                    data-testid="card-approved"
                  >
                    <CheckCircle className="text-green-500 shrink-0" size={16} />
                    <span className="font-semibold tabular-nums" data-testid="text-approved-count">{stats.approved}</span>
                    <span className="text-xs text-slate-600">Approved</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveStageFilter(activeStageFilter === 'rejected' ? null : 'rejected')}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors ${
                      activeStageFilter === 'rejected'
                        ? 'border-red-600 bg-red-100 ring-2 ring-red-400 text-slate-900'
                        : 'border-red-300 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                    data-testid="card-rejected"
                  >
                    <XCircle className="text-red-500 shrink-0" size={16} />
                    <span className="font-semibold tabular-nums" data-testid="text-rejected-count">{stats.rejected}</span>
                    <span className="text-xs text-slate-600">Rejected</span>
                  </button>
                </div>
                <div className="relative w-full min-w-[12rem] max-w-xs sm:w-64 shrink-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <Input 
                    type="text" 
                    placeholder="Search orders..." 
                    className="pl-9 h-8 border-slate-200 text-xs"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    data-testid="input-search"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs leading-tight">
                <thead>
                  <tr className="bg-slate-50 text-black text-[10px] uppercase tracking-wider">
                    <th className="px-3 py-1.5 w-11 text-center">No.</th>
                    <th className="px-3 py-1.5">Order ID</th>
                    <th className="px-3 py-1.5">Customer</th>
                    <th className="px-3 py-1.5">Status</th>
                    <th className="px-3 py-1.5">Date</th>
                    <th className="px-3 py-1.5">Total</th>
                    <th className="px-3 py-1.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ordersLoading ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-4 text-center text-black text-xs">Loading orders...</td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-4">
                        <div className="flex flex-col items-center gap-1.5">
                          <Search size={28} className="text-slate-200" />
                          <div className="text-black text-xs">No orders found matching your criteria.</div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map(order => (
                      <tr key={order.id} className="hover:bg-slate-50/80 transition-colors group" data-testid={`row-order-${order.id}`}>
                        <td className="px-3 py-1 text-black text-[11px] text-center tabular-nums align-middle" data-testid={`text-order-seq-${order.id}`}>
                          {orderTableSequence.get(order.id) ?? '—'}
                        </td>
                        <td className="px-3 py-1 text-black hover:underline cursor-pointer text-[11px] align-middle" data-testid={`text-order-id-${order.id}`}>#{order.id.slice(-6)}</td>
                        <td className="px-3 py-1 text-black text-[11px] align-middle">{order.customerName}</td>
                        <td className="px-3 py-1 align-middle">{getOrderStageBadge(order)}</td>
                        <td className="px-3 py-1 text-black text-[10px] align-middle tabular-nums">{order.date}</td>
                        <td className="px-3 py-1 text-black text-[11px] align-middle tabular-nums">${order.total.toFixed(2)}</td>
                        <td className="px-3 py-1 align-middle">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                setIsViewOnlyOrder(true);
                                setIsEditingOrder(true);
                                setEditedItems([...order.rawItems]);
                                setEditingDetails(false);
                                setSelectedOrder(order);
                              }}
                              className="px-2 py-0.5 text-[11px] h-7 text-black border border-slate-300 rounded-md hover:bg-slate-100 hover:border-slate-400 transition-colors"
                              title="Review Order"
                              data-testid={`button-review-${order.id}`}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExportOrderExcel(order)}
                              className="px-2 py-0.5 text-[11px] h-7 text-black border border-slate-300 rounded-md hover:bg-slate-100 hover:border-slate-400 transition-colors"
                              title="Export Order to Excel"
                              data-testid={`button-excel-${order.id}`}
                            >
                              Excel
                            </button>
                            {config.myApprovalStages.includes(order.workflowStage) &&
                              order.orderStatus !== 'draft' &&
                              config.showItemEdit &&
                              (user?.role === 'account_manager' ||
                                user?.role === 'admin' ||
                                user?.role === 'sales') && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsViewOnlyOrder(false);
                                  setSelectedOrder(order);
                                  setIsEditingOrder(true);
                                  setEditedItems([...order.rawItems]);
                                }}
                                className="px-2 py-0.5 text-[11px] h-7 text-black border border-slate-300 rounded-md hover:bg-slate-100 hover:border-slate-400 transition-colors"
                                title="Edit Order"
                                data-testid={`button-edit-${order.id}`}
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!selectedOrder} onOpenChange={() => {setSelectedOrder(null); setIsViewOnlyOrder(false); setIsEditingOrder(false); setEditedItems([]); setEditingDetails(false);}}>
        <DialogContent className="fixed inset-4 max-w-none w-auto max-h-none h-auto p-0 overflow-hidden flex flex-col bg-white rounded-xl shadow-xl border border-slate-200 translate-x-0 translate-y-0" aria-describedby="order-review-description">
          <DialogTitle className="sr-only">Order Review</DialogTitle>
          <DialogDescription id="order-review-description" className="sr-only">
            Review order details and approve or reject the order
          </DialogDescription>
          {selectedOrder && (
            <>
              <div className="bg-slate-100 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 px-2 py-1.5 flex-shrink-0 pr-12">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100" data-testid="text-modal-order-title">
                      Order #{selectedOrder.id.slice(-8).toUpperCase()}
                    </h2>
                    {getOrderStageBadge(selectedOrder)}
                    <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400 ml-2">
                      <span className="flex items-center gap-1"><User size={12} />{selectedOrder.customerName}</span>
                      <span className="flex items-center gap-1"><Mail size={12} />{selectedOrder.customerEmail || 'N/A'}</span>
                      {selectedOrder.customerPhone ? (
                        <span className="flex items-center gap-1"><Phone size={12} />{selectedOrder.customerPhone}</span>
                      ) : null}
                      <span className="flex items-center gap-1"><Package size={12} />{selectedOrder.rawItems.reduce((sum, i) => sum + i.quantity, 0)} units</span>
                      <span className="flex items-center gap-1">${selectedOrder.total.toFixed(2)}</span>
                      <button
                        type="button"
                        onClick={() => handleExportOrderExcel(selectedOrder)}
                        className="px-2 py-0.5 text-[11px] h-7 text-emerald-700 border border-emerald-300 bg-emerald-50 rounded-md hover:bg-emerald-100 hover:border-emerald-400 transition-colors"
                        title="Export Order to Excel"
                        data-testid={`button-modal-excel-${selectedOrder.id}`}
                      >
                        Excel
                      </button>
                      {selectedOrder.brand !== 'Others' && <span>• {selectedOrder.brand}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 text-xs text-slate-600 dark:text-slate-400 shrink-0">
                    {selectedOrder.workflowHistory[0]?.userName && (
                      <div>Created by {selectedOrder.workflowHistory[0].userName}</div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2 bg-gray-50">
                {/* Sales: Editable Approval Details */}
                {!isViewOnlyOrder && role === 'sales' && selectedOrder.workflowStage === 'sales_approval' && (
                  <div className="bg-white border border-slate-200 rounded-xl p-3 mb-2">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-slate-700 text-xs flex items-center gap-1.5">
                        <Pencil size={14} className="text-purple-500" />
                        Approval Details
                      </h3>
                      {!editingDetails ? (
                        <Button size="sm" variant="outline" onClick={handleStartEditDetails} className="text-purple-600 border-purple-300 hover:bg-purple-50 text-xs h-7" data-testid="button-edit-details">
                          <Pencil size={12} className="mr-1" /> Edit
                        </Button>
                      ) : (
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="outline" onClick={handleCancelEditDetails} className="h-7 text-xs" data-testid="button-cancel-edit-details">Cancel</Button>
                          <Button size="sm" onClick={handleSaveDetails} disabled={updateDetailsMutation.isPending} className="bg-purple-600 hover:bg-purple-700 h-7 text-xs" data-testid="button-save-details">
                            {updateDetailsMutation.isPending ? 'Saving...' : 'Save'}
                          </Button>
                        </div>
                      )}
                    </div>
                    {editingDetails ? (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-500">Discount %</Label>
                          <Input type="number" min="0" max="100" value={editDiscount} onChange={(e) => setEditDiscount(e.target.value)} className="h-8 text-sm" data-testid="input-edit-discount" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-500">Payment</Label>
                          <Select value={editPaymentMethod} onValueChange={setEditPaymentMethod}>
                            <SelectTrigger className="h-8 text-sm" data-testid="select-edit-payment"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cheques">Cheques</SelectItem>
                              <SelectItem value="card">Card</SelectItem>
                              <SelectItem value="cash">Cash</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-500">Delivery</Label>
                          <Select value={editDeliveryMethod} onValueChange={setEditDeliveryMethod}>
                            <SelectTrigger className="h-8 text-sm" data-testid="select-edit-delivery"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pickup_from_warehouse">Pickup from Warehouse</SelectItem>
                              <SelectItem value="delivery_to_store">Delivery to Store</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 text-xs">
                        <span className="px-2 py-1 bg-slate-50 rounded"><strong>{selectedOrder.discountPercent || 0}%</strong> off</span>
                        <span className="px-2 py-1 bg-slate-50 rounded capitalize">{selectedOrder.paymentMethod || 'N/A'}</span>
                        <span className="px-2 py-1 bg-slate-50 rounded">{selectedOrder.deliveryMethod?.replace(/_/g, ' ') || 'N/A'}</span>
                      </div>
                    )}
                  </div>
                )}

                {selectedOrder.workflowStage === 'rejected' &&
                  (() => {
                    const last = selectedOrder.workflowHistory.filter((h) => h.action === 'rejected').pop();
                    const text = String(selectedOrder.rejectionReason || last?.notes || '').trim();
                    const by = String(selectedOrder.rejectedBy || last?.userName || '').trim();
                    if (!text && !by) return null;
                    return (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-2">
                        <h3 className="font-semibold text-red-700 flex items-center gap-2 text-xs mb-2">
                          <XCircle size={14} />
                          Rejection details
                        </h3>
                        {by ? (
                          <div className="text-xs text-red-700 mb-1">
                            <span className="font-medium text-red-600">Rejected by:</span> {by}
                          </div>
                        ) : null}
                        {text ? <p className="text-xs text-red-600">{text}</p> : null}
                      </div>
                    );
                  })()}

                {!isEditingOrder && (
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="font-semibold text-slate-700 text-xs">Order Items</h3>
                    <div className="flex items-center gap-2">
                      {!isViewOnlyOrder &&
                        config.showItemEdit &&
                        config.myApprovalStages.includes(selectedOrder.workflowStage) &&
                        selectedOrder.orderStatus !== 'draft' &&
                        (user?.role === 'account_manager' ||
                          user?.role === 'admin' ||
                          user?.role === 'sales') && (
                          <Button
                            onClick={handleStartEditing}
                            size="sm"
                            variant="outline"
                            data-testid="button-edit-order"
                          >
                            <FileText size={14} className="mr-1" /> Edit
                          </Button>
                        )}
                      <Badge variant="outline" className="text-slate-600 border-slate-300">
                        {groupItemsForCartView(selectedOrder.rawItems).products.length}{' '}
                        {groupItemsForCartView(selectedOrder.rawItems).products.length === 1
                          ? 'product'
                          : 'products'}
                      </Badge>
                      <div className="flex bg-slate-200 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => setItemViewMode('cart')}
                          className={`p-1.5 rounded-md transition-all ${itemViewMode === 'cart' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                          title="Cart View"
                          data-testid="button-view-cart"
                        >
                          <LayoutGrid size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemViewMode('list')}
                          className={`p-1.5 rounded-md transition-all ${itemViewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                          title="List View"
                          data-testid="button-view-list"
                        >
                          <List size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-1 mb-2">
                  {isEditingOrder ? (
                    <div className="bg-white rounded-xl border border-blue-200 overflow-hidden flex flex-col min-h-[400px]">
                      <div className="bg-blue-50 px-3 py-1.5 border-b border-blue-200 flex items-center justify-between gap-2 shrink-0">
                        <div className="text-xs text-blue-700 font-medium flex items-center gap-1.5 min-w-0">
                          <FileText size={14} /> {isViewOnlyOrder ? 'Read-only view mode' : 'Editing Mode - Adjust quantities, remove or add items'}
                        </div>
                        {!isViewOnlyOrder && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              onClick={handleCancelEditing}
                              size="sm"
                              variant="outline"
                              className="border-slate-300 bg-white"
                              data-testid="button-cancel-edit"
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={handleAddItemViaShop}
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              disabled={isLaunchingShopEdit}
                              data-testid="button-add-item"
                            >
                              <Plus size={14} className="mr-1" />{' '}
                              {isLaunchingShopEdit ? 'Opening…' : 'Add Item'}
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col flex-1 min-h-0 bg-white">
                        {orderEditCartModel.isLoadingProducts || editOrderProductsLoading ? (
                          <div className="p-6 text-center text-muted-foreground">Loading products...</div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between px-4 pb-2 pt-3">
                              <h2 className="text-2xl font-bold flex items-center gap-2">
                                <span className="text-muted-foreground text-sm uppercase">
                                  Order items
                                </span>
                              </h2>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-700">Size:</span>
                                  <div
                                    className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5"
                                    data-testid="order-edit-size-standard-switcher"
                                  >
                                    {(['EU', 'US', 'UK'] as const).map((standard) => {
                                      const isAvailable = orderEditCartModel.hasSizeConversion
                                        ? orderEditCartModel.availableSizeStandards[standard]
                                        : true;
                                      return (
                                        <button
                                          key={standard}
                                          type="button"
                                          onClick={() => orderEditCartModel.setSelectedSizeStandard(standard)}
                                          className={`px-2 py-1 text-xs font-medium rounded-md transition-all ${
                                            orderEditCartModel.selectedSizeStandard === standard
                                              ? 'bg-white text-gray-900 shadow-sm'
                                              : isAvailable
                                                ? 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                                                : 'text-gray-400 hover:text-gray-600'
                                          }`}
                                          data-testid={`order-edit-size-standard-${standard.toLowerCase()}`}
                                        >
                                          {standard}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex-1 overflow-auto px-4 space-y-6 pb-4 min-h-[280px]">
                              {!orderEditCartModel.hasProducts ? (
                                <div className="p-6 border border-dashed border-gray-300 rounded-md text-center text-muted-foreground">
                                  No products in this order
                                </div>
                              ) : (
                                orderEditCartModel.productsByGender.map(([gender, genderProducts]) => {
                                  const categorySizes = [
                                    ...new Set(genderProducts.flatMap((p) => p.sizes)),
                                  ].sort((a, b) => {
                                    const numA = parseFloat(a);
                                    const numB = parseFloat(b);
                                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                                    return a.localeCompare(b);
                                  });
                                  return (
                                    <div key={gender} className="mb-6">
                                      <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-gray-200">
                                        <h3 className="text-lg font-bold text-gray-800">{gender}</h3>
                                        <span className="text-sm text-gray-500">
                                          ({genderProducts.length} product
                                          {genderProducts.length !== 1 ? 's' : ''})
                                        </span>
                                      </div>
                                      <ShopCartTable
                                        key={`order-edit-table-${gender}-${orderEditCartModel.selectedSizeStandard}`}
                                        products={genderProducts}
                                        allSizes={categorySizes}
                                        onQuantityChange={orderEditCartModel.handleQuantityChange}
                                        onBulkQuantityChange={orderEditCartModel.handleBulkQuantityChange}
                                        onRemoveProduct={orderEditCartModel.handleRemoveProduct}
                                        onToggleSelect={orderEditCartModel.handleToggleSelect}
                                        readOnly={isViewOnlyOrder}
                                        highlightedRows={new Set()}
                                        convertSize={orderEditCartModel.convertSize}
                                        selectedSizeStandard={orderEditCartModel.selectedSizeStandard}
                                      />
                                    </div>
                                  );
                                })
                              )}
                            </div>
                            <footer className="flex justify-center items-center p-4 border-t-2 border-black bg-white gap-4 shrink-0">
                              <div className="text-sm font-semibold">
                                Total Items: <span>{orderEditCartModel.totalItems}</span>
                              </div>
                              <div className="text-sm font-semibold">
                                Total Price:{' '}
                                <span>
                                  {getCurrencySymbol(userCurrency)}
                                  {orderEditCartModel.totalPrice.toFixed(2)}
                                </span>
                              </div>
                            </footer>
                          </>
                        )}
                      </div>
                    </div>
                  ) : selectedOrder.rawItems.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                      <Package size={32} className="mx-auto mb-2 opacity-40" />
                      <p className="font-medium text-sm">No items in this order</p>
                    </div>
                  ) : itemViewMode === 'list' ? (
                    (() => {
                      const { products } = groupItemsForCartView(selectedOrder.rawItems);
                      return (
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-y-auto max-h-[150px]">
                          <table className="w-full text-xs leading-tight">
                            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                              <tr>
                                <th className="text-left py-1 px-2 font-semibold text-slate-600 bg-slate-50 text-[11px]">#</th>
                                <th className="text-left py-1 px-2 font-semibold text-slate-600 bg-slate-50 text-[11px]">Product</th>
                                <th className="text-left py-1 px-2 font-semibold text-slate-600 bg-slate-50 text-[11px]">SKU</th>
                                <th className="text-left py-1 px-2 font-semibold text-slate-600 bg-slate-50 text-[11px]">Sizes</th>
                                <th className="text-center py-1 px-2 font-semibold text-slate-600 bg-slate-50 text-[11px]">Qty</th>
                                <th className="text-right py-1 px-2 font-semibold text-slate-600 bg-slate-50 text-[11px]">Price</th>
                                <th className="text-right py-1 px-2 font-semibold text-slate-600 bg-slate-50 text-[11px]">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {products.map((product, idx) => {
                                const isCarton = !!product.unitsPerCarton;
                                const sortedSizes = product.sizes.sort((a, b) => {
                                  const numA = parseFloat(a);
                                  const numB = parseFloat(b);
                                  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                                  return a.localeCompare(b);
                                });
                                const sizesDisplay = sortedSizes.length > 0 
                                  ? (sortedSizes.length > 3 ? `${sortedSizes[0]}-${sortedSizes[sortedSizes.length - 1]}` : sortedSizes.join(', '))
                                  : '-';
                                
                                return (
                                  <tr key={`${product.productId}-${idx}`} className="hover:bg-slate-50 transition-colors" data-testid={`list-row-${idx}`}>
                                    <td className="py-1 px-2 text-slate-400 font-medium text-[11px]">{idx + 1}</td>
                                    <td className="py-1 px-2">
                                      <div className="flex items-center gap-1">
                                        <span className="font-medium text-slate-800 text-[11px] leading-snug">{product.name}</span>
                                        {isCarton && (
                                          <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium">
                                            <Box size={10} />
                                            Carton
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-1 px-2 font-mono text-slate-500 text-[11px]">{product.sku}</td>
                                    <td className="py-1 px-2">
                                      <span className={`inline-flex items-center px-1 py-0 rounded text-[10px] font-medium ${isCarton ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-600'}`}>
                                        {sizesDisplay}
                                      </span>
                                    </td>
                                    <td className="py-1 px-2 text-center">
                                      <div className="flex flex-col items-center gap-0">
                                        <span className="font-bold text-slate-800 text-[11px]">
                                          {isCarton ? Math.ceil(product.totalQty / product.unitsPerCarton!) : product.totalQty}
                                        </span>
                                        {isCarton && (
                                          <span className="text-[9px] text-amber-600">cartons</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-1 px-2 text-right text-slate-500 text-[11px]">${product.price.toFixed(2)}</td>
                                    <td className="py-1 px-2 text-right font-bold text-slate-900 text-[11px]">${product.totalPrice.toFixed(2)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()
                  ) : (
                    (() => {
                      const { products, allSizes } = groupItemsForCartView(selectedOrder.rawItems);
                      return (
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                          <div className="overflow-x-auto overflow-y-auto max-h-[150px]">
                            <table className="w-full text-[11px] leading-tight border-collapse min-w-max">
                              <thead className="bg-gray-100 text-gray-700 sticky top-0 z-10">
                                <tr>
                                  <th className="text-left py-0.5 px-1.5 font-medium min-w-[140px] border-r border-gray-200">Product</th>
                                  <th className="text-left py-0.5 px-1.5 font-medium min-w-[72px] border-r border-gray-200">SKU</th>
                                  <th className="text-center py-0.5 px-1 font-medium min-w-[44px] border-r border-gray-200">Price</th>
                                  {allSizes.map(size => (
                                    <th key={size} className="text-center py-0.5 px-0.5 font-medium min-w-[32px] border-r border-gray-200">
                                      {size}
                                    </th>
                                  ))}
                                  <th className="text-center py-0.5 px-1.5 font-medium min-w-[44px] border-r border-gray-200">Qty</th>
                                  <th className="text-right py-0.5 px-1.5 font-medium min-w-[56px]">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {products.map((product, idx) => (
                                  <tr key={`${product.productId}-${idx}`} className="hover:bg-gray-50" data-testid={`cart-row-${idx}`}>
                                    <td className="py-0.5 px-1.5 border-r border-gray-100 align-top">
                                      <div className="min-w-0">
                                        <div className="font-medium text-gray-800 text-[11px] leading-snug">
                                          {product.name}
                                          {product.unitsPerCarton && (
                                            <span className="ml-1 text-[10px] text-gray-500">(Carton: {product.unitsPerCarton} pcs)</span>
                                          )}
                                        </div>
                                        <div className="text-[9px] text-gray-400 leading-none mt-0.5">{product.brand}</div>
                                      </div>
                                    </td>
                                    <td className="py-0.5 px-1.5 font-mono text-gray-500 text-[10px] border-r border-gray-100 align-top">{product.sku}</td>
                                    <td className="py-0.5 px-1 text-center text-gray-600 border-r border-gray-100 align-top">${product.price.toFixed(2)}</td>
                                    {allSizes.map(size => {
                                      const qty = product.quantities[size] || 0;
                                      return (
                                        <td key={size} className="py-0.5 px-0.5 text-center border-r border-gray-100 align-top">
                                          {qty > 0 ? (
                                            <span className="font-medium text-gray-800">{qty}</span>
                                          ) : (
                                            <span className="text-gray-300">-</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td className="py-0.5 px-1.5 text-center font-semibold text-gray-800 border-r border-gray-100 align-top">
                                      {product.unitsPerCarton ? Math.ceil(product.totalQty / product.unitsPerCarton) : product.totalQty}
                                    </td>
                                    <td className="py-0.5 px-1.5 text-right font-semibold text-gray-800 align-top">
                                      ${product.totalPrice.toFixed(2)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>

              </div>

              <div className="border-t border-slate-200 px-3 py-2 bg-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {!isViewOnlyOrder && selectedOrder.orderStatus === 'draft' && (
                    <Button
                      type="button"
                      onClick={() => navigate(`/cart/${selectedOrder.id}`)}
                      variant="default"
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      data-testid="button-modal-edit-draft-cart"
                    >
                      <ShoppingCart size={16} className="mr-1.5" />
                      Edit cart
                    </Button>
                  )}
                  {!isViewOnlyOrder &&
                    config.myApprovalStages.includes(selectedOrder.workflowStage) &&
                    selectedOrder.orderStatus !== 'draft' && (
                    <>
                      {role === 'account_manager' ? (
                        <Button 
                          onClick={() => handleOpenApprovalForm(selectedOrder.id)}
                          variant="ghost"
                          size="sm"
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          title="Approve Order"
                          data-testid="button-modal-approve"
                        >
                          <CheckCircle size={18} className="mr-1.5" />
                          Approve
                        </Button>
                      ) : (
                        <>
                          {role === 'sales' && (
                            <>
                              {!editingDetails ? (
                                <Button 
                                  onClick={handleStartEditDetails}
                                  variant="ghost"
                                  size="sm"
                                  className="text-slate-600 hover:text-slate-700 hover:bg-slate-50"
                                  title="Edit Details"
                                  data-testid="button-edit-details"
                                >
                                  <Pencil size={18} className="mr-1.5" />
                                  Edit Details
                                </Button>
                              ) : (
                                <>
                                  <Button 
                                    onClick={handleCancelEditDetails}
                                    variant="ghost"
                                    size="sm"
                                    className="border-slate-300"
                                    data-testid="button-cancel-edit-details"
                                  >
                                    Cancel
                                  </Button>
                                  <Button 
                                    onClick={handleSaveDetails}
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-700"
                                    disabled={updateDetailsMutation.isPending}
                                    data-testid="button-save-details"
                                  >
                                    {updateDetailsMutation.isPending ? 'Saving...' : 'Save'}
                                  </Button>
                                </>
                              )}
                            </>
                          )}
                          <Button 
                            onClick={() => handleSalesApprove(selectedOrder.id)}
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            title="Approve Order"
                            data-testid="button-modal-approve"
                            disabled={salesApproveMutation.isPending}
                          >
                            <CheckCircle size={18} className="mr-1.5" />
                            Approve
                          </Button>
                        </>
                      )}
                      <Button 
                        onClick={() => handleOpenRejectDialog(selectedOrder.id)}
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Reject Order"
                        data-testid="button-modal-reject"
                      >
                        <XCircle size={18} className="mr-1.5" />
                        Reject
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!isViewOnlyOrder && isEditingOrder && (
                    <Button
                      onClick={handleSaveEdits}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                      disabled={updateItemsMutation.isPending}
                      data-testid="button-save-edit"
                    >
                      {updateItemsMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      setSelectedOrder(null);
                      setIsViewOnlyOrder(false);
                    }}
                    variant="outline"
                    size="sm"
                    className="border-slate-300"
                    data-testid="button-modal-close"
                  >
                    Close
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {config.showAiChat && showChat && (
        <div className="fixed inset-y-0 right-0 w-full md:w-[400px] bg-white shadow-2xl z-[150] flex flex-col border-l border-slate-200">
          <div className="bg-[#2a4365] text-white p-6 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-lg">
              <Sparkles className="text-red-400" />
              OrderFlow Assistant
            </div>
            <Button 
              onClick={() => setShowChat(false)} 
              variant="ghost" 
              size="icon"
              className="text-white hover:bg-slate-700"
              data-testid="button-close-chat"
            >
              <X size={20} />
            </Button>
          </div>
          
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-2xl text-slate-600 text-sm border border-slate-100">
                Hi! I'm your order assistant. I can help you summarize pending orders, identify trends, or help you draft responses for returned orders.
              </div>
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                    msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none shadow-md' 
                    : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
              <Input 
                type="text" 
                placeholder="Ask me anything about orders..."
                className="flex-1 border-0 focus-visible:ring-0 p-0"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGeneralChat()}
                data-testid="input-chat"
              />
              <Button 
                onClick={handleGeneralChat}
                variant="ghost"
                size="icon"
                className="text-blue-600 hover:text-blue-800"
                data-testid="button-send-chat"
              >
                <Send size={20} />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Account Manager Approval Form Dialog */}
      <Dialog open={showApprovalForm} onOpenChange={setShowApprovalForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base">Approve Order</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="discount" className="text-sm">Discount %</Label>
              <div className="relative">
                <Input
                  id="discount"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  className="pr-8 h-9"
                  placeholder="0"
                  data-testid="input-discount"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="payment" className="text-sm">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="payment" className="h-9" data-testid="select-payment-method">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cheques">Cheques</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="delivery" className="text-sm">Delivery Method</Label>
              <Select value={deliveryMethod} onValueChange={setDeliveryMethod}>
                <SelectTrigger id="delivery" className="h-9" data-testid="select-delivery-method">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pickup_from_warehouse">Pickup from Warehouse</SelectItem>
                  <SelectItem value="delivery_to_store">Delivery to Store</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes" className="text-sm">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Add notes..."
                className="resize-none h-16"
                data-testid="textarea-notes"
              />
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowApprovalForm(false);
                setApprovalOrderId(null);
              }}
              data-testid="button-cancel-approval"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitApproval}
              disabled={accountManagerApproveMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-confirm-approval"
            >
              {accountManagerApproveMutation.isPending ? 'Processing...' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Order Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="text-red-500" size={20} />
              Reject Order
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this order.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rejectReason" className="text-sm font-medium">
                Rejection Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="rejectReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter the reason for rejection..."
                className="resize-none"
                rows={4}
                data-testid="textarea-reject-reason"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setRejectOrderId(null);
                setRejectReason('');
              }}
              data-testid="button-cancel-reject"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReject}
              disabled={rejectMutation.isPending || !rejectReason.trim()}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? 'Processing...' : 'Reject Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={showAddItemDialog} onOpenChange={setShowAddItemDialog}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-6 sm:max-w-lg">
          <DialogHeader className="shrink-0 space-y-1.5 pr-8 text-left">
            <DialogTitle className="flex items-center gap-2">
              <Plus className="text-green-500" size={20} />
              Add Item to Order
            </DialogTitle>
            <DialogDescription>
              Search for a product and select the size and quantity to add.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto py-4">
            <div className="min-w-0 max-w-full space-y-4">
            <div className="space-y-2">
              <Label htmlFor="productSearch" className="text-sm font-medium">
                Search Product
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input
                  id="productSearch"
                  type="text"
                  placeholder="Search by name or SKU..."
                  value={productSearchTerm}
                  onChange={(e) => setProductSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-product-search"
                />
              </div>
            </div>

            {!selectedProductForAdd ? (
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                {addItemProductsLoading ? (
                  <div className="p-4 text-center text-slate-400 text-sm">
                    {debouncedProductSearch.trim() ? 'Searching catalog…' : 'Loading products…'}
                  </div>
                ) : addItemProducts.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">
                    {debouncedProductSearch.trim()
                      ? 'No products found. Try another name or SKU.'
                      : 'Type a product name or SKU to search, or browse the list below.'}
                  </div>
                ) : (
                  addItemProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => setSelectedProductForAdd(product)}
                      className="flex w-full items-center gap-3 text-left px-4 py-3 hover:bg-slate-50 border-b last:border-b-0 transition-colors"
                      data-testid={`button-select-product-${product.id}`}
                    >
                      <AddItemProductThumb product={product} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-800">{product.name}</div>
                        <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>{product.sku}</span>
                          <span>•</span>
                          <span>${unitPriceFromProduct(product).toFixed(2)}</span>
                          {product.brand && <><span>•</span><span>{product.brand}</span></>}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <AddItemProductThumb product={selectedProductForAdd} />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800">{selectedProductForAdd.name}</div>
                      <div className="text-xs text-slate-500">
                        {selectedProductForAdd.sku} • ${unitPriceFromProduct(selectedProductForAdd).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedProductForAdd(null)}
                    className="text-slate-500 hover:text-slate-700"
                    data-testid="button-change-product"
                  >
                    Change
                  </Button>
                </div>
              </div>
            )}

            {selectedProductForAdd && addItemSizeEntries.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Sizes & quantities <span className="text-red-500">*</span>
                </Label>
                <p className="text-xs text-slate-500">
                  Quantities are capped by stock when tracked, and by order limits on pre-order or limited
                  products. If there is no stock figure and no limit, you can enter any quantity.
                </p>
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full border-collapse text-sm min-w-max">
                    <tbody>
                      <tr>
                        {addItemSizeEntries.map((e) => {
                          const maxQ = addItemMaxQtyForSize(
                            e,
                            selectedProductForAdd.limitOrder,
                          );
                          const showStock = e.stockDisplay !== null;
                          const showMaxLine = maxQ !== undefined;
                          return (
                            <td
                              key={`h-${e.size}`}
                              className="relative w-16 min-w-[4rem] max-w-[4.5rem] border border-slate-200 bg-slate-50 p-1.5 text-center align-middle"
                            >
                              <div className="flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5">
                                <span className="text-sm font-semibold leading-none text-slate-900">
                                  {e.size}
                                </span>
                                {(showStock || showMaxLine) && (
                                  <div className="flex flex-col gap-0 text-[10px] leading-tight text-slate-500">
                                    {showStock && (
                                      <span title="Catalog stock (informational on pre-order)">
                                        {e.stockDisplay}
                                      </span>
                                    )}
                                    {showMaxLine && (
                                      <span title="Maximum quantity you can add">
                                        max {maxQ}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              {maxQ === 0 && (
                                <span className="absolute right-0.5 top-0.5 rounded bg-amber-100 px-0.5 text-[9px] text-amber-800">
                                  0
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        {addItemSizeEntries.map((e) => {
                          const maxQ = addItemMaxQtyForSize(
                            e,
                            selectedProductForAdd.limitOrder,
                          );
                          const val = addItemQuantities[e.size] ?? 0;
                          return (
                            <td
                              key={`q-${e.size}`}
                              className="border border-slate-200 p-1 align-middle min-w-[3.25rem]"
                            >
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                step={1}
                                {...(maxQ !== undefined ? { max: maxQ } : {})}
                                disabled={maxQ === 0}
                                className="h-9 w-full min-w-[2.75rem] px-1 text-center text-sm tabular-nums"
                                value={val}
                                placeholder="0"
                                data-testid={`input-add-qty-${e.size}`}
                                onChange={(ev) => {
                                  const raw = ev.target.value;
                                  let n = parseInt(raw, 10);
                                  if (raw === '' || isNaN(n)) n = 0;
                                  n = Math.max(0, n);
                                  if (maxQ !== undefined) n = Math.min(n, maxQ);
                                  setAddItemQuantities((prev) => ({
                                    ...prev,
                                    [e.size]: n,
                                  }));
                                }}
                                onBlur={(ev) => {
                                  if (maxQ === undefined) return;
                                  let n = parseInt(ev.target.value, 10);
                                  if (isNaN(n) || n < 0) n = 0;
                                  n = Math.min(n, maxQ);
                                  setAddItemQuantities((prev) => ({
                                    ...prev,
                                    [e.size]: n,
                                  }));
                                }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedProductForAdd && addItemSizeEntries.length === 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="addItemSize" className="text-sm font-medium">
                    Size <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="addItemSize"
                    type="text"
                    placeholder="e.g. 42, M, XL"
                    value={addItemManualSize}
                    onChange={(e) => setAddItemManualSize(e.target.value)}
                    data-testid="input-add-size"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="addItemQty" className="text-sm font-medium">
                    Quantity <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="addItemQty"
                    type="number"
                    min={1}
                    value={addItemManualQty}
                    onChange={(e) => setAddItemManualQty(parseInt(e.target.value, 10) || 1)}
                    data-testid="input-add-quantity"
                  />
                </div>
                <p className="col-span-2 text-xs text-slate-500">
                  This product has no size grid in the catalog. Enter size and quantity manually.
                </p>
              </div>
            )}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-slate-200 pt-4 mt-0 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setShowAddItemDialog(false)}
              data-testid="button-cancel-add-item"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAddItem}
              disabled={
                !selectedProductForAdd ||
                (addItemSizeEntries.length > 0
                  ? !addItemSizeEntries.some((e) => (addItemQuantities[e.size] ?? 0) > 0)
                  : !addItemManualSize.trim() || addItemManualQty < 1)
              }
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-confirm-add-item"
            >
              Add to Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create customer cart — multi-item builder (same product/size logic as Add Item) */}
      <Dialog
        open={showCreateCartDialog}
        onOpenChange={(open) => {
          setShowCreateCartDialog(open);
          if (!open) resetCreateCartDialog();
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-6 sm:max-w-lg">
          <DialogHeader className="shrink-0 space-y-1.5 pr-8 text-left">
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="text-green-600" size={20} />
              Create customer order
            </DialogTitle>
            <DialogDescription>
              Choose the customer, add products and quantities, then confirm. The order is submitted as a new pending order (not a draft) for your approval queue. Stock and pre-order lines cannot be mixed—the cart type is chosen automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto py-4">
            <div className="min-w-0 max-w-full space-y-4">
              <div className="space-y-2">
                <Label htmlFor="create-cart-customer" className="text-sm font-medium">
                  Customer <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={createCartCustomerId || undefined}
                  onValueChange={setCreateCartCustomerId}
                >
                  <SelectTrigger id="create-cart-customer" data-testid="select-create-cart-customer">
                    <SelectValue placeholder="Select customer…" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableCustomers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {(c.displayName || c.username || 'Customer')} — {c.email || c.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assignableCustomers.length === 0 && (
                  <p className="text-xs text-amber-700">
                    No customers available. Account managers only see customers assigned to them.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="newCartProductSearch" className="text-sm font-medium">
                  Search product
                </Label>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        size={16}
                      />
                      <Input
                        id="newCartProductSearch"
                        type="text"
                        placeholder="Name or SKU — suggestions appear as you type"
                        value={newCartSearchTerm}
                        onChange={(e) => setNewCartSearchTerm(e.target.value)}
                        onFocus={() => setNewCartSearchFocused(true)}
                        onBlur={() => {
                          window.setTimeout(() => setNewCartSearchFocused(false), 180);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setNewCartSearchFocused(false);
                            return;
                          }
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            if (!newCartSuggestions.length) return;
                            setNewCartSuggestHighlight((h) =>
                              Math.min(newCartSuggestions.length - 1, h + 1),
                            );
                            return;
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            if (!newCartSuggestions.length) return;
                            setNewCartSuggestHighlight((h) => (h <= 0 ? -1 : h - 1));
                            return;
                          }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const inSync =
                              newCartDebouncedSearch.trim() === newCartSearchTerm.trim();
                            if (
                              inSync &&
                              newCartSuggestHighlight >= 0 &&
                              newCartSuggestHighlight < newCartSuggestions.length
                            ) {
                              pickNewCartSuggestion(newCartSuggestions[newCartSuggestHighlight]);
                              return;
                            }
                            void submitNewCartProductSearch();
                          }
                        }}
                        className="pl-10"
                        autoComplete="off"
                        data-testid="input-create-cart-search"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0 self-start"
                      onClick={() =>
                        void submitNewCartProductSearch(
                          newCartSuggestHighlight >= 0 ? newCartSuggestHighlight : undefined,
                        )
                      }
                      data-testid="button-create-cart-run-search"
                    >
                      Search
                    </Button>
                  </div>
                  {!newCartSelectedProduct &&
                    newCartSearchFocused &&
                    newCartSearchTerm.trim().length > 0 && (
                      <div
                        className="max-h-52 overflow-y-auto rounded-md border border-slate-200 bg-background shadow-sm"
                        data-testid="create-cart-suggest-panel"
                      >
                        {newCartDebouncedSearch.trim() !== newCartSearchTerm.trim() ? (
                          <div className="px-3 py-2.5 text-center text-sm text-slate-500">
                            Typing…
                          </div>
                        ) : newCartSuggestionsLoading ? (
                          <div className="px-3 py-2.5 text-center text-sm text-slate-500">
                            Searching catalog…
                          </div>
                        ) : newCartSuggestions.length === 0 ? (
                          <div className="px-3 py-2.5 text-center text-sm text-slate-500">
                            No matches
                          </div>
                        ) : (
                          <ul className="m-0 list-none divide-y divide-slate-100 p-0">
                            {newCartSuggestions.map((product: any, idx: number) => (
                              <li key={product.id} className="m-0 p-0">
                                <button
                                  type="button"
                                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 ${
                                    idx === newCartSuggestHighlight ? 'bg-slate-100' : ''
                                  }`}
                                  data-testid={`button-create-cart-suggest-${product.id}`}
                                  onMouseDown={(ev) => {
                                    ev.preventDefault();
                                    pickNewCartSuggestion(product);
                                  }}
                                >
                                  <AddItemProductThumb product={product} />
                                  <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="flex flex-wrap items-center gap-2">
                                      <span className="font-medium text-slate-800">{product.name}</span>
                                      {product.isPreOrder && (
                                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                                          Pre-order
                                        </span>
                                      )}
                                    </span>
                                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                                      <span>{product.sku}</span>
                                      <span>•</span>
                                      <span>${unitPriceFromProduct(product).toFixed(2)}</span>
                                      {product.brand && (
                                        <>
                                          <span>•</span>
                                          <span>{product.brand}</span>
                                        </>
                                      )}
                                    </span>
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                </div>
              </div>

              {newCartSelectedProduct ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <AddItemProductThumb product={newCartSelectedProduct} />
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800">{newCartSelectedProduct.name}</div>
                        <div className="text-xs text-slate-500">
                          {newCartSelectedProduct.sku} • ${unitPriceFromProduct(newCartSelectedProduct).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setNewCartSelectedProduct(null)}
                      className="text-slate-500 hover:text-slate-700"
                      data-testid="button-create-cart-change-product"
                    >
                      Change
                    </Button>
                  </div>
                </div>
              ) : null}

              {newCartSelectedProduct && newCartSizeEntries.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Sizes & quantities <span className="text-red-500">*</span>
                  </Label>
                  <p className="text-xs text-slate-500">
                    Quantities are capped by stock when tracked, and by order limits on pre-order or limited
                    products. If there is no stock figure and no limit, you can enter any quantity.
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full border-collapse text-sm min-w-max">
                      <tbody>
                        <tr>
                          {newCartSizeEntries.map((e) => {
                            const maxQ = addItemMaxQtyForSize(e, newCartSelectedProduct.limitOrder);
                            const showStock = e.stockDisplay !== null;
                            const showMaxLine = maxQ !== undefined;
                            return (
                              <td
                                key={`nc-h-${e.size}`}
                                className="relative w-16 min-w-[4rem] max-w-[4.5rem] border border-slate-200 bg-slate-50 p-1.5 text-center align-middle"
                              >
                                <div className="flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5">
                                  <span className="text-sm font-semibold leading-none text-slate-900">{e.size}</span>
                                  {(showStock || showMaxLine) && (
                                    <div className="flex flex-col gap-0 text-[10px] leading-tight text-slate-500">
                                      {showStock && <span title="Catalog stock">{e.stockDisplay}</span>}
                                      {showMaxLine && (
                                        <span title="Maximum quantity you can add">max {maxQ}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {maxQ === 0 && (
                                  <span className="absolute right-0.5 top-0.5 rounded bg-amber-100 px-0.5 text-[9px] text-amber-800">
                                    0
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          {newCartSizeEntries.map((e) => {
                            const maxQ = addItemMaxQtyForSize(e, newCartSelectedProduct.limitOrder);
                            const val = newCartQuantities[e.size] ?? 0;
                            return (
                              <td
                                key={`nc-q-${e.size}`}
                                className="border border-slate-200 p-1 align-middle min-w-[3.25rem]"
                              >
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  step={1}
                                  {...(maxQ !== undefined ? { max: maxQ } : {})}
                                  disabled={maxQ === 0}
                                  className="h-9 w-full min-w-[2.75rem] px-1 text-center text-sm tabular-nums"
                                  value={val}
                                  placeholder="0"
                                  data-testid={`input-create-cart-qty-${e.size}`}
                                  onChange={(ev) => {
                                    const raw = ev.target.value;
                                    let n = parseInt(raw, 10);
                                    if (raw === '' || isNaN(n)) n = 0;
                                    n = Math.max(0, n);
                                    if (maxQ !== undefined) n = Math.min(n, maxQ);
                                    setNewCartQuantities((prev) => ({ ...prev, [e.size]: n }));
                                  }}
                                  onBlur={(ev) => {
                                    if (maxQ === undefined) return;
                                    let n = parseInt(ev.target.value, 10);
                                    if (isNaN(n) || n < 0) n = 0;
                                    n = Math.min(n, maxQ);
                                    setNewCartQuantities((prev) => ({ ...prev, [e.size]: n }));
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {newCartSelectedProduct && newCartSizeEntries.length === 0 && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="newCartManualSize" className="text-sm font-medium">
                      Size <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="newCartManualSize"
                      type="text"
                      placeholder="e.g. 42, M, XL"
                      value={newCartManualSize}
                      onChange={(e) => setNewCartManualSize(e.target.value)}
                      data-testid="input-create-cart-manual-size"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newCartManualQty" className="text-sm font-medium">
                      Quantity <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="newCartManualQty"
                      type="number"
                      min={1}
                      value={newCartManualQty}
                      onChange={(e) => setNewCartManualQty(parseInt(e.target.value, 10) || 1)}
                      data-testid="input-create-cart-manual-qty"
                    />
                  </div>
                  <p className="col-span-2 text-xs text-slate-500">
                    This product has no size grid in the catalog. Enter size and quantity manually.
                  </p>
                </div>
              )}

              {newCartSelectedProduct && (
                <Button
                  type="button"
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={handleAddCurrentProductToNewCartList}
                  disabled={
                    newCartSizeEntries.length > 0
                      ? !newCartSizeEntries.some((e) => (newCartQuantities[e.size] ?? 0) > 0)
                      : !newCartManualSize.trim() || newCartManualQty < 1
                  }
                  data-testid="button-create-cart-add-lines"
                >
                  Add to cart list
                </Button>
              )}

              {newCartPendingLines.length > 0 && (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm font-medium">
                      Cart so far ({newCartPendingLines.length}{' '}
                      {newCartPendingLines.length === 1 ? 'line' : 'lines'})
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-slate-600"
                      onClick={() => setNewCartPendingLines([])}
                      data-testid="button-create-cart-clear-all"
                    >
                      Clear all
                    </Button>
                  </div>
                  <div className="max-h-36 overflow-y-auto rounded-md border bg-white divide-y">
                    {newCartPendingLines.map((line, idx) => (
                      <div
                        key={`${line.productId}-${line.size}-${idx}`}
                        className="flex items-center gap-2 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-800 truncate">{line.productName}</div>
                          <div className="text-xs text-slate-500">
                            {line.sku} · {line.size} × {line.quantity} · ${line.totalPrice.toFixed(2)}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-slate-500"
                          onClick={() => setNewCartPendingLines((prev) => prev.filter((_, i) => i !== idx))}
                          data-testid={`button-create-cart-remove-line-${idx}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-slate-200 pt-4 mt-0 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setShowCreateCartDialog(false)}
              disabled={isFinalizingNewCart}
              data-testid="button-create-cart-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleFinalizeNewCart}
              disabled={
                !createCartCustomerId ||
                newCartPendingLines.length === 0 ||
                isFinalizingNewCart ||
                isCreatingDraft
              }
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-create-cart-submit"
            >
              {isFinalizingNewCart || isCreatingDraft ? 'Submitting…' : 'Create order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AccountManagerPage() {
  return <OrdersDashboard role="account_manager" />;
}
