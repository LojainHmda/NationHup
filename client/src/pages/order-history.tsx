import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  ShoppingCart, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Search,
  Filter,
  Eye,
  Package,
  Truck,
  FileText,
  ChevronDown,
  ChevronUp,
  UserCheck,
  AlertCircle
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Order } from "@shared/schema";

type OrderStatus = 'new_order' | 'under_review' | 'approved' | 'rejected' | 'processing' | 'completed';

const ORDER_STATUSES: {
  value: OrderStatus | 'all';
  label: string;
  icon: any;
  color: string;
  /** Section icon chip / semantic reference */
  bgColor: string;
  /** Status filter tile — unselected (≈5% tint) */
  bgInactive: string;
  /** Status filter tile — selected (stronger tint) */
  bgActive: string;
}[] = [
  { value: 'all', label: 'All Orders', icon: FileText, color: 'text-muted-foreground', bgColor: 'bg-muted', bgInactive: 'bg-muted/40', bgActive: 'bg-muted' },
  { value: 'new_order', label: 'New Order', icon: Clock, color: 'text-primary', bgColor: 'bg-primary/15', bgInactive: 'bg-primary/5', bgActive: 'bg-primary/20' },
  { value: 'under_review', label: 'Under Review', icon: Eye, color: 'text-[hsl(var(--warning))]', bgColor: 'bg-[hsl(var(--warning)/0.15)]', bgInactive: 'bg-[hsl(var(--warning)/0.05)]', bgActive: 'bg-[hsl(var(--warning)/0.22)]' },
  { value: 'approved', label: 'Approved', icon: CheckCircle2, color: 'text-[hsl(var(--success))]', bgColor: 'bg-[hsl(var(--success)/0.14)]', bgInactive: 'bg-[hsl(var(--success)/0.05)]', bgActive: 'bg-[hsl(var(--success)/0.2)]' },
  { value: 'rejected', label: 'Rejected', icon: XCircle, color: 'text-destructive', bgColor: 'bg-destructive/15', bgInactive: 'bg-destructive/5', bgActive: 'bg-destructive/20' },
  { value: 'processing', label: 'Processing', icon: Package, color: 'text-accent-foreground', bgColor: 'bg-accent/25', bgInactive: 'bg-accent/5', bgActive: 'bg-accent/35' },
  { value: 'completed', label: 'Completed', icon: Truck, color: 'text-[hsl(var(--success))]', bgColor: 'bg-[hsl(var(--success)/0.14)]', bgInactive: 'bg-[hsl(var(--success)/0.05)]', bgActive: 'bg-[hsl(var(--success)/0.2)]' },
];

const mapWorkflowStageToStatus = (order: Order): OrderStatus => {
  const workflowStage = order.workflowStage as string;
  const status = order.status as string;
  const approvalStatus = order.approvalStatus as string;
  
  // Rejected takes priority
  if (workflowStage === 'rejected' || status === 'rejected') {
    return 'rejected';
  }
  // Completed orders
  if (workflowStage === 'completed' || status === 'completed') {
    return 'completed';
  }
  // Processing orders
  if (workflowStage === 'processing' || status === 'processing') {
    return 'processing';
  }
  // Approved orders (all approvals complete)
  if (workflowStage === 'approved' || approvalStatus === 'approved' || status === 'approved') {
    return 'approved';
  }
  // New Order: freshly submitted, waiting for first review
  // This is when status is 'submitted' and approval hasn't started yet
  if (status === 'submitted' && (!approvalStatus || approvalStatus === 'pending')) {
    return 'new_order';
  }
  // Under Review: actively being reviewed by staff (account manager, sales, finance, admin)
  if (['account_manager_approval', 'sales_approval', 'finance_approval', 'admin_approval'].includes(workflowStage)) {
    // Only show "Under Review" if approval process has actually started
    if (approvalStatus && approvalStatus !== 'pending') {
      return 'under_review';
    }
    // If approval hasn't started, still show as New Order
    return 'new_order';
  }
  // Default to new_order for submitted orders
  if (status === 'submitted' || status === 'pending') {
    return 'new_order';
  }
  return 'new_order';
};

