import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Package, 
  FileText, 
  Users, 
  Search, 
  Eye, 
  DollarSign,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Building2,
  ShoppingCart,
  User,
  Mail,
  Calendar,
  Hash,
  LayoutGrid,
  List,
  Box,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import type { Order } from '@shared/schema';

type WorkflowStage = 'new_order' | 'account_manager_approval' | 'sales_approval' | 'finance_approval' | 'admin_approval' | 'completed' | 'rejected';

/** Stage filter keys for dashboard cards (replaces two separate “New order” + “Account manager” buckets). */
type GlobalStageFilter = WorkflowStage | 'am_queue';

const AM_QUEUE_STAGES = new Set<WorkflowStage>(['new_order', 'account_manager_approval']);

/** Per-order badge labels/styles (all WorkflowStage values). */
const STAGE_BADGE_STYLES: { stage: WorkflowStage; label: string; color: string; bgColor: string }[] = [
  { stage: 'new_order', label: 'New Order', color: 'text-slate-600', bgColor: 'bg-slate-100' },
  { stage: 'account_manager_approval', label: 'Account Manager', color: 'text-red-600', bgColor: 'bg-red-100' },
  { stage: 'sales_approval', label: 'Sales', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  { stage: 'finance_approval', label: 'Finance', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  { stage: 'admin_approval', label: 'Admin', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  { stage: 'completed', label: 'Completed', color: 'text-green-600', bgColor: 'bg-green-100' },
  { stage: 'rejected', label: 'Rejected', color: 'text-red-600', bgColor: 'bg-red-100' },
];

const STAGE_CARDS: {
  filter: GlobalStageFilter;
  label: string;
  caption?: string;
  icon: any;
  color: string;
  bgColor: string;
}[] = [
  {
    filter: 'am_queue',
    label: 'Account manager',
    caption: 'New order + AM approval',
    icon: Users,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  { filter: 'sales_approval', label: 'Sales', icon: DollarSign, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  { filter: 'finance_approval', label: 'Finance', icon: FileText, color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  { filter: 'admin_approval', label: 'Admin', icon: Building2, color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  { filter: 'completed', label: 'Completed', icon: CheckCircle2, color: 'text-green-600', bgColor: 'bg-green-100' },
  { filter: 'rejected', label: 'Rejected', icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-100' },
];

interface OrderFlowOrder {
  id: string;
  orderName: string;
  customerName: string;
  customerEmail: string;
  brand: string;
  workflowStage: WorkflowStage;
  date: string;
  total: number;
  items: {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    price: number;
    total: number;
    brand: string;
    size?: string;
    color?: string;
  }[];
  discountPercent?: string;
  paymentMethod?: string;
  deliveryMethod?: string;
  rejectionReason?: string;
  rejectedBy?: string;
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
}

export default function GlobalOrdersPage() {
  const { user, isAdmin, isStaff, isAccountManager } = useAuth();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [activeStageFilter, setActiveStageFilter] = useState<GlobalStageFilter | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderFlowOrder | null>(null);
  const [itemViewMode, setItemViewMode] = useState<'cart' | 'list'>('cart');

  const hasAccess = isAdmin || isStaff || isAccountManager;

  const { data: ordersData = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ['/api/admin/orders'],
    enabled: hasAccess,
  });

  const orders: OrderFlowOrder[] = useMemo(() => {
    // Draft shop carts default to workflow_stage `new_order` in DB — exclude them from pipeline counts/list.
    return ordersData
      .filter((order) => order.status !== 'draft')
      .map((order) => {
      const items = (order.items || []).map((item: any, idx: number) => ({
        id: item.productId || `item-${idx}`,
        name: item.productName || 'Unknown Product',
        sku: item.sku || 'N/A',
        quantity: item.quantity || 0,
        price: typeof item.unitPrice === 'number' ? item.unitPrice : parseFloat(item.unitPrice) || 0,
        total: typeof item.totalPrice === 'number' ? item.totalPrice : parseFloat(item.totalPrice) || ((item.quantity || 0) * (parseFloat(item.unitPrice) || 0)),
        brand: item.brand || 'Unknown',
        size: item.size || '',
        color: item.color || '',
      }));

      const primaryBrand = items[0]?.brand || 'Others';
      const normalizedBrand = primaryBrand.toLowerCase().includes('adidas') ? 'Adidas' :
                              primaryBrand.toLowerCase().includes('nike') ? 'Nike' :
                              primaryBrand.toLowerCase().includes('reebok') ? 'Reebok' : 'Others';

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
        orderName: (order as any).orderName || `Order ${order.id.slice(0, 8)}`,
        customerName: order.customerName || 'Unknown Customer',
        customerEmail: order.customerEmail || '',
        brand: normalizedBrand,
        workflowStage,
        date: order.createdAt ? new Date(order.createdAt).toLocaleDateString() : new Date().toLocaleDateString(),
        total: typeof order.total === 'number' ? order.total : parseFloat(order.total) || 0,
        items,
        discountPercent: (order as any).discountPercent || '',
        paymentMethod: (order as any).paymentMethod || '',
        deliveryMethod: (order as any).deliveryMethod || '',
        rejectionReason: (order as any).rejectionReason || '',
        rejectedBy: (() => {
          const history = (order as any).workflowHistory || [];
          const rejectionEntry = history.find((h: any) => h.action === 'rejected');
          return rejectionEntry?.userName || '';
        })(),
      };
    });
  }, [ordersData]);

  const stats = useMemo(() => ({
    accountManagerQueue: orders.filter((o) => AM_QUEUE_STAGES.has(o.workflowStage)).length,
    salesApproval: orders.filter(o => o.workflowStage === 'sales_approval').length,
    financeApproval: orders.filter(o => o.workflowStage === 'finance_approval').length,
    adminApproval: orders.filter(o => o.workflowStage === 'admin_approval').length,
    completed: orders.filter(o => o.workflowStage === 'completed').length,
    rejected: orders.filter(o => o.workflowStage === 'rejected').length,
  }), [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesSearch = o.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            o.orderName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStage =
        activeStageFilter == null
          ? true
          : activeStageFilter === 'am_queue'
            ? AM_QUEUE_STAGES.has(o.workflowStage)
            : o.workflowStage === activeStageFilter;
      return matchesSearch && matchesStage;
    });
  }, [orders, searchTerm, activeStageFilter]);

  const groupItemsForCartView = (items: OrderFlowOrder['items']): { products: GroupedCartProduct[], allSizes: string[] } => {
    const productMap = new Map<string, GroupedCartProduct>();
    const allSizesSet = new Set<string>();

    items.forEach(item => {
      const key = `${item.id}-${item.sku}`;
      if (item.size) allSizesSet.add(item.size);

      if (productMap.has(key)) {
        const existing = productMap.get(key)!;
        if (item.size) {
          existing.quantities[item.size] = (existing.quantities[item.size] || 0) + item.quantity;
          if (!existing.sizes.includes(item.size)) {
            existing.sizes.push(item.size);
          }
        }
        existing.totalQty += item.quantity;
        existing.totalPrice += item.total;
      } else {
        productMap.set(key, {
          productId: item.id,
          name: item.name,
          sku: item.sku,
          brand: item.brand,
          color: item.color || '',
          price: item.price,
          sizes: item.size ? [item.size] : [],
          quantities: item.size ? { [item.size]: item.quantity } : {},
          totalQty: item.quantity,
          totalPrice: item.total,
        });
      }
    });

    const allSizes = Array.from(allSizesSet).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });

    return { products: Array.from(productMap.values()), allSizes };
  };

  const getStageBadge = (stage: WorkflowStage) => {
    const stageInfo = STAGE_BADGE_STYLES.find((s) => s.stage === stage);
    if (!stageInfo) {
      return (
        <Badge className="text-[10px] px-1.5 py-0 font-medium leading-tight border-0">{stage}</Badge>
      );
    }
    
    return (
      <Badge
        className={`${stageInfo.bgColor} ${stageInfo.color} hover:${stageInfo.bgColor} text-[10px] px-1.5 py-0 font-medium leading-tight border-0`}
      >
        {stageInfo.label}
      </Badge>
    );
  };

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <Card className="max-w-md shadow-md border-slate-200">
          <CardContent className="p-6 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-800 mb-1.5">Access Denied</h2>
            <p className="text-slate-500 text-sm leading-snug">
              You don&apos;t have permission to access the Global Orders Dashboard. Only staff members can access this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col">
      <main className="flex-1 max-w-7xl mx-auto w-full p-2 md:p-4 space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 leading-tight" data-testid="text-page-title">
                Global Orders Dashboard
              </h1>
              <p className="text-slate-500 text-xs mt-0.5">Track all orders across all workflow stages</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-slate-600 text-[11px] px-2 py-0.5 font-normal border-slate-200">
                {user?.displayName || user?.username || 'Staff'} ({user?.role})
              </Badge>
            </div>
          </div>
        </section>

        {/* Workflow Stage Cards — single horizontal row; scroll on narrow screens */}
        <section className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-row flex-nowrap items-stretch gap-2 w-full overflow-x-auto pb-0.5 [scrollbar-width:thin]">
          {STAGE_CARDS.map(({ filter, label, caption, icon: Icon, color, bgColor }) => {
            const getCardCount = (f: GlobalStageFilter): number => {
              switch (f) {
                case 'am_queue':
                  return stats.accountManagerQueue;
                case 'sales_approval':
                  return stats.salesApproval;
                case 'finance_approval':
                  return stats.financeApproval;
                case 'admin_approval':
                  return stats.adminApproval;
                case 'completed':
                  return stats.completed;
                case 'rejected':
                  return stats.rejected;
                default:
                  return 0;
              }
            };
            const count = getCardCount(filter);
            const isActive = activeStageFilter === filter;

            return (
              <Card 
                key={filter}
                className={`min-w-[5.75rem] flex-1 basis-0 cursor-pointer transition-all hover:shadow-md sm:min-w-0 shadow-sm border-slate-200 ${isActive ? 'ring-2 ring-blue-500 ring-offset-0' : ''}`}
                onClick={() => setActiveStageFilter(isActive ? null : filter)}
                data-testid={`stage-card-${filter}`}
              >
                <CardContent className="p-2 h-full flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <div className={`w-7 h-7 rounded-md ${bgColor} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-3.5 h-3.5 ${color}`} />
                    </div>
                    <span className="text-lg font-bold text-slate-800 tabular-nums leading-none">{count}</span>
                  </div>
                  <p className="text-[10px] leading-tight text-slate-500 line-clamp-2">
                    {caption ? (
                      <>
                        <span className="font-medium text-slate-700">{label}</span>
                        <span className="block text-slate-400">{caption}</span>
                      </>
                    ) : (
                      label
                    )}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
        </section>

        {/* Search */}
        <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              placeholder="Search by order ID, customer name, or order name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-8 text-xs border-slate-200"
              data-testid="input-search-orders"
            />
          </div>
          {activeStageFilter && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 self-start sm:self-auto h-8 text-xs px-3 border-slate-200"
              onClick={() => setActiveStageFilter(null)}
            >
              Clear stage filter
            </Button>
          )}
        </div>
        </section>

        {/* Orders List */}
        <section className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm min-h-[120px]">
        {ordersLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <Card className="border-slate-200 shadow-none">
            <CardContent className="p-8 text-center">
              <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-medium text-slate-600">No orders found</h3>
              <p className="text-slate-400 text-xs">Try adjusting your search or filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredOrders.map(order => (
              <Card 
                key={order.id}
                className="hover:shadow-md transition-shadow cursor-pointer shadow-sm border-slate-200"
                onClick={() => setSelectedOrder(order)}
                data-testid={`order-card-${order.id}`}
              >
                <CardContent className="p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                        <ShoppingCart className="w-4 h-4 text-slate-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-semibold text-slate-800 text-sm leading-tight truncate max-w-[min(100%,28rem)]">
                            {order.orderName}
                          </h3>
                          {getStageBadge(order.workflowStage)}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {order.customerName} • {order.date}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="font-semibold text-slate-800 text-sm tabular-nums">${order.total.toFixed(2)}</p>
                        <p className="text-[10px] text-slate-500">{order.items.length} items</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        </section>
      </main>

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-4 gap-3 border border-slate-200">
          <DialogHeader className="space-y-1 pb-0">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <ShoppingCart className="w-4 h-4 shrink-0" />
              <span className="truncate">{selectedOrder?.orderName}</span>
              {selectedOrder && getStageBadge(selectedOrder.workflowStage)}
            </DialogTitle>
          </DialogHeader>
          
          {selectedOrder && (
            <ScrollArea className="flex-1 pr-3 max-h-[calc(90vh-5rem)]">
              <div className="space-y-3 text-xs">
                {/* Customer Info */}
                <div className="grid grid-cols-2 gap-2 gap-x-4">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-slate-600 truncate">{selectedOrder.customerName}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-slate-600 truncate">{selectedOrder.customerEmail || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-slate-600">{selectedOrder.date}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-slate-600 font-mono">{selectedOrder.id.slice(0, 8)}</span>
                  </div>
                </div>

                {/* Approval Info (if available) */}
                {(selectedOrder.discountPercent || selectedOrder.paymentMethod || selectedOrder.deliveryMethod) && (
                  <Card className="shadow-sm border-slate-200">
                    <CardHeader className="py-2 px-3 pb-1">
                      <CardTitle className="text-xs font-medium">Approval Details</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-3 gap-2 px-3 pb-3 pt-0 text-xs">
                      {selectedOrder.discountPercent && (
                        <div>
                          <p className="text-slate-500 text-[10px]">Discount</p>
                          <p className="font-medium">{selectedOrder.discountPercent}%</p>
                        </div>
                      )}
                      {selectedOrder.paymentMethod && (
                        <div>
                          <p className="text-slate-500 text-[10px]">Payment</p>
                          <p className="font-medium capitalize">{selectedOrder.paymentMethod}</p>
                        </div>
                      )}
                      {selectedOrder.deliveryMethod && (
                        <div>
                          <p className="text-slate-500 text-[10px]">Delivery</p>
                          <p className="font-medium capitalize">{selectedOrder.deliveryMethod.replace('_', ' ')}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Rejection Reason (if rejected) */}
                {selectedOrder.workflowStage === 'rejected' && selectedOrder.rejectionReason && (
                  <Card className="border border-red-200 bg-red-50 shadow-sm">
                    <CardHeader className="py-2 px-3 pb-1">
                      <CardTitle className="text-xs font-medium text-red-700 flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5" />
                        Rejection Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5 px-3 pb-3 pt-0">
                      {selectedOrder.rejectedBy && (
                        <div className="flex items-center gap-1.5 text-xs flex-wrap">
                          <span className="text-red-500 font-medium">Rejected by:</span>
                          <span className="text-red-700">{selectedOrder.rejectedBy}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-red-500 font-medium text-xs">Reason:</span>
                        <p className="text-xs text-red-600 mt-0.5">{selectedOrder.rejectionReason}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* View Toggle */}
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium text-slate-700 text-xs">Order Items</h3>
                  <div className="flex items-center gap-1">
                    <Button
                      variant={itemViewMode === 'cart' ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => setItemViewMode('cart')}
                    >
                      <LayoutGrid className="w-3.5 h-3.5 mr-1" />
                      Cart
                    </Button>
                    <Button
                      variant={itemViewMode === 'list' ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => setItemViewMode('list')}
                    >
                      <List className="w-3.5 h-3.5 mr-1" />
                      List
                    </Button>
                  </div>
                </div>

                {/* Items Display */}
                {itemViewMode === 'list' ? (
                  <div className="space-y-1.5">
                    {selectedOrder.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 p-2 bg-slate-50 rounded-md">
                        <div className="min-w-0">
                          <p className="font-medium text-xs leading-tight">{item.name}</p>
                          <p className="text-[10px] text-slate-500">SKU: {item.sku} • {item.brand}</p>
                          {item.size && <p className="text-[10px] text-slate-500">Size: {item.size}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-medium text-xs tabular-nums">${item.total.toFixed(2)}</p>
                          <p className="text-[10px] text-slate-500">×{item.quantity} @ ${item.price.toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const { products, allSizes } = groupItemsForCartView(selectedOrder.items);
                      return products.map((product, idx) => (
                        <Card key={idx} className="overflow-hidden shadow-sm border-slate-200">
                          <CardContent className="p-2.5">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="min-w-0">
                                <h4 className="font-medium text-slate-800 text-xs leading-tight">{product.name}</h4>
                                <p className="text-[10px] text-slate-500">SKU: {product.sku} • {product.brand}</p>
                                {product.color && <p className="text-[10px] text-slate-500">Color: {product.color}</p>}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-semibold text-slate-800 text-xs tabular-nums">${product.totalPrice.toFixed(2)}</p>
                                <p className="text-[10px] text-slate-500">Qty: {product.totalQty}</p>
                              </div>
                            </div>
                            {allSizes.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {allSizes.map(size => (
                                  <div key={size} className="flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100 rounded text-[10px]">
                                    <span className="text-slate-500">{size}:</span>
                                    <span className="font-medium">{product.quantities[size] || 0}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ));
                    })()}
                  </div>
                )}

                {/* Order Total */}
                <div className="flex items-center justify-between p-2.5 bg-slate-100 rounded-md">
                  <span className="font-medium text-slate-700 text-xs">Order Total</span>
                  <span className="text-base font-bold text-slate-800 tabular-nums">${selectedOrder.total.toFixed(2)}</span>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
