import { Trash2, Edit3, ShoppingCart, Bookmark, Package, TrendingUp, Truck, CalendarClock, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useCart } from "@/hooks/useCart";

export function CartSidebar() {
  const { getBatchedItems, getOrderSummary, removeCartItem, createOrder, isRemoving, cartItems } = useCart();
  
  const batches = getBatchedItems();
  const orderSummary = getOrderSummary();
  
  // Determine cart source type from first item
  const cartSourceType = cartItems && cartItems.length > 0 
    ? (cartItems[0].sourceType || 'stock') 
    : null;

  const handleCheckout = () => {
    const cartItems = batches.flatMap(batch => 
      batch.items.flatMap(item => 
        item.selections.map(selection => ({
          productId: item.productId,
          productName: item.product?.name || "",
          sku: item.product?.sku || "",
          color: selection.color,
          size: selection.size,
          quantity: selection.quantity,
          unitPrice: parseFloat(item.product?.wholesalePrice || "0"),
          totalPrice: selection.quantity * parseFloat(item.product?.wholesalePrice || "0"),
        }))
      )
    );

    createOrder({
      items: cartItems,
      subtotal: orderSummary.subtotal.toString(),
      discount: orderSummary.discount.toString(),
      total: orderSummary.total.toString(),
      status: "pending",
    });
  };

  return (
    <aside className="w-96 bg-gradient-to-b from-white to-[#fffbf5] border-l border-gray-100 flex flex-col slide-in shadow-lg">
      <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-white to-[#fffbf5]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-gray-900 tracking-tight">Wholesale Cart</h3>
          <span className="text-sm font-semibold text-[#FE4438] bg-[#FE4438]/10 px-2.5 py-1 rounded-lg" data-testid="text-batch-count">
            {batches.length} batches
          </span>
        </div>
        {cartSourceType && (
          <Badge 
            className={`${
              cartSourceType === 'preorder' 
                ? 'bg-purple-100 text-purple-700 border-purple-200' 
                : 'bg-green-100 text-green-700 border-green-200'
            } border`}
            data-testid="badge-cart-source-type"
          >
            {cartSourceType === 'preorder' ? (
              <>
                <CalendarClock className="h-3 w-3 mr-1" />
                Pre-Order Cart
              </>
            ) : (
              <>
                <Boxes className="h-3 w-3 mr-1" />
                Stock Cart
              </>
            )}
          </Badge>
        )}
      </div>

      {/* Quick Order Visualization */}
      {batches.length > 0 && (
        <div className="p-6 border-b border-gray-100 bg-gradient-to-br from-[#FE4438]/5 via-white to-[#FE4438]/5">
          <div className="space-y-4">
            {/* Main Order Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
                <div className="text-2xl font-bold bg-gradient-to-r from-[#FE4438] to-[#FE4438] bg-clip-text text-transparent" data-testid="text-quick-total">
                  ${orderSummary.total.toFixed(0)}
                </div>
                <div className="text-xs text-gray-600 mt-1 font-medium">Total Cost</div>
              </div>
              <div className="text-center bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
                <div className="text-2xl font-bold text-gray-900" data-testid="text-quick-pairs">
                  {orderSummary.totalPairs}
                </div>
                <div className="text-xs text-gray-600 mt-1 font-medium">Total Pairs</div>
              </div>
              <div className="text-center bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
                <div className="text-2xl font-bold text-gray-900" data-testid="text-quick-products">
                  {batches.reduce((count, batch) => count + batch.items.length, 0)}
                </div>
                <div className="text-xs text-gray-600 mt-1 font-medium">Products</div>
              </div>
            </div>

            {/* Free Shipping Progress */}
            <div className="space-y-2 bg-white rounded-2xl p-3 border border-gray-100">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center text-gray-700">
                  <Truck className="h-4 w-4 mr-1.5 text-[#FE4438]" />
                  Free Shipping
                </span>
                <span className="text-gray-600" data-testid="text-shipping-progress">
                  ${Math.min(orderSummary.total, 2500).toFixed(0)} / $2,500
                </span>
              </div>
              <Progress 
                value={(orderSummary.total / 2500) * 100} 
                className="h-2"
                data-testid="progress-shipping"
              />
            </div>

            {/* Product Preview Thumbnails */}
            <div className="flex items-center justify-between bg-white rounded-2xl p-3 border border-gray-100">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-gray-700">Products:</span>
                <div className="flex -space-x-1" data-testid="product-thumbnails">
                  {batches.slice(0, 3).flatMap(batch => 
                    batch.items.slice(0, 4 - batches.slice(0, 3).flatMap(b => b.items).length)
                  ).map((item, index) => (
                    <div key={`${item.id}-${index}`} className="relative">
                      <img
                        src={item.product?.image1}
                        alt={item.product?.name}
                        className="w-6 h-6 rounded-lg border-2 border-white object-fill"
                        title={item.product?.name}
                      />
                    </div>
                  ))}
                  {batches.reduce((count, batch) => count + batch.items.length, 0) > 4 && (
                    <div className="w-6 h-6 rounded-lg bg-gray-100 border-2 border-white flex items-center justify-center">
                      <span className="text-xs font-medium text-gray-600">+{batches.reduce((count, batch) => count + batch.items.length, 0) - 4}</span>
                    </div>
                  )}
                </div>
              </div>
              
              {orderSummary.discount > 0 && (
                <Badge className="bg-gradient-to-r from-[#FE4438] to-[#FE4438] text-white shadow-md shadow-[#FE4438]/30" data-testid="badge-bulk-discount">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  15% Bulk Discount
                </Badge>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {batches.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gradient-to-br from-[#FE4438]/20 to-[#FE4438]/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShoppingCart className="h-8 w-8 text-[#FE4438]" />
            </div>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Your cart is empty</h4>
            <p className="text-gray-600 text-sm">Add products to start building your wholesale order</p>
          </div>
        ) : (
          batches.map((batch, batchIndex) => (
            <div key={batch.name} className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900" data-testid={`text-batch-name-${batchIndex}`}>
                  {batch.name}
                </h4>
                <Button
                  data-testid={`button-edit-batch-${batchIndex}`}
                  variant="ghost"
                  size="sm"
                  className="text-xs text-[#FE4438] hover:text-[#FE4438] hover:bg-[#FE4438]/10 h-auto p-1 transition-colors font-medium"
                >
                  <Edit3 className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </div>

              {batch.items.map((item) => {
                const totalQuantity = item.selections.reduce((sum, sel) => sum + sel.quantity, 0);
                const totalPrice = item.selections.reduce((sum, sel) => {
                  return sum + (sel.quantity * parseFloat(item.product?.wholesalePrice || "0"));
                }, 0);

                return (
                  <div
                    key={item.id}
                    data-testid={`cart-item-${item.id}`}
                    className="cart-item bg-white border-2 border-gray-100 rounded-2xl p-4 transition-all duration-300 hover:border-[#FE4438] hover:shadow-lg hover:shadow-[#FE4438]/10"
                  >
                    <div className="flex items-start space-x-4">
                      <div className="relative">
                        <img
                          src={item.product?.image1}
                          alt={item.product?.name}
                          className="w-16 h-16 rounded-xl object-fill border border-gray-100"
                          data-testid={`img-cart-item-${item.id}`}
                        />
                        <Badge 
                          className="absolute -top-2 -right-2 text-xs px-2 py-0.5 bg-gradient-to-r from-[#FE4438] to-[#FE4438] text-white shadow-lg shadow-[#FE4438]/30"
                          data-testid={`badge-quantity-${item.id}`}
                        >
                          {totalQuantity}
                        </Badge>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h5 className="text-sm font-semibold text-gray-900 truncate" data-testid={`text-cart-item-name-${item.id}`}>
                              {item.product?.name}
                            </h5>
                            <div className="flex items-center space-x-2 mt-1">
                              <p className="text-xs text-gray-600" data-testid={`text-cart-item-category-${item.id}`}>
                                {item.product?.category}
                              </p>
                              <span className="text-xs text-gray-400">•</span>
                              <span className="text-xs text-gray-600">
                                SKU: {item.product?.sku}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold bg-gradient-to-r from-[#FE4438] to-[#FE4438] bg-clip-text text-transparent" data-testid={`text-item-total-${item.id}`}>
                              ${totalPrice.toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-600" data-testid={`text-item-quantity-${item.id}`}>
                              {totalQuantity} pairs
                            </div>
                          </div>
                        </div>
                        
                        {/* Enhanced Size/Color Grid Summary */}
                        <div className="mt-3">
                          <div className="text-xs font-semibold text-gray-700 mb-2">Color & Size Selection:</div>
                          <div className="space-y-2">
                            {Object.entries(
                              item.selections.reduce((acc, sel) => {
                                if (!acc[sel.color]) acc[sel.color] = [];
                                acc[sel.color].push(`${sel.size}(${sel.quantity})`);
                                return acc;
                              }, {} as Record<string, string[]>)
                            ).map(([color, sizesWithQty]) => (
                              <div key={color} className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <div className="w-3 h-3 rounded-full border-2 border-[#FE4438] bg-gradient-to-br from-[#FE4438] to-[#FE4438]"></div>
                                  <span className="text-xs font-medium text-gray-700">{color}</span>
                                </div>
                                <span className="text-xs bg-gray-100 px-2 py-1 rounded-lg text-gray-600 font-medium" data-testid={`text-color-summary-${color}-${item.id}`}>
                                  {sizesWithQty.join(', ')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center justify-end mt-4 space-x-2">
                          <Button
                            data-testid={`button-remove-item-${item.id}`}
                            variant="outline"
                            size="sm"
                            className="text-xs text-gray-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all h-8 px-3 border-gray-200 font-medium"
                            onClick={() => removeCartItem(item.id)}
                            disabled={isRemoving}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Cart Footer */}
      {batches.length > 0 && (
        <div className="border-t border-gray-100 p-6 space-y-4 bg-gradient-to-b from-[#fffbf5] to-white">
          <div className="space-y-3">
            <div className="flex justify-between text-sm font-semibold text-gray-900">
              <span>Subtotal:</span>
              <span data-testid="text-subtotal">${orderSummary.subtotal.toFixed(2)}</span>
            </div>
            {orderSummary.discount > 0 && (
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-gray-700">Bulk Discount (15%):</span>
                <span className="bg-gradient-to-r from-[#FE4438] to-[#FE4438] bg-clip-text text-transparent" data-testid="text-discount">
                  -${orderSummary.discount.toFixed(2)}
                </span>
              </div>
            )}
            <Separator className="bg-gray-100" />
            <div className="flex justify-between text-base font-bold">
              <span className="text-gray-900">Total:</span>
              <span className="bg-gradient-to-r from-[#FE4438] to-[#FE4438] bg-clip-text text-transparent text-lg" data-testid="text-total">${orderSummary.total.toFixed(2)}</span>
            </div>
            <p className="text-xs text-gray-600 font-medium" data-testid="text-order-summary">
              {orderSummary.totalPairs} pairs total • Free shipping on orders over $2,500
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <Button
              data-testid="button-checkout"
              className="w-full bg-gradient-to-r from-[#FE4438] to-[#FE4438] hover:from-[#FE4438] hover:to-[#FE4438] text-white font-bold rounded-xl shadow-lg shadow-[#FE4438]/30 hover:shadow-xl transition-all duration-300 h-11"
              onClick={handleCheckout}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Proceed to Checkout
            </Button>
            <Button
              data-testid="button-save-for-later"
              variant="outline"
              size="sm"
              className="w-full text-gray-700 hover:text-[#FE4438] border-gray-200 hover:border-[#FE4438] hover:bg-[#FE4438]/5 transition-all font-medium h-9"
            >
              <Bookmark className="h-4 w-4 mr-2" />
              Save for Later
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
