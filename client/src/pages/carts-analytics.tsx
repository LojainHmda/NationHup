import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ShoppingCart, 
  Package, 
  TrendingUp, 
  DollarSign,
  ArrowLeft,
  Boxes,
  Palette,
  Ruler
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

interface CartsSummaryData {
  summary: {
    totalActiveCarts: number;
    totalCartItems: number;
    totalQuantity: number;
    totalValue: number;
    avgItemsPerCart: number;
    avgValuePerCart: number;
  };
  itemsPerBrand: Array<{
    brand: string;
    count: number;
    totalQuantity: number;
    totalValue: number;
  }>;
  mostAddedProducts: Array<{
    productId: string;
    name: string;
    brand: string;
    count: number;
    quantity: number;
    imageUrl: string;
  }>;
  popularSizes: Array<{
    size: string;
    count: number;
  }>;
  popularColors: Array<{
    color: string;
    count: number;
  }>;
}

const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
];

export default function CartsAnalyticsPage() {
  const { data, isLoading, error } = useQuery<CartsSummaryData>({
    queryKey: ["/api/analytics/carts-summary"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading cart analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-red-600">
          <p>Failed to load cart analytics</p>
        </div>
      </div>
    );
  }

  const summary = data?.summary || {
    totalActiveCarts: 0,
    totalCartItems: 0,
    totalQuantity: 0,
    totalValue: 0,
    avgItemsPerCart: 0,
    avgValuePerCart: 0
  };

  const itemsPerBrand = data?.itemsPerBrand || [];
  const mostAddedProducts = data?.mostAddedProducts || [];
  const popularSizes = data?.popularSizes || [];
  const popularColors = data?.popularColors || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a1f2e] text-white px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/">
              <button className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors" data-testid="button-back-home">
                <ArrowLeft className="w-5 h-5" />
                Back to Home
              </button>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center">
              <Boxes className="w-6 h-6 text-[#1a1f2e]" />
            </div>
            <span className="text-xl font-bold">Carts Dashboard</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card data-testid="card-total-carts">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Active Carts</CardTitle>
              <ShoppingCart className="h-5 w-5 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900" data-testid="text-total-carts">
                {summary.totalActiveCarts}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {summary.avgItemsPerCart} avg items per cart
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-total-items">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Cart Items</CardTitle>
              <Package className="h-5 w-5 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900" data-testid="text-total-items">
                {summary.totalCartItems}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {summary.totalQuantity} total units
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-total-value">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Cart Value</CardTitle>
              <DollarSign className="h-5 w-5 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900" data-testid="text-total-value">
                ${summary.totalValue.toLocaleString()}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                ${summary.avgValuePerCart.toLocaleString()} avg per cart
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-brands-count">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Brands in Carts</CardTitle>
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900" data-testid="text-brands-count">
                {itemsPerBrand.length}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Different brands added
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card data-testid="card-items-per-brand">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-blue-600" />
                Items per Brand
              </CardTitle>
            </CardHeader>
            <CardContent>
              {itemsPerBrand.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={itemsPerBrand} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="brand" type="category" width={100} fontSize={12} />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        name === 'totalQuantity' ? `${value} units` : `$${value.toLocaleString()}`,
                        name === 'totalQuantity' ? 'Quantity' : 'Value'
                      ]}
                    />
                    <Bar dataKey="totalQuantity" fill="#3b82f6" name="totalQuantity" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-gray-500">
                  No items in carts yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-brand-value">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                Value by Brand
              </CardTitle>
            </CardHeader>
            <CardContent>
              {itemsPerBrand.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={itemsPerBrand}
                      dataKey="totalValue"
                      nameKey="brand"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ brand, percent }) => `${brand} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {itemsPerBrand.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Value']} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-gray-500">
                  No items in carts yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8" data-testid="card-most-added-products">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-yellow-600" />
              Most Added Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mostAddedProducts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {mostAddedProducts.map((product, index) => (
                  <div 
                    key={product.productId} 
                    className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                    data-testid={`product-card-${index}`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">
                        #{index + 1}
                      </div>
                      {product.image1 && (
                        <img 
                          src={product.image1} 
                          alt={product.name}
                          className="w-12 h-12 object-cover rounded"
                        />
                      )}
                    </div>
                    <h4 className="font-medium text-gray-900 text-sm truncate" title={product.name}>
                      {product.name}
                    </h4>
                    <p className="text-xs text-gray-500">{product.brand}</p>
                    <div className="mt-2 flex justify-between text-xs">
                      <span className="text-gray-600">{product.count} times added</span>
                      <span className="font-semibold text-blue-600">{product.quantity} units</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-gray-500">
                No products in carts yet
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card data-testid="card-popular-sizes">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ruler className="w-5 h-5 text-purple-600" />
                Popular Sizes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {popularSizes.length > 0 ? (
                <div className="space-y-3">
                  {popularSizes.map((item) => (
                    <div key={item.size} className="flex items-center gap-3">
                      <div className="w-12 h-8 bg-purple-100 rounded flex items-center justify-center text-purple-700 font-medium text-sm">
                        {item.size}
                      </div>
                      <div className="flex-1 bg-gray-200 rounded-full h-3">
                        <div 
                          className="bg-purple-500 h-3 rounded-full transition-all"
                          style={{ width: `${(item.count / popularSizes[0].count) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-600 w-16 text-right">{item.count} units</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-gray-500">
                  No size data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-popular-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-pink-600" />
                Popular Colors
              </CardTitle>
            </CardHeader>
            <CardContent>
              {popularColors.length > 0 ? (
                <div className="space-y-3">
                  {popularColors.map((item) => (
                    <div key={item.color} className="flex items-center gap-3">
                      <div className="w-12 h-8 bg-pink-100 rounded flex items-center justify-center text-pink-700 font-medium text-xs truncate px-1">
                        {item.color}
                      </div>
                      <div className="flex-1 bg-gray-200 rounded-full h-3">
                        <div 
                          className="bg-pink-500 h-3 rounded-full transition-all"
                          style={{ width: `${(item.count / popularColors[0].count) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-600 w-16 text-right">{item.count} units</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-gray-500">
                  No color data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