const getStatusInfo = (status: OrderStatus) => {
  return ORDER_STATUSES.find(s => s.value === status) || ORDER_STATUSES[1];
};

export default function OrderHistory() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    new_order: true,
    under_review: true,
    approved: true,
    rejected: true,
    processing: true,
    completed: false,
  });

  const { user } = useAuth();

  const { data: allOrders = [] } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    refetchOnWindowFocus: true,
    refetchInterval: 10000, // Auto-refresh every 10 seconds
    staleTime: 5000, // Consider data stale after 5 seconds
  });

  const submittedOrders = useMemo(() => {
    return allOrders
      .filter(order => order.status !== 'draft')
      .map(order => ({
        ...order,
        customerStatus: mapWorkflowStageToStatus(order),
      }));
  }, [allOrders]);

  const filteredOrders = useMemo(() => {
    return submittedOrders.filter(order => {
      const matchesSearch = 
        order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.nickname || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.orderName || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || order.customerStatus === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [submittedOrders, searchTerm, statusFilter]);

  const ordersByStatus = useMemo(() => {
    const grouped: Record<OrderStatus, typeof filteredOrders> = {
      new_order: [],
      under_review: [],
      approved: [],
      rejected: [],
      processing: [],
      completed: [],
    };
    
    filteredOrders.forEach(order => {
      grouped[order.customerStatus].push(order);
    });
    
    return grouped;
  }, [filteredOrders]);

  const statusCounts = useMemo(() => {
    const counts: Record<OrderStatus, number> = {
      new_order: 0,
      under_review: 0,
      approved: 0,
      rejected: 0,
      processing: 0,
      completed: 0,
    };
    
    submittedOrders.forEach(order => {
      counts[order.customerStatus]++;
    });
    
    return counts;
  }, [submittedOrders]);

  const toggleSection = (status: OrderStatus) => {
    setExpandedSections(prev => ({
      ...prev,
      [status]: !prev[status],
    }));
  };

  const getStatusBadgeStyles = (status: OrderStatus) => {
    switch (status) {
      case 'new_order':
        return 'border-primary/40 text-primary bg-primary/10';
      case 'under_review':
        return 'border-[hsl(var(--warning))] text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.12)]';
      case 'approved':
        return 'bg-[hsl(var(--success))] text-primary-foreground border-[hsl(var(--success))]';
      case 'rejected':
        return 'bg-destructive text-destructive-foreground border-destructive';
      case 'processing':
        return 'border-primary/45 text-primary bg-primary/10';
      case 'completed':
        return 'bg-[hsl(var(--success))] text-primary-foreground border-[hsl(var(--success))]';
      default:
        return 'border-border text-muted-foreground bg-muted/50';
    }
  };

  const renderOrderCard = (order: typeof filteredOrders[0]) => {
    const statusInfo = getStatusInfo(order.customerStatus);
    
    return (
      <Card 
        key={order.id} 
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => setSelectedOrder(order)}
        data-testid={`order-card-${order.id}`}
      >
        <CardHeader className="p-3 pb-1.5 space-y-0">
          <Badge 
            variant="outline"
            className="bg-white text-black border-black border font-medium hover:bg-white mb-1.5 w-fit"
            data-testid={`badge-status-${order.id}`}
          >
            {statusInfo.label}
          </Badge>
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              {(order as any).createdByAccountManagerId && (
                <div className="text-[11px] text-primary bg-primary/10 border border-primary/15 px-2 py-0.5 rounded inline-flex items-center gap-1 shrink-0 max-w-full mb-1">
                  <UserCheck className="w-3 h-3 shrink-0" />
                  {(order as any).createdByAccountManagerId === user?.id ? (
                    <span className="truncate">Created for {order.customerName || 'Customer'}</span>
                  ) : (
                    <span className="truncate">Created by {(order as any).createdByAccountManagerName}</span>
                  )}
                </div>
              )}
              <CardTitle className="text-base leading-snug" data-testid={`order-nickname-${order.id}`}>
                {order.nickname || order.orderName || `Order #${order.id.slice(0, 8).toUpperCase()}`}
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                ID: {order.id.slice(0, 8).toUpperCase()}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(order.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-lg font-bold text-foreground tabular-nums">
                ${parseFloat(order.total.toString()).toFixed(2)}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">
              {order.items.length} item{order.items.length !== 1 ? 's' : ''}
            </span>
            <Button 
              variant="ghost" 
              size="sm"
              className="h-7 text-xs text-primary hover:bg-primary hover:text-primary-foreground px-2"
              onClick={(e) => {
                e.stopPropagation();
                setLocation(`/cart/${order.id}?from=order-history`);
              }}
            >
              <Eye className="w-4 h-4 mr-1" />
              View Details
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderOrderSection = (status: OrderStatus) => {
    const orders = ordersByStatus[status];
    if (orders.length === 0 && statusFilter !== 'all') return null;
    if (orders.length === 0) return null;
    
    const statusInfo = getStatusInfo(status);
    const StatusIcon = statusInfo.icon;
    const isExpanded = expandedSections[status];
    
    return (
      <div key={status} className="mb-4">
        <button
          onClick={() => toggleSection(status)}
          className={`flex items-center gap-2 w-full text-left mb-2 group rounded-lg border-2 px-2 py-2 transition-all ${statusInfo.bgInactive} border-border/80 hover:border-muted-foreground/35`}
          data-testid={`section-toggle-${status}`}
        >
          <StatusIcon className={`w-4 h-4 shrink-0 ${statusInfo.color}`} />
          <h2 className={`text-base font-semibold flex-1 leading-tight ${statusInfo.color}`}>
            {statusInfo.label}
          </h2>
          <Badge 
            variant="outline" 
            className={`text-xs py-0 ${statusInfo.color} border-current`}
          >
            {orders.length}
          </Badge>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0" />
          )}
        </button>
        
        {isExpanded && (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {orders.map(order => renderOrderCard(order))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground leading-tight">Order History</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Track and manage all your submitted orders
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-9 text-sm w-56 md:w-64"
                  data-testid="input-search-orders"
                />
              </div>
              
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStatus | 'all')}>
                <SelectTrigger className="w-44 h-9 text-sm" data-testid="select-status-filter">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map(status => (
                    <SelectItem key={status.value} value={status.value}>
                      <div className="flex items-center gap-2">
                        <status.icon className={`w-4 h-4 ${status.color}`} />
                        <span>{status.label}</span>
                        {status.value !== 'all' && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {statusCounts[status.value as OrderStatus] || 0}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
            {ORDER_STATUSES.filter(s => s.value !== 'all').map(status => {
              const StatusIcon = status.icon;
              const count = statusCounts[status.value as OrderStatus];
              const isActive = statusFilter === status.value;
              
              return (
                <button
                  key={status.value}
                  onClick={() => setStatusFilter(isActive ? 'all' : status.value)}
                  className={`px-2 py-2 rounded-lg border-2 transition-all text-left ${
                    isActive
                      ? `${status.bgActive} border-current ${status.color} shadow-sm`
                      : `${status.bgInactive} border-border/80 hover:border-muted-foreground/35`
                  }`}
                  data-testid={`status-card-${status.value}`}
                >
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <StatusIcon className={`w-4 h-4 shrink-0 ${status.color}`} />
                    <span className={`text-lg font-bold tabular-nums leading-none ${isActive ? status.color : 'text-foreground'}`}>
                      {count}
                    </span>
                  </div>
                  <p className={`text-[11px] leading-tight font-medium line-clamp-2 ${isActive ? status.color : 'text-muted-foreground'}`}>
                    {status.label}
                  </p>
                </button>
              );
            })}
          </div>

          {submittedOrders.length === 0 ? (
            <Card>
              <CardContent className="text-center py-10">
                <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-muted-foreground text-base font-medium">No orders yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your orders will appear here once you submit them
                </p>
              </CardContent>
            </Card>
          ) : filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="text-center py-10">
                <Search className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-muted-foreground text-base font-medium">No matching orders</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try adjusting your search or filter criteria
                </p>
              </CardContent>
            </Card>
          ) : statusFilter === 'all' ? (
            <div>
              {(['new_order', 'under_review', 'approved', 'processing', 'completed', 'rejected'] as OrderStatus[]).map(status => 
                renderOrderSection(status)
              )}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredOrders.map(order => renderOrderCard(order))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-4 sm:p-5 gap-0">
          <DialogHeader className="pb-2 space-y-0">
            <DialogTitle className="flex items-center justify-between gap-2 text-base leading-tight">
              <span>
                {selectedOrder?.nickname || selectedOrder?.orderName || `Order #${selectedOrder?.id.slice(0, 8).toUpperCase()}`}
              </span>
              {selectedOrder && (
                <Badge 
                  variant="outline"
                  className={getStatusBadgeStyles(mapWorkflowStageToStatus(selectedOrder))}
                >
                  {getStatusInfo(mapWorkflowStageToStatus(selectedOrder)).label}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {selectedOrder && (
            <ScrollArea className="max-h-[min(72vh,720px)]">
              <div className="space-y-3 p-0.5 pr-2">
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 p-3 bg-muted/50 rounded-lg border border-border/60">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Order ID</p>
                    <p className="font-mono text-xs">{selectedOrder.id.slice(0, 8).toUpperCase()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Date</p>
                    <p className="text-xs">
                      {new Date(selectedOrder.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</p>
                    <p className="text-xs">{selectedOrder.orderType === 'pre-order' ? 'Pre-Order' : 'Regular Order'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Items</p>
                    <p className="text-xs">{selectedOrder.items.length} items</p>
                  </div>
                </div>

                {mapWorkflowStageToStatus(selectedOrder) === "rejected" && (
                  <div className="p-3 rounded-lg border border-destructive/35 bg-destructive/5">
                    <div className="flex gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-destructive mt-0.5" aria-hidden />
                      <div className="min-w-0 space-y-1">
                        <p className="text-[10px] uppercase tracking-wide font-medium text-destructive">
                          Rejection reason
                        </p>
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                          {selectedOrder.rejectionReason?.trim()
                            ? selectedOrder.rejectionReason.trim()
                            : "No additional details were provided."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Account Manager Creation Note - show different text based on who is viewing */}
                {(selectedOrder as any).createdByAccountManagerId && (
                  <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-2">
                    <UserCheck className="w-4 h-4 shrink-0 text-primary" />
                    <div className="text-xs text-foreground leading-snug">
                      {(selectedOrder as any).createdByAccountManagerId === user?.id ? (
                        <>This order was created for <span className="font-medium">{selectedOrder.customerName || 'Customer'}</span></>
                      ) : (
                        <>This order was created on your behalf by <span className="font-medium">{(selectedOrder as any).createdByAccountManagerName}</span></>
                      )}
                    </div>
                  </div>
                )}

                <div className="border-t pt-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="tabular-nums">${parseFloat(selectedOrder.subtotal.toString()).toFixed(2)}</span>
                  </div>
                  {parseFloat(selectedOrder.discount.toString()) > 0 && (
                    <div className="flex justify-between text-xs text-[hsl(var(--success))]">
                      <span>Discount:</span>
                      <span className="tabular-nums">-${parseFloat(selectedOrder.discount.toString()).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-sm pt-1.5 border-t">
                    <span>Total:</span>
                    <span className="tabular-nums">${parseFloat(selectedOrder.total.toString()).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
