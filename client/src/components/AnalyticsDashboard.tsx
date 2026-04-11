import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Card, 
  Title, 
  Text, 
  Metric, 
  Grid, 
  Flex, 
  LineChart, 
  BarChart, 
  DonutChart, 
  AreaChart,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
  DateRangePicker,
  DateRangePickerValue
} from "@tremor/react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  ShoppingCart, 
  DollarSign, 
  Package, 
  Users,
  Filter,
  BarChart3,
  PieChart,
  Download,
  Drill,
  ArrowUp,
  ArrowDown,
  Minus
} from "lucide-react";
import type { 
  AnalyticsSummary, 
  OrderTrend, 
  RevenueBreakdown, 
  ProductPerformance, 
  CartAnalytics,
  DrillDownData
} from "@shared/schema";

interface DrillDownState {
  level: 'summary' | 'category' | 'brand';
  parentId?: string;
  parentName?: string;
  breadcrumbs: { name: string; level: string; id?: string }[];
}

interface AnalyticsDashboardProps {
  className?: string;
}

// Format currency values
const formatCurrency = (value: number) => 
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(value);

// Format percentage values
const formatPercentage = (value: number) => 
  `${value.toFixed(1)}%`;

// Get trend indicator
const getTrendIndicator = (current: number, previous: number) => {
  if (current > previous) return { icon: ArrowUp, color: "emerald", label: "increase" };
  if (current < previous) return { icon: ArrowDown, color: "rose", label: "decrease" };
  return { icon: Minus, color: "gray", label: "no change" };
};

