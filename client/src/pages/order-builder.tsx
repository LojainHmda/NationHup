import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trash2, Minus, Plus, CheckCircle2, User, MapPin, Package, ShoppingCart, Store, FileText, Send } from "lucide-react";
import { useLocation } from "wouter";
import { useCart } from "@/hooks/useCart";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Product } from "@shared/schema";

interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
}

interface ShippingAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface DraftOrder {
  id: string;
  name: string;
  nickname: string;
  customerInfo: CustomerInfo;
  shippingAddress: ShippingAddress;
  assignedItems: Array<{
    cartItemId: string;
    productId: string;
    color: string;
    size: string;
    quantity: number;
  }>;
  status: 'draft' | 'submitted';
}

export default function OrderBuilder() {
  const [, setLocation] = useLocation();
  const { cartItems, updateCartItem, removeCartItem, clearCart, createOrder, isCreatingOrder } = useCart();
  const { toast } = useToast();
  const { getCurrencySymbol, userCurrency } = useCurrency();

  const [draftOrders, setDraftOrders] = useState<DraftOrder[]>([]);
  const [activeOrderTab, setActiveOrderTab] = useState<string>("cart");

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Create a new draft order
  const createNewOrder = () => {
    const newOrder: DraftOrder = {
      id: `order-${Date.now()}`,
      name: `Order ${draftOrders.length + 1}`,
      nickname: "",
      customerInfo: {
        name: "",
        email: "",
        phone: "",
      },
      shippingAddress: {
        street: "",
        city: "",
        state: "",
        zip: "",
      },
      assignedItems: [],
      status: 'draft',
    };
    setDraftOrders([...draftOrders, newOrder]);
    setActiveOrderTab(newOrder.id);
  };

  // Update order customer info
  const updateOrderCustomer = (orderId: string, customerInfo: CustomerInfo) => {
    setDraftOrders(prev =>
      prev.map(order =>
        order.id === orderId ? { ...order, customerInfo } : order
      )
    );
  };

  // Update order shipping address
  const updateOrderShipping = (orderId: string, shippingAddress: ShippingAddress) => {
    setDraftOrders(prev =>
      prev.map(order =>
        order.id === orderId ? { ...order, shippingAddress } : order
      )
    );
  };

  // Update order name
  const updateOrderName = (orderId: string, name: string) => {
    setDraftOrders(prev =>
      prev.map(order =>
        order.id === orderId ? { ...order, name } : order
      )
    );
  };

  // Update order nickname
  const updateOrderNickname = (orderId: string, nickname: string) => {
    setDraftOrders(prev =>
      prev.map(order =>
        order.id === orderId ? { ...order, nickname } : order
      )
    );
  };

  // Assign cart item to order
  const assignItemToOrder = (orderId: string, cartItemId: string, color: string, size: string, quantity: number) => {
    const cartItem = cartItems.find(item => item.id === cartItemId);
    if (!cartItem) return;

    // Remove from other orders first
    setDraftOrders(prev =>
      prev.map(order => ({
        ...order,
        assignedItems: order.assignedItems.filter(
          item => !(item.cartItemId === cartItemId && item.color === color && item.size === size)
        ),
      }))
    );

    // Add to target order
    setDraftOrders(prev =>
      prev.map(order => {
        if (order.id === orderId) {
          const existingItem = order.assignedItems.find(
            item => item.cartItemId === cartItemId && item.color === color && item.size === size
          );
          
          if (existingItem) {
            return order;
          }

          return {
            ...order,
            assignedItems: [
              ...order.assignedItems,
              {
                cartItemId,
                productId: cartItem.productId,
                color,
                size,
                quantity,
              },
            ],
          };
        }
        return order;
      })
    );
  };

  // Remove item from order
  const removeItemFromOrder = (orderId: string, cartItemId: string, color: string, size: string) => {
    setDraftOrders(prev =>
      prev.map(order => {
        if (order.id === orderId) {
          return {
            ...order,
            assignedItems: order.assignedItems.filter(
              item => !(item.cartItemId === cartItemId && item.color === color && item.size === size)
            ),
          };
        }
        return order;
      })
    );
  };

  // Delete draft order
  const deleteDraftOrder = (orderId: string) => {
    setDraftOrders(prev => prev.filter(order => order.id !== orderId));
    if (activeOrderTab === orderId) {
      setActiveOrderTab("cart");
    }
  };

  // Submit a specific order
  const submitOrder = async (order: DraftOrder) => {
    // Validation
    if (!order.customerInfo.name || !order.customerInfo.email) {
      toast({
        title: "Missing Information",
        description: "Please provide customer name and email.",
        variant: "destructive",
      });
      return;
    }

    if (!order.shippingAddress.street || !order.shippingAddress.city || !order.shippingAddress.state || !order.shippingAddress.zip) {
      toast({
        title: "Missing Shipping Address",
        description: "Please provide complete shipping address.",
        variant: "destructive",
      });
      return;
    }

    if (order.assignedItems.length === 0) {
      toast({
        title: "Empty Order",
        description: "Please assign items to this order.",
        variant: "destructive",
      });
      return;
    }

    try {
      const orderItems = order.assignedItems.map(item => {
        const product = products.find(p => p.id === item.productId);
        if (!product) return null;
        
        return {
          productId: item.productId,
          productName: product.name,
          sku: product.sku,
          brand: product.brand,
          color: item.color,
          size: item.size,
          quantity: item.quantity,
          unitPrice: parseFloat(product.wholesalePrice.toString()),
          totalPrice: parseFloat(product.wholesalePrice.toString()) * item.quantity,
        };
      }).filter(Boolean);

      const subtotal = orderItems.reduce((sum, item) => sum + (item?.totalPrice || 0), 0);
      const discount = subtotal > 600 ? subtotal * 0.05 : 0;
      const total = subtotal - discount;

      // Await the order creation to ensure it succeeds before proceeding
      await createOrder({
        sessionId: "user-session",
        orderName: order.name,
        nickname: order.nickname,
        customerName: order.customerInfo.name,
        customerEmail: order.customerInfo.email,
        customerPhone: order.customerInfo.phone,
        shippingAddress: `${order.shippingAddress.street}, ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.zip}`,
        items: orderItems,
        subtotal: subtotal.toFixed(2),
        discount: discount.toFixed(2),
        total: total.toFixed(2),
        status: "pending",
      });

      // Only mutate state if order creation succeeded
      // Remove submitted items from cart
      order.assignedItems.forEach(item => {
        const cartItem = cartItems.find(c => c.id === item.cartItemId);
        if (cartItem) {
          const remainingSelections = cartItem.selections.filter(
            sel => !(sel.color === item.color && sel.size === item.size)
          );
          if (remainingSelections.length === 0) {
            removeCartItem(item.cartItemId);
          } else {
            updateCartItem(item.cartItemId, { selections: remainingSelections });
          }
        }
      });

      // Mark order as submitted
      setDraftOrders(prev =>
        prev.map(o => o.id === order.id ? { ...o, status: 'submitted' as const } : o)
      );

      toast({
        title: "Order Submitted Successfully",
        description: `${order.name} for ${order.customerInfo.name} has been submitted. You can continue working on other orders or view order history.`,
      });
      
      // Don't navigate away - let user continue with other orders or choose to view history
    } catch (error) {
      toast({
        title: "Order Failed",
        description: error instanceof Error ? error.message : "Failed to place order. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Get unassigned cart items
  const getUnassignedItems = () => {
    const assignedItemKeys = new Set(
      draftOrders.flatMap(order =>
        order.assignedItems.map(item => `${item.cartItemId}-${item.color}-${item.size}`)
      )
    );

    return cartItems.flatMap(item => {
      const product = products.find(p => p.id === item.productId);
      if (!product) return [];
      
      return item.selections
        .filter(sel => !assignedItemKeys.has(`${item.id}-${sel.color}-${sel.size}`))
        .map((sel, index) => ({
          id: `${item.id}-${sel.color}-${sel.size}`,
          cartItemId: item.id,
          product,
          selection: sel,
        }));
    });
  };

  // Get order summary
  const getOrderSummary = (order: DraftOrder) => {
    let subtotal = 0;
    
    order.assignedItems.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        subtotal += parseFloat(product.wholesalePrice.toString()) * item.quantity;
      }
    });

    const discount = subtotal > 600 ? subtotal * 0.05 : 0;
    const total = subtotal - discount;

    return { subtotal, discount, total };
  };

  const unassignedItems = getUnassignedItems();

  return (
    <>
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <Button 
                    variant="ghost" 
                    className="mb-4" 
                    onClick={() => setLocation('/')}
                    data-testid="button-back"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Shopping
                  </Button>
                  <h1 className="text-3xl font-bold text-foreground mb-2">Order Builder</h1>
                  <p className="text-muted-foreground">Create multiple orders and assign cart items</p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setLocation('/')}
                    data-testid="button-browse-catalogue"
                  >
                    <Store className="w-4 h-4 mr-2" />
                    Browse Catalogue
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setLocation('/order-history')}
                    data-testid="button-view-order-history"
                  >
                    <Package className="w-4 h-4 mr-2" />
                    View Order History
                  </Button>
                  <Button
                    onClick={createNewOrder}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    data-testid="button-create-new-order"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Create New Order
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Cart & Orders */}
              <div className="lg:col-span-2 space-y-6">
                
                <Tabs value={activeOrderTab} onValueChange={setActiveOrderTab}>
                  <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${draftOrders.length + 1}, 1fr)` }}>
                    <TabsTrigger value="cart" data-testid="tab-unassigned-cart">
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      Unassigned Cart
                      {unassignedItems.length > 0 && (
                        <Badge variant="secondary" className="ml-2">{unassignedItems.length}</Badge>
                      )}
                    </TabsTrigger>
                    {draftOrders.map((order) => (
                      <TabsTrigger key={order.id} value={order.id} data-testid={`tab-order-${order.id}`}>
                        <FileText className="w-4 h-4 mr-2" />
                        {order.name}
                        {order.assignedItems.length > 0 && (
                          <Badge variant="secondary" className="ml-2">{order.assignedItems.length}</Badge>
                        )}
                        {order.status === 'submitted' && (
                          <Badge variant="default" className="ml-2 bg-green-600">Submitted</Badge>
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {/* Unassigned Cart Items Tab */}
                  <TabsContent value="cart" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <ShoppingCart className="h-5 w-5" />
                          Unassigned Cart Items ({unassignedItems.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {unassignedItems.length === 0 ? (
                          <div className="text-center py-12">
                            <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                            <p className="text-muted-foreground mb-4">
                              {cartItems.length === 0 ? "Your cart is empty" : "All items assigned to orders"}
                            </p>
                            <Button
                              onClick={() => setLocation('/')}
                              data-testid="button-browse-products"
                            >
                              <Store className="w-4 h-4 mr-2" />
                              Browse Products
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-sm text-muted-foreground mb-4">
                              Select an order tab above to assign these items, or create a new order.
                            </p>
                            {unassignedItems.map((item) => {
                              const itemTotal = parseFloat(item.product.wholesalePrice.toString()) * item.selection.quantity;
                              
                              return (
                                <div 
                                  key={item.id} 
                                  className="flex gap-4 p-4 bg-muted rounded-lg border border-border"
                                  data-testid={`unassigned-item-${item.id}`}
                                >
                                  <img
                                    src={item.product.image1}
                                    alt={item.product.name}
                                    className="w-16 h-16 object-fill rounded-md"
                                  />
                                  <div className="flex-1">
                                    <h3 className="font-semibold text-foreground text-sm">
                                      {item.product.name}
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                      {getCurrencySymbol(userCurrency)}{parseFloat(item.product.wholesalePrice.toString()).toFixed(2)} per unit
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {item.selection.color} | Size {item.selection.size} | Qty: {item.selection.quantity}
                                    </p>
                                  </div>
                                  <div className="flex flex-col items-end justify-between gap-2">
                                    <div className="text-sm font-bold text-foreground">
                                      {getCurrencySymbol(userCurrency)}{itemTotal.toFixed(2)}
                                    </div>
                                    <div className="flex flex-col gap-1 items-end">
                                      {draftOrders.length > 0 && (
                                        <div className="flex gap-1 flex-wrap justify-end">
                                          {draftOrders.filter(o => o.status === 'draft').map(order => (
                                            <Button
                                              key={order.id}
                                              size="sm"
                                              variant="outline"
                                              onClick={() => {
                                                assignItemToOrder(
                                                  order.id,
                                                  item.cartItemId,
                                                  item.selection.color,
                                                  item.selection.size,
                                                  item.selection.quantity
                                                );
                                                toast({
                                                  title: "Item Assigned",
                                                  description: `Added to ${order.name}`,
                                                });
                                              }}
                                              data-testid={`button-assign-${item.id}-${order.id}`}
                                            >
                                              → {order.name}
                                            </Button>
                                          ))}
                                        </div>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => {
                                          removeCartItem(item.cartItemId);
                                          toast({
                                            title: "Item Removed",
                                            description: "Item deleted from cart",
                                          });
                                        }}
                                        data-testid={`button-remove-${item.id}`}
                                      >
                                        <Trash2 className="w-3 h-3 mr-1" />
                                        Remove
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            
                            {/* Running Total for Unassigned Items */}
                            {unassignedItems.length > 0 && (
                              <div className="mt-4 pt-4 border-t border-border">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-semibold text-foreground">
                                    Unassigned Items Total:
                                  </span>
                                  <span className="text-lg font-bold text-foreground" data-testid="text-unassigned-total">
                                    ${unassignedItems.reduce((sum, item) => {
                                      return sum + (parseFloat(item.product.wholesalePrice.toString()) * item.selection.quantity);
                                    }, 0).toFixed(2)}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1 text-right">
                                  {unassignedItems.reduce((sum, item) => sum + item.selection.quantity, 0)} pairs
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Individual Order Tabs */}
                  {draftOrders.map((order) => (
                    <TabsContent key={order.id} value={order.id} className="space-y-4">
                      
                      {/* Order Information */}
                      <Card>
                        <CardHeader className="bg-yellow-50 dark:bg-yellow-900/20">
                          <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                            Order Information
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor={`order-name-${order.id}`}>Order Name</Label>
                              <Input
                                id={`order-name-${order.id}`}
                                value={order.name}
                                onChange={(e) => updateOrderName(order.id, e.target.value)}
                                placeholder="Summer 2025 Collection"
                                disabled={order.status === 'submitted'}
                                data-testid={`input-order-name-${order.id}`}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`order-nickname-${order.id}`}>Nickname (Quick Reference)</Label>
                              <Input
                                id={`order-nickname-${order.id}`}
                                value={order.nickname}
                                onChange={(e) => updateOrderNickname(order.id, e.target.value)}
                                placeholder="NY Store Batch"
                                disabled={order.status === 'submitted'}
                                data-testid={`input-order-nickname-${order.id}`}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Customer Information */}
                      <Card>
                        <CardHeader className="bg-blue-50 dark:bg-blue-900/20">
                          <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            Customer Information
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor={`customer-name-${order.id}`}>Customer Name *</Label>
                              <Input
                                id={`customer-name-${order.id}`}
                                value={order.customerInfo.name}
                                onChange={(e) => updateOrderCustomer(order.id, { ...order.customerInfo, name: e.target.value })}
                                placeholder="John Doe"
                                disabled={order.status === 'submitted'}
                                data-testid={`input-customer-name-${order.id}`}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`customer-email-${order.id}`}>Email *</Label>
                              <Input
                                id={`customer-email-${order.id}`}
                                type="email"
                                value={order.customerInfo.email}
                                onChange={(e) => updateOrderCustomer(order.id, { ...order.customerInfo, email: e.target.value })}
                                placeholder="john@example.com"
                                disabled={order.status === 'submitted'}
                                data-testid={`input-customer-email-${order.id}`}
                              />
                            </div>
                            <div className="md:col-span-2">
                              <Label htmlFor={`customer-phone-${order.id}`}>Phone Number</Label>
                              <Input
                                id={`customer-phone-${order.id}`}
                                value={order.customerInfo.phone}
                                onChange={(e) => updateOrderCustomer(order.id, { ...order.customerInfo, phone: e.target.value })}
                                placeholder="+1 (555) 123-4567"
                                disabled={order.status === 'submitted'}
                                data-testid={`input-customer-phone-${order.id}`}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Shipping Address */}
                      <Card>
                        <CardHeader className="bg-green-50 dark:bg-green-900/20">
                          <CardTitle className="flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-green-600 dark:text-green-400" />
                            Shipping Address
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                          <div>
                            <Label htmlFor={`shipping-street-${order.id}`}>Street Address *</Label>
                            <Input
                              id={`shipping-street-${order.id}`}
                              value={order.shippingAddress.street}
                              onChange={(e) => updateOrderShipping(order.id, { ...order.shippingAddress, street: e.target.value })}
                              placeholder="123 Main Street"
                              disabled={order.status === 'submitted'}
                              data-testid={`input-shipping-street-${order.id}`}
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <Label htmlFor={`shipping-city-${order.id}`}>City *</Label>
                              <Input
                                id={`shipping-city-${order.id}`}
                                value={order.shippingAddress.city}
                                onChange={(e) => updateOrderShipping(order.id, { ...order.shippingAddress, city: e.target.value })}
                                placeholder="New York"
                                disabled={order.status === 'submitted'}
                                data-testid={`input-shipping-city-${order.id}`}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`shipping-state-${order.id}`}>State *</Label>
                              <Input
                                id={`shipping-state-${order.id}`}
                                value={order.shippingAddress.state}
                                onChange={(e) => updateOrderShipping(order.id, { ...order.shippingAddress, state: e.target.value })}
                                placeholder="NY"
                                disabled={order.status === 'submitted'}
                                data-testid={`input-shipping-state-${order.id}`}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`shipping-zip-${order.id}`}>ZIP Code *</Label>
                              <Input
                                id={`shipping-zip-${order.id}`}
                                value={order.shippingAddress.zip}
                                onChange={(e) => updateOrderShipping(order.id, { ...order.shippingAddress, zip: e.target.value })}
                                placeholder="10001"
                                disabled={order.status === 'submitted'}
                                data-testid={`input-shipping-zip-${order.id}`}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Order Items */}
                      <Card>
                        <CardHeader>
                          <div className="flex justify-between items-center">
                            <CardTitle className="flex items-center gap-2">
                              <Package className="h-5 w-5" />
                              Order Items ({order.assignedItems.length})
                            </CardTitle>
                            {order.status === 'draft' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteDraftOrder(order.id)}
                                className="text-destructive hover:text-destructive"
                                data-testid={`button-delete-order-${order.id}`}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Order
                              </Button>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent>
                          {order.assignedItems.length === 0 ? (
                            <div className="text-center py-8">
                              <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                              <p className="text-muted-foreground text-sm mb-4">No items assigned to this order</p>
                              <p className="text-xs text-muted-foreground">
                                Go to "Unassigned Cart" tab to assign items to this order
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {order.assignedItems.map((item) => {
                                const product = products.find(p => p.id === item.productId);
                                if (!product) return null;
                                
                                const itemTotal = parseFloat(product.wholesalePrice.toString()) * item.quantity;
                                
                                return (
                                  <div 
                                    key={`${item.cartItemId}-${item.color}-${item.size}`}
                                    className="flex gap-4 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800"
                                    data-testid={`order-item-${order.id}-${item.cartItemId}`}
                                  >
                                    <img
                                      src={product.image1}
                                      alt={product.name}
                                      className="w-16 h-16 object-fill rounded-md"
                                    />
                                    <div className="flex-1">
                                      <h3 className="font-semibold text-foreground text-sm">
                                        {product.name}
                                      </h3>
                                      <p className="text-xs text-muted-foreground">
                                        {getCurrencySymbol(userCurrency)}{parseFloat(product.wholesalePrice.toString()).toFixed(2)} per unit
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {item.color} | Size {item.size} | Qty: {item.quantity}
                                      </p>
                                    </div>
                                    <div className="flex flex-col items-end justify-between">
                                      <div className="text-sm font-bold text-foreground">
                                        {getCurrencySymbol(userCurrency)}{itemTotal.toFixed(2)}
                                      </div>
                                      {order.status === 'draft' && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => {
                                            removeItemFromOrder(order.id, item.cartItemId, item.color, item.size);
                                            toast({
                                              title: "Item Removed",
                                              description: "Item returned to unassigned cart",
                                            });
                                          }}
                                          className="text-destructive hover:text-destructive"
                                          data-testid={`button-remove-${order.id}-${item.cartItemId}`}
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  ))}
                </Tabs>
              </div>

              {/* Right Column - Order Summary */}
              <div>
                <Card className="sticky top-6 border-primary">
                  <CardHeader className="bg-primary text-primary-foreground rounded-t-lg">
                    <CardTitle>
                      {activeOrderTab === "cart" ? "Cart Summary" : `${draftOrders.find(o => o.id === activeOrderTab)?.name || "Order"} Summary`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-6">
                    {activeOrderTab === "cart" ? (
                      <div className="text-center py-6">
                        <p className="text-sm text-muted-foreground mb-4">
                          Create orders and assign items to see summary
                        </p>
                        <Button
                          onClick={createNewOrder}
                          variant="outline"
                          className="w-full"
                          data-testid="button-create-order-from-summary"
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Create New Order
                        </Button>
                      </div>
                    ) : (
                      <>
                        {(() => {
                          const order = draftOrders.find(o => o.id === activeOrderTab);
                          if (!order) return null;
                          
                          const { subtotal, discount, total } = getOrderSummary(order);
                          
                          // Group items by brand for sub-invoices
                          const itemsByBrand = new Map<string, typeof order.assignedItems>();
                          order.assignedItems.forEach(item => {
                            const product = products.find(p => p.id === item.productId);
                            if (product) {
                              const brandName = product.brand || 'Unknown Brand';
                              if (!itemsByBrand.has(brandName)) {
                                itemsByBrand.set(brandName, []);
                              }
                              itemsByBrand.get(brandName)!.push(item);
                            }
                          });
                          
                          return (
                            <>
                              {/* Brand-based Sub-Invoices */}
                              {itemsByBrand.size > 1 && (
                                <div className="space-y-3 mb-4">
                                  <h4 className="text-sm font-semibold text-foreground border-b pb-2">Sub-Invoices by Brand</h4>
                                  {Array.from(itemsByBrand.entries()).map(([brandName, items]) => {
                                    const brandSubtotal = items.reduce((sum, item) => {
                                      const product = products.find(p => p.id === item.productId);
                                      if (product) {
                                        return sum + (parseFloat(product.wholesalePrice.toString()) * item.quantity);
                                      }
                                      return sum;
                                    }, 0);
                                    
                                    return (
                                      <div key={brandName} className="bg-muted/50 rounded-lg p-3 space-y-2" data-testid={`sub-invoice-${brandName}`}>
                                        <div className="flex justify-between items-center">
                                          <span className="text-sm font-semibold text-foreground">{brandName}</span>
                                          <span className="text-sm text-muted-foreground">({items.length} items)</span>
                                        </div>
                                        <div className="space-y-1">
                                          {items.map((item, idx) => {
                                            const product = products.find(p => p.id === item.productId);
                                            if (!product) return null;
                                            const itemTotal = parseFloat(product.wholesalePrice.toString()) * item.quantity;
                                            return (
                                              <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                                                <span>{product.name.substring(0, 20)}... ({item.color}, {item.size}) ×{item.quantity}</span>
                                                <span>{getCurrencySymbol(userCurrency)}{itemTotal.toFixed(2)}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                        <div className="flex justify-between text-sm font-medium text-foreground pt-1 border-t border-border">
                                          <span>{brandName} Subtotal</span>
                                          <span data-testid={`brand-subtotal-${brandName}`}>{getCurrencySymbol(userCurrency)}{brandSubtotal.toFixed(2)}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              
                              <div className="flex justify-between text-foreground">
                                <span>Total Items</span>
                                <span className="font-semibold">{order.assignedItems.length}</span>
                              </div>

                              <div className="flex justify-between text-foreground">
                                <span>Subtotal</span>
                                <span className="font-semibold" data-testid={`text-subtotal-${order.id}`}>
                                  {getCurrencySymbol(userCurrency)}{subtotal.toFixed(2)}
                                </span>
                              </div>

                              {discount > 0 && (
                                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                                  <div className="flex items-center gap-2 text-green-800 dark:text-green-400 mb-2">
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span className="text-sm font-semibold">Discount Applied!</span>
                                  </div>
                                  <p className="text-xs text-green-700 dark:text-green-500">
                                    5% off orders over {getCurrencySymbol(userCurrency)}600
                                  </p>
                                </div>
                              )}

                              <div className="flex justify-between text-green-600">
                                <span>Discount (5%)</span>
                                <span className="font-semibold" data-testid={`text-discount-${order.id}`}>
                                  -{getCurrencySymbol(userCurrency)}{discount.toFixed(2)}
                                </span>
                              </div>

                              <Separator />

                              <div className="flex justify-between text-lg font-bold text-foreground">
                                <span>Total</span>
                                <span data-testid={`text-total-${order.id}`}>{getCurrencySymbol(userCurrency)}{total.toFixed(2)}</span>
                              </div>

                              {!discount && subtotal > 0 && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-400">
                                  Add {getCurrencySymbol(userCurrency)}{(600 - subtotal).toFixed(2)} more to get 5% discount!
                                </div>
                              )}

                              {order.status === 'draft' && (
                                <Button
                                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold h-12"
                                  disabled={order.assignedItems.length === 0 || isCreatingOrder}
                                  onClick={() => submitOrder(order)}
                                  data-testid={`button-submit-order-${order.id}`}
                                >
                                  <Send className="w-5 h-5 mr-2" />
                                  {isCreatingOrder ? "Submitting..." : "Submit Order"}
                                </Button>
                              )}

                              {order.status === 'submitted' && (
                                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                                  <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-600" />
                                  <p className="text-sm font-semibold text-green-800 dark:text-green-400">
                                    Order Submitted Successfully
                                  </p>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
    </>
  );
}
