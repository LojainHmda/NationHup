import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  ChevronDown, 
  ChevronUp,
  Trash2, 
  ShoppingCart, 
  Package,
  FileText,
  Search,
  Send,
  X,
  Download
} from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { useCartContext } from "@/hooks/useCartContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Product } from "@shared/schema";
import * as XLSX from 'xlsx';

interface CartOverlayProps {
  isExpanded: boolean;
  onToggle: () => void;
}

interface DraftOrder {
  id: string;
  orderName: string;
  nickname: string;
  items: Array<{
    productId: string;
    productName: string;
    sku: string;
    brand: string;
    color: string;
    size: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  subtotal: string;
  discount: string;
  total: string;
  status: string;
  approvalStatus: string;
  createdAt: string;
}

export function CartOverlay({ isExpanded, onToggle }: CartOverlayProps) {
  const { cartItems, removeCartItem, getOrderSummary, createOrder } = useCart();
  const { draftsQueryKey } = useCartContext();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [cartSearchQuery, setCartSearchQuery] = useState("");
  const [brandNicknames, setBrandNicknames] = useState<Record<string, string>>({});
  const [isCreatingOrders, setIsCreatingOrders] = useState(false);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Fetch draft orders (user-scoped query key)
  const { data: draftOrders = [] } = useQuery<DraftOrder[]>({
    queryKey: [...draftsQueryKey, searchQuery],
    queryFn: async () => {
      const url = searchQuery 
        ? `/api/orders/drafts?search=${encodeURIComponent(searchQuery)}`
        : "/api/orders/drafts";
      const response = await fetch(url);
      return response.json();
    },
  });

  const summary = getOrderSummary();

  // Group cart items by brand
  const itemsByBrand = cartItems.reduce((acc, cartItem) => {
    const product = products.find(p => p.id === cartItem.productId);
    if (!product) return acc;

    const brandName = product.brand;
    if (!acc[brandName]) {
      acc[brandName] = [];
    }
    acc[brandName].push({ cartItem, product });
    return acc;
  }, {} as Record<string, Array<{ cartItem: any; product: Product }>>);

  // Filter cart items by search
  const filteredItemsByBrand = Object.entries(itemsByBrand).reduce((acc, [brand, items]) => {
    if (!cartSearchQuery) {
      acc[brand] = items;
      return acc;
    }

    const search = cartSearchQuery.toLowerCase();
    
    // If brand name matches, show all items for that brand
    if (brand.toLowerCase().includes(search)) {
      acc[brand] = items;
      return acc;
    }

    // Otherwise, filter items by product name, brand, or SKU
    const filteredItems = items.filter(({ product }) => 
      product.name.toLowerCase().includes(search) ||
      product.brand.toLowerCase().includes(search) ||
      product.sku.toLowerCase().includes(search)
    );

    if (filteredItems.length > 0) {
      acc[brand] = filteredItems;
    }

    return acc;
  }, {} as Record<string, Array<{ cartItem: any; product: Product }>>);

  // Calculate brand totals
  const getBrandTotal = (items: Array<{ cartItem: any; product: Product }>) => {
    return items.reduce((total, { cartItem, product }) => {
      const itemTotal = cartItem.selections.reduce((sum: number, selection: any) => {
        return sum + (parseFloat(product.wholesalePrice) * selection.quantity);
      }, 0);
      return total + itemTotal;
    }, 0);
  };

  // Submit order mutation
  const submitOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiRequest(`/api/orders/${orderId}/submit`, "POST");
      return response.json();
    },
    onSuccess: () => {
      // Invalidate this user's draft order queries (with any search parameter)
      queryClient.invalidateQueries({ queryKey: draftsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Order Submitted!",
        description: "Your order has been submitted for approval.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit order",
        variant: "destructive",
      });
    },
  });

  // Create draft orders - one per brand
  const handleCreateDraftOrders = async () => {
    setIsCreatingOrders(true);
    try {
      const brandNames = Object.keys(itemsByBrand).sort();
      
      for (const brandName of brandNames) {
        const items = itemsByBrand[brandName];
        const nickname = brandNicknames[brandName] || `Order - ${brandName}`;
        
        // Build order items
        const orderItems = items.flatMap(({ cartItem, product }) => 
          cartItem.selections.map((selection: any) => ({
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            brand: product.brand,
            color: selection.color,
            size: selection.size,
            quantity: selection.quantity,
            unitPrice: parseFloat(product.wholesalePrice),
            totalPrice: parseFloat(product.wholesalePrice) * selection.quantity,
          }))
        );

        const brandSubtotal = getBrandTotal(items);
        const brandDiscount = brandSubtotal >= 2000 ? brandSubtotal * 0.15 : 0;
        const brandTotal = brandSubtotal - brandDiscount;

        await createOrder({
          sessionId: "anonymous",
          orderName: `${brandName} Order`,
          nickname,
          items: orderItems,
          subtotal: brandSubtotal.toString(),
          discount: brandDiscount.toString(),
          total: brandTotal.toString(),
          status: "draft",
        });
      }

      // Invalidate this user's draft order queries (with any search parameter)
      queryClient.invalidateQueries({ queryKey: draftsQueryKey });
      
      toast({
        title: "Draft Orders Created!",
        description: `Successfully created ${brandNames.length} draft order(s). Continue shopping or submit orders for approval.`,
      });

      setBrandNicknames({});
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create draft orders. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingOrders(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    try {
      await apiRequest(`/api/orders/${orderId}`, "DELETE");
      // Invalidate this user's draft order queries (with any search parameter)
      queryClient.invalidateQueries({ queryKey: draftsQueryKey });
      toast({
        title: "Order Deleted",
        description: "Draft order has been deleted.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete order",
        variant: "destructive",
      });
    }
  };

  const handleClearAllOrders = async () => {
    if (!confirm(`Delete all ${totalDraftOrders} draft orders?`)) {
      return;
    }

    try {
      // Delete all orders in parallel
      await Promise.all(
        draftOrders.map(order => apiRequest(`/api/orders/${order.id}`, "DELETE"))
      );
      
      // Invalidate this user's draft order queries (with any search parameter)
      queryClient.invalidateQueries({ queryKey: draftsQueryKey });
      toast({
        title: "All Orders Deleted",
        description: `Successfully deleted ${totalDraftOrders} draft orders.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete some orders",
        variant: "destructive",
      });
    }
  };

  const handleExportCartToExcel = () => {
    if (cartItems.length === 0) {
      toast({
        title: "Cart is Empty",
        description: "Add items to cart before exporting.",
        variant: "destructive",
      });
      return;
    }

    // Prepare data for export
    const exportData = cartItems.flatMap(cartItem => {
      const product = products.find(p => p.id === cartItem.productId);
      if (!product) return [];

      return cartItem.selections.map((selection: any) => ({
        'Brand': product.brand,
        'Product Name': product.name,
        'UPC': product.sku,
        'Barcode': product.barcode || '',
        'Color': selection.color,
        'Size': selection.size,
        'Quantity': selection.quantity,
        'Wholesale Price': parseFloat(product.wholesalePrice).toFixed(2),
        'Total': (parseFloat(product.wholesalePrice) * selection.quantity).toFixed(2),
        'Category': product.category || '',
        'Gender': product.gender || '',
      }));
    });

    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 15 }, // Brand
      { wch: 30 }, // Product Name
      { wch: 15 }, // UPC
      { wch: 15 }, // Barcode
      { wch: 12 }, // Color
      { wch: 8 },  // Size
      { wch: 10 }, // Quantity
      { wch: 15 }, // Wholesale Price
      { wch: 12 }, // Total
      { wch: 15 }, // Category
      { wch: 10 }, // Gender
    ];

    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cart Items');

    // Generate file name with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `cart_export_${timestamp}.xlsx`;

    // Download file
    XLSX.writeFile(workbook, filename);

    toast({
      title: "Export Successful",
      description: `Cart exported to ${filename}`,
    });
  };

  // Group draft orders by brand
  const draftOrdersByBrand = draftOrders.reduce((acc, order) => {
    const brand = order.items[0]?.brand || "Unknown";
    if (!acc[brand]) {
      acc[brand] = [];
    }
    acc[brand].push(order);
    return acc;
  }, {} as Record<string, DraftOrder[]>);

  const totalBrands = Object.keys(itemsByBrand).length;
  const totalDraftOrders = draftOrders.length;

  return (
    <div 
      className={`
        fixed top-0 left-0 right-0 bg-white shadow-lg transition-all duration-300 ease-in-out z-50 border-b
        ${isExpanded ? 'h-[70vh]' : 'h-16'}
      `}
      data-testid="cart-overlay"
    >
      {/* Collapsed Navbar View */}
      {!isExpanded && (
        <div className="h-16 px-6 flex items-center justify-between bg-gradient-to-r from-yellow-500/80 to-yellow-600/80 backdrop-blur-sm text-gray-900">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              <span className="font-semibold text-sm">Shopping Cart</span>
            </div>
            
            {totalBrands > 0 && (
              <>
                <Separator orientation="vertical" className="h-6 bg-gray-900/20" />
                <div className="flex items-center gap-2 text-sm">
                  <Package className="w-4 h-4" />
                  <span>{totalBrands} Brand{totalBrands !== 1 ? 's' : ''}</span>
                  <Badge className="bg-gray-900 text-yellow-400 ml-1">{summary.totalPairs} items</Badge>
                </div>
              </>
            )}

            {totalDraftOrders > 0 && (
              <>
                <Separator orientation="vertical" className="h-6 bg-gray-900/20" />
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4" />
                  <span>{totalDraftOrders} Draft Order{totalDraftOrders !== 1 ? 's' : ''}</span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            {summary.subtotal > 0 && (
              <div className="text-right">
                <div className="text-xs opacity-80">Cart Total</div>
                <div className="font-bold text-lg">${summary.subtotal.toFixed(2)}</div>
              </div>
            )}
            
            <Button
              onClick={onToggle}
              variant="outline"
              size="sm"
              className="bg-gray-900 text-yellow-400 hover:bg-gray-800 border-gray-900"
              data-testid="button-expand-cart"
            >
              <ChevronDown className="w-4 h-4 mr-2" />
              View Cart
            </Button>
          </div>
        </div>
      )}

      {/* Expanded View */}
      {isExpanded && (
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-900 to-blue-800 text-white px-6 py-3 flex items-center justify-between border-b border-white/20">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5" />
              <h2 className="font-semibold text-lg">Shopping Cart & Orders</h2>
              <Badge className="bg-white text-blue-900">
                {totalBrands} Brands • {totalDraftOrders} Orders
              </Badge>
            </div>
            
            <Button
              onClick={onToggle}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20"
              data-testid="button-collapse-cart"
            >
              <ChevronUp className="w-4 h-4 mr-2" />
              Collapse
            </Button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-6 p-6">
              {/* Left Column: Current Cart */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-900" />
                    Current Cart ({totalBrands} brands)
                  </h3>
                  {totalBrands > 0 && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleExportCartToExcel}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        data-testid="button-export-cart"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Export to Excel
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm("Clear all items from cart?")) {
                            cartItems.forEach(item => removeCartItem(item.id));
                            toast({
                              title: "Cart Cleared",
                              description: "All items have been removed from your cart.",
                            });
                          }
                        }}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        data-testid="button-clear-cart"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Clear Cart
                      </Button>
                    </div>
                  )}
                </div>

                {/* Cart Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search cart items..."
                    value={cartSearchQuery}
                    onChange={(e) => setCartSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-cart"
                  />
                  {cartSearchQuery && (
                    <button
                      onClick={() => setCartSearchQuery("")}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {Object.keys(filteredItemsByBrand).length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <ShoppingCart className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-sm">
                      {cartSearchQuery ? "No items match your search" : "Your cart is empty"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(filteredItemsByBrand).sort(([a], [b]) => a.localeCompare(b)).map(([brandName, items]) => (
                      <div key={brandName} className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-semibold text-blue-900">{brandName}</span>
                          <span className="font-bold text-gray-700">
                            ${getBrandTotal(items).toFixed(2)}
                          </span>
                        </div>

                        {/* List items */}
                        <div className="space-y-2 mb-3 text-sm">
                          {items.map(({ cartItem, product }) => (
                            <div key={cartItem.id} className="flex items-start justify-between bg-white p-2 rounded border">
                              <div className="flex-1">
                                <div className="font-medium text-xs">{product.name}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {cartItem.selections.map((s: any, i: number) => (
                                    <div key={i}>
                                      {s.color} • Size {s.size} • Qty: {s.quantity}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeCartItem(cartItem.id)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                data-testid={`button-remove-${cartItem.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>

                        <Input
                          placeholder="Order nickname (optional)"
                          value={brandNicknames[brandName] || ""}
                          onChange={(e) => setBrandNicknames(prev => ({
                            ...prev,
                            [brandName]: e.target.value
                          }))}
                          className="text-sm"
                          data-testid={`input-nickname-${brandName}`}
                        />
                      </div>
                    ))}

                    <Button
                      onClick={handleCreateDraftOrders}
                      disabled={isCreatingOrders}
                      className="w-full bg-blue-900 hover:bg-blue-800"
                      data-testid="button-create-draft-orders"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      {isCreatingOrders ? "Creating..." : `Create ${totalBrands} Draft Order(s)`}
                    </Button>
                  </div>
                )}
              </div>

              {/* Right Column: Draft Orders */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-900" />
                    Draft Orders ({totalDraftOrders})
                  </h3>
                  {totalDraftOrders > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleClearAllOrders}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      data-testid="button-clear-draft-orders"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Clear All Orders
                    </Button>
                  )}
                </div>

                {/* Order Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search orders by brand, product..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-orders"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {draftOrders.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-sm">No draft orders yet</p>
                    <p className="text-xs mt-1">Create orders from your cart</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(draftOrdersByBrand).sort(([a], [b]) => a.localeCompare(b)).map(([brand, orders]) => (
                      <div key={brand} className="border rounded-lg overflow-hidden bg-white">
                        <div className="bg-blue-50 px-3 py-2 font-semibold text-sm border-b text-blue-900">
                          {brand}
                        </div>
                        {orders.map((order) => (
                          <div key={order.id} className="p-3 border-b last:border-b-0">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <div className="font-medium text-sm">{order.nickname || order.orderName}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {order.items.length} item(s) • {new Date(order.createdAt).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-sm">${parseFloat(order.total).toFixed(2)}</div>
                                <Badge className="text-xs mt-1" variant="outline">Draft</Badge>
                              </div>
                            </div>

                            <div className="flex gap-2 mt-3">
                              <Button
                                size="sm"
                                onClick={() => submitOrderMutation.mutate(order.id)}
                                disabled={submitOrderMutation.isPending}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-xs"
                                data-testid={`button-submit-order-${order.id}`}
                              >
                                <Send className="w-3 h-3 mr-1" />
                                Submit for Approval
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteOrder(order.id)}
                                data-testid={`button-delete-order-${order.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