export function AnalyticsDashboard({ className = "" }: AnalyticsDashboardProps) {
  const [dateRange, setDateRange] = useState<DateRangePickerValue>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    to: new Date()
  });
  
  const [drillDownState, setDrillDownState] = useState<DrillDownState>({
    level: 'summary',
    breadcrumbs: [{ name: 'Overview', level: 'summary' }]
  });

  const [selectedMetric, setSelectedMetric] = useState<'orders' | 'revenue' | 'products'>('orders');

  // Queries for different data
  const { data: summary, isLoading: summaryLoading } = useQuery<AnalyticsSummary>({
    queryKey: ['/api/analytics/summary']
  });

  const { data: orderTrends, isLoading: trendsLoading } = useQuery<OrderTrend[]>({
    queryKey: [
      '/api/analytics/orders',
      dateRange.from && dateRange.to ? 
        `from=${dateRange.from.toISOString()}&to=${dateRange.to.toISOString()}` : 
        ''
    ]
  });

  const { data: revenueData, isLoading: revenueLoading } = useQuery<RevenueBreakdown[]>({
    queryKey: ['/api/analytics/revenue', `type=category`]
  });

  const { data: productPerformance, isLoading: productsLoading } = useQuery<ProductPerformance[]>({
    queryKey: ['/api/analytics/products', 'limit=10']
  });

  const { data: cartAnalytics, isLoading: cartLoading } = useQuery<CartAnalytics>({
    queryKey: ['/api/analytics/cart-abandonment']
  });

  const { data: drillDownData } = useQuery<DrillDownData>({
    queryKey: [
      '/api/analytics/drill-down',
      `level=${drillDownState.level}${drillDownState.parentId ? `&parentId=${drillDownState.parentId}` : ''}`
    ]
  });

  // Handle drill down navigation
  const handleDrillDown = (level: 'category' | 'brand', id?: string, name?: string) => {
    const newBreadcrumbs = [...drillDownState.breadcrumbs];
    
    if (level === 'category') {
      newBreadcrumbs.push({ name: name || 'Category', level: 'category', id });
    } else if (level === 'brand') {
      newBreadcrumbs.push({ name: name || 'Brand', level: 'brand', id });
    }

    setDrillDownState({
      level,
      parentId: id,
      parentName: name,
      breadcrumbs: newBreadcrumbs
    });
  };

  // Handle breadcrumb navigation
  const handleBreadcrumbClick = (index: number) => {
    const breadcrumb = drillDownState.breadcrumbs[index];
    const newBreadcrumbs = drillDownState.breadcrumbs.slice(0, index + 1);
    
    setDrillDownState({
      level: breadcrumb.level as 'summary' | 'category' | 'brand',
      parentId: breadcrumb.id,
      parentName: breadcrumb.name,
      breadcrumbs: newBreadcrumbs
    });
  };

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!orderTrends) return [];
    
    return orderTrends.map(trend => ({
      date: new Date(trend.date).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      }),
      Orders: trend.orders,
      Revenue: trend.revenue,
      "Avg Order Value": trend.avgOrderValue
    }));
  }, [orderTrends]);

  const revenueChartData = useMemo(() => {
    const data = drillDownData?.data || revenueData || [];
    return data.map(item => ({
      name: item.name,
      Revenue: item.value,
      Count: item.count,
      percentage: item.percentage
    }));
  }, [drillDownData, revenueData]);

  const productChartData = useMemo(() => {
    if (!productPerformance) return [];
    
    return productPerformance.map(product => ({
      name: product.name,
      Revenue: product.totalRevenue,
      "Units Sold": product.totalOrdered,
      "Avg Price": product.avgPrice
    }));
  }, [productPerformance]);

  const abandonmentData = useMemo(() => {
    if (!cartAnalytics) return [];
    
    return [
      {
        name: "Completed",
        value: cartAnalytics.totalCarts - cartAnalytics.totalAbandonedCarts,
        color: "emerald"
      },
      {
        name: "Abandoned", 
        value: cartAnalytics.totalAbandonedCarts,
        color: "rose"
      }
    ];
  }, [cartAnalytics]);

  const isLoading = summaryLoading || trendsLoading || revenueLoading || productsLoading || cartLoading;

  return (
    <div className={`space-y-6 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Title>Analytics Dashboard</Title>
          <Text>Comprehensive business intelligence and performance metrics</Text>
        </div>
        
        <Flex className="space-x-4">
          <DateRangePicker
            value={dateRange}
            onValueChange={setDateRange}
            className="max-w-md"
          />
          <Button data-testid="button-export-data" variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </Flex>
      </div>

      {/* Breadcrumb Navigation */}
      {drillDownState.breadcrumbs.length > 1 && (
        <div className="flex items-center space-x-2 text-sm">
          {drillDownState.breadcrumbs.map((breadcrumb, index) => (
            <div key={index} className="flex items-center space-x-2">
              <Button
                data-testid={`breadcrumb-${index}`}
                variant="ghost" 
                size="sm"
                onClick={() => handleBreadcrumbClick(index)}
                className="p-0 h-auto font-medium text-primary hover:text-primary/80"
              >
                {breadcrumb.name}
              </Button>
              {index < drillDownState.breadcrumbs.length - 1 && (
                <span className="text-muted-foreground">/</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <Grid numItemsSm={2} numItemsLg={4} className="gap-6">
          <Card data-testid="card-total-orders">
            <Flex alignItems="start">
              <div>
                <Text>Total Orders</Text>
                <Metric>{summary.totalOrders.toLocaleString()}</Metric>
              </div>
              <ShoppingCart className="h-8 w-8 text-blue-500" />
            </Flex>
          </Card>
          
          <Card data-testid="card-total-revenue">
            <Flex alignItems="start">
              <div>
                <Text>Total Revenue</Text>
                <Metric>{formatCurrency(summary.totalRevenue)}</Metric>
              </div>
              <DollarSign className="h-8 w-8 text-emerald-500" />
            </Flex>
          </Card>

          <Card data-testid="card-avg-order-value">
            <Flex alignItems="start">
              <div>
                <Text>Avg Order Value</Text>
                <Metric>{formatCurrency(summary.avgOrderValue)}</Metric>
              </div>
              <TrendingUp className="h-8 w-8 text-amber-500" />
            </Flex>
          </Card>

          <Card data-testid="card-abandonment-rate">
            <Flex alignItems="start">
              <div>
                <Text>Cart Abandonment</Text>
                <Metric>{formatPercentage(summary.cartAbandonmentRate)}</Metric>
              </div>
              <Users className="h-8 w-8 text-rose-500" />
            </Flex>
          </Card>
        </Grid>
      )}

      {/* Main Dashboard Tabs */}
      <TabGroup>
        <TabList className="mt-8">
          <Tab>Overview</Tab>
          <Tab>Revenue Analysis</Tab>
          <Tab>Product Performance</Tab>
          <Tab>Cart Analytics</Tab>
        </TabList>

        <TabPanels className="mt-6">
          {/* Overview Tab */}
          <TabPanel>
            <Grid numItemsLg={2} className="gap-6">
              <Card data-testid="chart-order-trends">
                <Title>Order Trends</Title>
                <Text>Daily order volume and revenue over time</Text>
                {chartData.length > 0 ? (
                  <LineChart
                    className="mt-6"
                    data={chartData}
                    index="date"
                    categories={["Orders", "Revenue"]}
                    colors={["blue", "emerald"]}
                    yAxisWidth={60}
                    showLegend={true}
                    showGridLines={true}
                  />
                ) : (
                  <Text className="mt-6">No trend data available</Text>
                )}
              </Card>

              <Card data-testid="chart-revenue-breakdown">
                <Title>Revenue by Category</Title>
                <Text>Click to drill down into categories and brands</Text>
                {revenueChartData.length > 0 ? (
                  <BarChart
                    className="mt-6 cursor-pointer"
                    data={revenueChartData}
                    index="name"
                    categories={["Revenue"]}
                    colors={["blue"]}
                    yAxisWidth={80}
                    showLegend={false}
                    onValueChange={(value) => {
                      if (value && drillDownState.level === 'summary') {
                        // Find the category to drill into
                        const categoryData = revenueChartData.find(item => item.Revenue === value.Revenue);
                        if (categoryData) {
                          handleDrillDown('category', categoryData.name, categoryData.name);
                        }
                      }
                    }}
                  />
                ) : (
                  <Text className="mt-6">No revenue data available</Text>
                )}
              </Card>
            </Grid>
          </TabPanel>

          {/* Revenue Analysis Tab */}
          <TabPanel>
            <Grid numItemsLg={2} className="gap-6">
              <Card data-testid="chart-revenue-detailed">
                <Flex className="justify-between items-center">
                  <div>
                    <Title>Revenue Analysis</Title>
                    <Text>Detailed breakdown with drill-down capability</Text>
                  </div>
                  {drillDownState.level !== 'summary' && (
                    <Button
                      data-testid="button-drill-up"
                      variant="outline"
                      size="sm"
                      onClick={() => handleBreadcrumbClick(drillDownState.breadcrumbs.length - 2)}
                    >
                      <Drill className="h-4 w-4 mr-2" />
                      Drill Up
                    </Button>
                  )}
                </Flex>
                
                {revenueChartData.length > 0 ? (
                  <BarChart
                    className="mt-6"
                    data={revenueChartData}
                    index="name"
                    categories={["Revenue"]}
                    colors={["indigo"]}
                    yAxisWidth={80}
                    showLegend={false}
                  />
                ) : (
                  <Text className="mt-6">No data available for this level</Text>
                )}
              </Card>

              <Card data-testid="chart-revenue-distribution">
                <Title>Revenue Distribution</Title>
                <Text>Percentage breakdown of revenue sources</Text>
                {revenueChartData.length > 0 ? (
                  <DonutChart
                    className="mt-6"
                    data={revenueChartData.map(item => ({
                      name: item.name,
                      value: item.percentage,
                      Revenue: item.Revenue
                    }))}
                    category="value"
                    index="name"
                    colors={["blue", "emerald", "amber", "rose", "indigo", "purple"]}
                    showLabel={true}
                  />
                ) : (
                  <Text className="mt-6">No distribution data available</Text>
                )}
              </Card>
            </Grid>
          </TabPanel>

          {/* Product Performance Tab */}
          <TabPanel>
            <Grid numItemsLg={1} className="gap-6">
              <Card data-testid="chart-product-performance">
                <Title>Top Product Performance</Title>
                <Text>Revenue and units sold by product</Text>
                {productChartData.length > 0 ? (
                  <BarChart
                    className="mt-6"
                    data={productChartData}
                    index="name"
                    categories={["Revenue", "Units Sold"]}
                    colors={["emerald", "blue"]}
                    yAxisWidth={100}
                    showLegend={true}
                  />
                ) : (
                  <Text className="mt-6">No product performance data available</Text>
                )}
              </Card>
            </Grid>

            {/* Product Performance Table */}
            {productPerformance && (
              <Card className="mt-6" data-testid="table-product-details">
                <Title>Product Details</Title>
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-tremor-border dark:border-dark-tremor-border">
                        <th className="text-left p-3">Product</th>
                        <th className="text-left p-3">SKU</th>
                        <th className="text-left p-3">Brand</th>
                        <th className="text-right p-3">Revenue</th>
                        <th className="text-right p-3">Units Sold</th>
                        <th className="text-right p-3">Avg Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productPerformance.map((product, index) => (
                        <tr 
                          key={product.productId} 
                          className="border-b border-tremor-border dark:border-dark-tremor-border hover:bg-tremor-background-muted dark:hover:bg-dark-tremor-background-muted cursor-pointer"
                          data-testid={`product-row-${index}`}
                        >
                          <td className="p-3 font-medium">{product.name}</td>
                          <td className="p-3 text-tremor-content dark:text-dark-tremor-content">{product.sku}</td>
                          <td className="p-3">
                            <Badge variant="outline">{product.brand}</Badge>
                          </td>
                          <td className="p-3 text-right font-medium">{formatCurrency(product.totalRevenue)}</td>
                          <td className="p-3 text-right">{product.totalOrdered.toLocaleString()}</td>
                          <td className="p-3 text-right">{formatCurrency(product.avgPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabPanel>

          {/* Cart Analytics Tab */}
          <TabPanel>
            <Grid numItemsLg={2} className="gap-6">
              <Card data-testid="chart-cart-abandonment">
                <Title>Cart Completion vs Abandonment</Title>
                <Text>Ratio of completed vs abandoned carts</Text>
                {abandonmentData.length > 0 ? (
                  <DonutChart
                    className="mt-6"
                    data={abandonmentData}
                    category="value"
                    index="name"
                    colors={["emerald", "rose"]}
                    showLabel={true}
                  />
                ) : (
                  <Text className="mt-6">No cart data available</Text>
                )}
              </Card>

              <Card data-testid="card-cart-metrics">
                <Title>Cart Metrics</Title>
                {cartAnalytics && (
                  <div className="mt-6 space-y-4">
                    <Flex>
                      <Text>Total Carts</Text>
                      <Text className="font-semibold">{cartAnalytics.totalCarts.toLocaleString()}</Text>
                    </Flex>
                    <Flex>
                      <Text>Abandoned Carts</Text>
                      <Text className="font-semibold text-rose-600">{cartAnalytics.totalAbandonedCarts.toLocaleString()}</Text>
                    </Flex>
                    <Flex>
                      <Text>Avg Items per Cart</Text>
                      <Text className="font-semibold">{cartAnalytics.avgItemsPerCart.toFixed(1)}</Text>
                    </Flex>
                    <Flex>
                      <Text>Avg Cart Value</Text>
                      <Text className="font-semibold">{formatCurrency(cartAnalytics.avgCartValue)}</Text>
                    </Flex>
                  </div>
                )}
              </Card>
            </Grid>

            {/* Top Abandoned Products */}
            {cartAnalytics && cartAnalytics.topAbandonedProducts.length > 0 && (
              <Card className="mt-6" data-testid="table-abandoned-products">
                <Title>Most Abandoned Products</Title>
                <Text>Products frequently left in abandoned carts</Text>
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-tremor-border dark:border-dark-tremor-border">
                        <th className="text-left p-3">Product</th>
                        <th className="text-right p-3">Abandonment Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cartAnalytics.topAbandonedProducts.map((product, index) => (
                        <tr 
                          key={product.productId}
                          className="border-b border-tremor-border dark:border-dark-tremor-border"
                          data-testid={`abandoned-product-${index}`}
                        >
                          <td className="p-3 font-medium">{product.name}</td>
                          <td className="p-3 text-right">{product.abandonedCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  );
}