import { useQuery } from "@tanstack/react-query";
import { FeaturedCollections } from "@/components/FeaturedCollections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, DollarSign, AlertTriangle, Package, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import type { Product, Order } from "@shared/schema";

export default function Dashboard() {

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  const totalOrders = orders.length;
  const totalSpent = orders.reduce((sum, order) => sum + parseFloat(order.total.toString()), 0);
  const lowStockProducts = products.filter(p => p.stockLevel === 'low_stock');
  const availableProducts = products.filter(p => p.inStock).length;

  const getStatColor = (type: string) => {
    switch(type) {
      case 'orders': return 'border-blue-200 bg-blue-50';
      case 'spent': return 'border-green-200 bg-green-50';
      case 'low-stock': return 'border-red-200 bg-red-50';
      case 'available': return 'border-purple-200 bg-purple-50';
      default: return '';
    }
  };

  const getProgressColor = (type: string) => {
    switch(type) {
      case 'orders': return 'bg-blue-500';
      case 'spent': return 'bg-green-500';
      case 'low-stock': return 'bg-red-500';
      case 'available': return 'bg-purple-500';
      default: return '';
    }
  };

  return (
    <>
      <FeaturedCollections />
        
        <div className="p-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">
                Welcome back, Eyad Marei
              </h1>
              <p className="text-muted-foreground">
                Manage your wholesale shoe orders with ease
              </p>
            </div>
            <Link href="/catalog">
              <Button 
                className="bg-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]/90 text-[hsl(var(--accent-foreground))] font-semibold px-6"
                data-testid="button-browse-catalog"
              >
                <Package className="w-4 h-4 mr-2" />
                Browse Catalog
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className={getStatColor('orders')} data-testid="card-total-orders">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Orders
                </CardTitle>
                <ShoppingCart className="w-5 h-5 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground" data-testid="text-total-orders">
                  {totalOrders}
                </div>
                <div className="w-full bg-blue-200 rounded-full h-1.5 mt-3">
                  <div className={`${getProgressColor('orders')} h-1.5 rounded-full`} style={{ width: '100%' }}></div>
                </div>
              </CardContent>
            </Card>

            <Card className={getStatColor('spent')} data-testid="card-total-spent">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Spent
                </CardTitle>
                <DollarSign className="w-5 h-5 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground" data-testid="text-total-spent">
                  ${totalSpent.toFixed(2)}
                </div>
                <div className="w-full bg-green-200 rounded-full h-1.5 mt-3">
                  <div className={`${getProgressColor('spent')} h-1.5 rounded-full`} style={{ width: '100%' }}></div>
                </div>
              </CardContent>
            </Card>

            <Card className={getStatColor('low-stock')} data-testid="card-low-stock">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Low Stock Items
                </CardTitle>
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground" data-testid="text-low-stock-count">
                  {lowStockProducts.length}
                </div>
                <div className="w-full bg-red-200 rounded-full h-1.5 mt-3">
                  <div className={`${getProgressColor('low-stock')} h-1.5 rounded-full`} style={{ width: '100%' }}></div>
                </div>
              </CardContent>
            </Card>

            <Card className={getStatColor('available')} data-testid="card-available-products">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Available Products
                </CardTitle>
                <Package className="w-5 h-5 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground" data-testid="text-available-count">
                  {availableProducts}
                </div>
                <div className="w-full bg-purple-200 rounded-full h-1.5 mt-3">
                  <div className={`${getProgressColor('available')} h-1.5 rounded-full`} style={{ width: '100%' }}></div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card data-testid="card-recent-orders">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    Recent Orders
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {orders.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <ShoppingCart className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p>No orders yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {orders.slice(0, 5).map((order) => (
                        <div 
                          key={order.id} 
                          className="flex justify-between items-center p-3 bg-muted rounded-lg"
                          data-testid={`order-${order.id}`}
                        >
                          <div>
                            <p className="font-medium">Order #{order.id.slice(0, 8)}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">${parseFloat(order.total.toString()).toFixed(2)}</p>
                            <p className="text-sm text-muted-foreground capitalize">{order.status}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="border-red-200 bg-red-50" data-testid="card-low-stock-alerts">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-800">
                    <AlertTriangle className="w-5 h-5" />
                    Low Stock Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {lowStockProducts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      All products are well stocked
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {lowStockProducts.slice(0, 3).map((product) => (
                        <div 
                          key={product.id} 
                          className="bg-white p-3 rounded-lg"
                          data-testid={`low-stock-${product.id}`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-medium text-sm text-foreground">{product.brand}</p>
                              <p className="text-xs text-muted-foreground">{product.name}</p>
                            </div>
                            <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-1 rounded">
                              {product.availableSizes.reduce((sum, s) => sum + (s.stock || 0), 0)} left
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-[hsl(var(--sidebar-primary))]" data-testid="card-quick-actions">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[hsl(var(--sidebar-primary))]" />
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Link href="/order-builder">
                    <Button 
                      variant="outline" 
                      className="w-full justify-between"
                      data-testid="button-view-cart"
                    >
                      View Cart
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Link href="/profile">
                    <Button 
                      variant="outline" 
                      className="w-full justify-between"
                      data-testid="button-update-profile"
                    >
                      Update Profile
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
    </>
  );
}
