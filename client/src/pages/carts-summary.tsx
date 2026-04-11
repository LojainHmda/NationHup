import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { GripVertical, Lock, ChevronDown, ChevronRight, ChevronUp, Package, Download, Search, X, FileSpreadsheet, ShoppingCart, TrendingUp, Boxes, Calendar, DollarSign, Palette, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCartContext } from '@/hooks/useCartContext';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { Product, Brand } from '@shared/schema';
import * as XLSX from 'xlsx';
import { format, startOfMonth, endOfMonth } from 'date-fns';
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
} from 'recharts';

type GroupingKey = 'brand' | 'cartSource' | 'size' | 'ageGroup' | 'category' | 'color' | 'mainCategory' | 'model' | 'sku' | 'productName';

interface DimensionConfig {
  key: GroupingKey;
  label: string;
  getValue: (item: CartItemFlat, product?: Product, brands?: Brand[]) => string;
}

interface CartItemFlat {
  productId: string;
  productName: string;
  sku: string;
  brand: string;
  size: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  color: string;
  cartSource: string;
  cartId: string;
  category?: string;
  ageGroup?: string;
  mainCategory?: string;
  model?: string;
  imageUrl?: string;
}

interface TreeNode {
  key: string;
  label: string;
  dimension: string;
  volume: number;
  aggregateValue: number;
  skuCount: number;
  children: TreeNode[];
  items: CartItemFlat[];
  depth: number;
}

const DIMENSION_CONFIGS: Record<GroupingKey, DimensionConfig> = {
  brand: {
    key: 'brand',
    label: 'BRAND',
    getValue: (item, product, brands) => {
      const brandId = item.brand || product?.brand;
      const brandObj = brands?.find(b => b.id === brandId);
      return brandObj?.name || brandId || 'Unknown';
    }
  },
  cartSource: {
    key: 'cartSource',
    label: 'CART SOURCE',
    getValue: (item) => item.cartSource || 'Unknown Cart'
  },
  size: {
    key: 'size',
    label: 'SIZE',
    getValue: (item) => item.size || 'Unknown'
  },
  ageGroup: {
    key: 'ageGroup',
    label: 'AGE GROUP',
    getValue: (item, product) => product?.ageGroup || item.ageGroup || 'Unknown'
  },
  category: {
    key: 'category',
    label: 'CATEGORY',
    getValue: (item, product) => product?.category || item.category || 'Unknown'
  },
  color: {
    key: 'color',
    label: 'COLOR',
    getValue: (item) => item.color || 'Unknown'
  },
  mainCategory: {
    key: 'mainCategory',
    label: 'MAIN CATEGORY',
    getValue: (item, product) => product?.mainCategory || item.mainCategory || 'Unknown'
  },
  model: {
    key: 'model',
    label: 'MODEL',
    getValue: (item, product) => product?.productLine || item.model || 'Unknown'
  },
  sku: {
    key: 'sku',
    label: 'SKU',
    getValue: (item) => item.sku || 'Unknown'
  },
  productName: {
    key: 'productName',
    label: 'PRODUCT NAME',
    getValue: (item) => item.productName || 'Unknown'
  }
};

const ALL_DIMENSIONS: GroupingKey[] = ['cartSource', 'brand', 'size', 'ageGroup', 'category', 'color', 'mainCategory', 'model', 'sku', 'productName'];

const parseNumber = (val: any): number => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const DEPTH_COLORS = [
  'bg-blue-50 border-blue-200',
  'bg-green-50 border-green-200',
  'bg-purple-50 border-purple-200',
  'bg-red-50 border-red-200',
  'bg-pink-50 border-pink-200',
  'bg-cyan-50 border-cyan-200',
  'bg-yellow-50 border-yellow-200',
  'bg-indigo-50 border-indigo-200',
  'bg-rose-50 border-rose-200',
  'bg-teal-50 border-teal-200',
];

const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
];

export default function CartsSummary() {
  const [, navigate] = useLocation();
  const { drafts, isDraftsLoading } = useCartContext();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDimensions, setActiveDimensions] = useState<GroupingKey[]>(['cartSource', 'brand']);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [draggedDimension, setDraggedDimension] = useState<GroupingKey | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showHierarchy, setShowHierarchy] = useState(true);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  
  const today = new Date();
  const [dateFrom, setDateFrom] = useState<string>(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState<string>(format(endOfMonth(today), 'yyyy-MM-dd'));
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ['/api/brands'],
  });

  const uniqueBrands = useMemo(() => {
    const brandSet = new Set<string>();
    drafts.forEach(draft => {
      draft.items?.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        const brand = item.brand || product?.brand;
        if (brand) brandSet.add(brand);
      });
    });
    return Array.from(brandSet).sort();
  }, [drafts, products]);

  const filteredDrafts = useMemo(() => {
    return drafts.filter(draft => {
      if (statusFilter !== 'all' && draft.status !== statusFilter) {
        return false;
      }
      const draftTimestamp = draft.updatedAt || draft.createdAt;
      if (draftTimestamp && (dateFrom || dateTo)) {
        const draftDate = new Date(draftTimestamp);
        if (!isNaN(draftDate.getTime())) {
          const fromDate = dateFrom ? new Date(dateFrom) : null;
          const toDate = dateTo ? new Date(dateTo + 'T23:59:59') : null;
          if (fromDate && draftDate < fromDate) return false;
          if (toDate && draftDate > toDate) return false;
        }
      }
      if (selectedBrands.length > 0) {
        const hasMatchingBrand = draft.items?.some(item => {
          const product = products.find(p => p.id === item.productId);
          const itemBrand = item.brand || product?.brand;
          return itemBrand && selectedBrands.includes(itemBrand);
        });
        if (!hasMatchingBrand) return false;
      }
      return true;
    });
  }, [drafts, statusFilter, dateFrom, dateTo, selectedBrands, products]);

  const statusCounts = useMemo(() => {
    return {
      all: drafts.length,
      draft: drafts.filter(d => d.status === 'draft').length,
      pending: drafts.filter(d => d.status === 'pending').length,
      approved: drafts.filter(d => d.status === 'approved').length,
      rejected: drafts.filter(d => d.status === 'rejected').length,
    };
  }, [drafts]);

  const flattenedItems: CartItemFlat[] = useMemo(() => {
    const items: CartItemFlat[] = [];
    filteredDrafts.forEach(draft => {
      const cartName = draft.nickname || draft.orderName || 'Unnamed Cart';
      draft.items?.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        const itemAny = item as any;
        const itemColor = itemAny.color || product?.colourway || 'Default';
        items.push({
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          brand: item.brand,
          size: item.size,
          quantity: parseNumber(item.quantity),
          unitPrice: parseNumber(item.unitPrice),
          totalPrice: parseNumber(item.totalPrice),
          color: itemColor !== 'Default' ? itemColor : (product?.colourway || itemColor),
          cartSource: cartName,
          cartId: draft.id,
          category: product?.category || undefined,
          ageGroup: product?.ageGroup || undefined,
          mainCategory: product?.mainCategory || undefined,
          model: product?.productLine || undefined,
          imageUrl: product?.image1 || undefined,
        });
      });
    });
    return items;
  }, [filteredDrafts, products]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return flattenedItems;
    const query = searchQuery.toLowerCase();
    return flattenedItems.filter(item => 
      item.productName.toLowerCase().includes(query) ||
      item.sku.toLowerCase().includes(query) ||
      item.brand.toLowerCase().includes(query) ||
      item.size.toLowerCase().includes(query) ||
      item.cartSource.toLowerCase().includes(query)
    );
  }, [flattenedItems, searchQuery]);

  const computedAnalytics = useMemo(() => {
    const totalActiveCarts = filteredDrafts.length;
    const allItems = filteredDrafts.flatMap(d => d.items || []);
    const totalCartItems = allItems.length;
    const totalQuantity = allItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalValue = allItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const avgItemsPerCart = totalActiveCarts > 0 ? totalCartItems / totalActiveCarts : 0;
    const avgValuePerCart = totalActiveCarts > 0 ? totalValue / totalActiveCarts : 0;

    const brandMap: Record<string, { count: number; totalQuantity: number; totalValue: number }> = {};
    allItems.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      const brand = item.brand || product?.brand || 'Unknown';
      if (!brandMap[brand]) {
        brandMap[brand] = { count: 0, totalQuantity: 0, totalValue: 0 };
      }
      brandMap[brand].count += 1;
      brandMap[brand].totalQuantity += item.quantity;
      brandMap[brand].totalValue += item.totalPrice;
    });
    const itemsPerBrand = Object.entries(brandMap)
      .map(([brand, data]) => ({ brand, ...data }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity);

    const productMap: Record<string, { productId: string; name: string; brand: string; count: number; quantity: number; image1: string; gender: string }> = {};
    allItems.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (!productMap[item.productId]) {
        productMap[item.productId] = {
          productId: item.productId,
          name: item.productName,
          brand: item.brand || product?.brand || 'Unknown',
          count: 0,
          quantity: 0,
          image1: product?.image1 || '',
          gender: product?.gender || 'Unknown'
        };
      }
      productMap[item.productId].count += 1;
      productMap[item.productId].quantity += item.quantity;
    });
    const mostAddedProducts = Object.values(productMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const sizeMap: Record<string, number> = {};
    allItems.forEach(item => {
      sizeMap[item.size] = (sizeMap[item.size] || 0) + item.quantity;
    });
    const popularSizes = Object.entries(sizeMap)
      .map(([size, count]) => ({ size, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const colorMap: Record<string, number> = {};
    allItems.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      const itemAny = item as any;
      const color = itemAny.color !== 'Default' ? itemAny.color : (product?.colourway || itemAny.color);
      colorMap[color] = (colorMap[color] || 0) + item.quantity;
    });
    const popularColors = Object.entries(colorMap)
      .map(([color, count]) => ({ color, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      summary: { totalActiveCarts, totalCartItems, totalQuantity, totalValue, avgItemsPerCart, avgValuePerCart },
      itemsPerBrand,
      mostAddedProducts,
      popularSizes,
      popularColors
    };
  }, [filteredDrafts, products]);

  const uniqueModelsWithCount = useMemo(() => {
    const modelCounts: Record<string, number> = {};
    filteredDrafts.forEach(draft => {
      draft.items?.forEach(item => {
        modelCounts[item.productName] = (modelCounts[item.productName] || 0) + item.quantity;
      });
    });
    return Object.entries(modelCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredDrafts]);

  const buildTree = useCallback((items: CartItemFlat[], dimensions: GroupingKey[], depth: number = 0, parentKey: string = ''): TreeNode[] => {
    if (dimensions.length === 0 || items.length === 0) {
      return [];
    }

    const currentDimension = dimensions[0];
    const remainingDimensions = dimensions.slice(1);
    const config = DIMENSION_CONFIGS[currentDimension];
    
    const groups: Record<string, CartItemFlat[]> = {};
    items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      const value = config.getValue(item, product, brands);
      if (!groups[value]) {
        groups[value] = [];
      }
      groups[value].push(item);
    });

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, groupItems]) => {
        const nodeKey = parentKey ? `${parentKey}__${currentDimension}:${label}` : `${currentDimension}:${label}`;
        const volume = groupItems.reduce((sum, item) => sum + item.quantity, 0);
        const aggregateValue = groupItems.reduce((sum, item) => sum + item.totalPrice, 0);
        const uniqueSkus = new Set(groupItems.map(item => item.sku));
        
        return {
          key: nodeKey,
          label,
          dimension: config.label,
          volume,
          aggregateValue,
          skuCount: uniqueSkus.size,
          children: buildTree(groupItems, remainingDimensions, depth + 1, nodeKey),
          items: groupItems,
          depth,
        };
      });
  }, [products, brands]);

  const treeData = useMemo(() => {
    return buildTree(filteredItems, activeDimensions);
  }, [filteredItems, activeDimensions, buildTree]);

  const toggleNode = (nodeKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeKey)) {
        next.delete(nodeKey);
      } else {
        next.add(nodeKey);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allKeys = new Set<string>();
    const collectKeys = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        if (node.children.length > 0) {
          allKeys.add(node.key);
          collectKeys(node.children);
        }
      });
    };
    collectKeys(treeData);
    setExpandedNodes(allKeys);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  const handleDragStart = (dimension: GroupingKey) => {
    setDraggedDimension(dimension);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDropOnActive = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!draggedDimension) return;

    const sourceIndex = activeDimensions.indexOf(draggedDimension);
    
    if (sourceIndex === -1) {
      const newDimensions = [...activeDimensions];
      newDimensions.splice(targetIndex, 0, draggedDimension);
      setActiveDimensions(newDimensions);
    } else if (sourceIndex !== targetIndex) {
      const newDimensions = [...activeDimensions];
      newDimensions.splice(sourceIndex, 1);
      newDimensions.splice(targetIndex > sourceIndex ? targetIndex - 1 : targetIndex, 0, draggedDimension);
      setActiveDimensions(newDimensions);
    }

    setDraggedDimension(null);
    setDragOverIndex(null);
    setExpandedNodes(new Set());
  };

  const handleDropOnAvailable = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedDimension) return;

    if (activeDimensions.includes(draggedDimension)) {
      setActiveDimensions(activeDimensions.filter(d => d !== draggedDimension));
    }

    setDraggedDimension(null);
    setDragOverIndex(null);
  };

  const removeDimension = (dimension: GroupingKey) => {
    setActiveDimensions(activeDimensions.filter(d => d !== dimension));
    setExpandedNodes(new Set());
  };

  const availableDimensions = ALL_DIMENSIONS.filter(d => !activeDimensions.includes(d));

  const handleExportToExcel = () => {
    const exportData: any[] = [];
    
    const flattenNode = (node: TreeNode, path: string[] = []) => {
      const currentPath = [...path, `${node.dimension}: ${node.label}`];
      
      exportData.push({
        'Hierarchy Path': currentPath.join(' > '),
        'Level': node.depth + 1,
        'Dimension': node.dimension,
        'Value': node.label,
        'SKU Count': node.skuCount,
        'Volume (Quantity)': node.volume,
        'Aggregate Value': node.aggregateValue,
        'Type': node.children.length > 0 ? 'Group' : 'Leaf',
      });
      
      if (node.children.length > 0) {
        node.children.forEach(child => flattenNode(child, currentPath));
      } else {
        node.items.forEach(item => {
          exportData.push({
            'Hierarchy Path': currentPath.join(' > '),
            'Level': node.depth + 2,
            'Dimension': 'ITEM',
            'Value': item.productName,
            'SKU': item.sku,
            'Brand': item.brand,
            'Size': item.size,
            'Color': item.color,
            'Cart Source': item.cartSource,
            'Volume (Quantity)': item.quantity,
            'Unit Price': item.unitPrice,
            'Aggregate Value': item.totalPrice,
            'Type': 'Item',
          });
        });
      }
    };

    treeData.forEach(node => flattenNode(node));

    exportData.push({
      'Hierarchy Path': 'GRAND TOTAL',
      'Level': 0,
      'Dimension': 'TOTAL',
      'Value': 'All Items',
      'SKU Count': new Set(flattenedItems.map(i => i.sku)).size,
      'Volume (Quantity)': flattenedItems.reduce((s, i) => s + i.quantity, 0),
      'Aggregate Value': flattenedItems.reduce((s, i) => s + i.totalPrice, 0),
      'Type': 'Total',
    });

    if (exportData.length === 0) {
      toast({
        title: 'No data to export',
        description: 'Add some items to your carts first.',
        variant: 'destructive',
      });
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cart Hierarchy');

    const colWidths = [
      { wch: 60 },
      { wch: 8 },
      { wch: 15 },
      { wch: 30 },
      { wch: 10 },
      { wch: 15 },
      { wch: 15 },
      { wch: 10 },
      { wch: 15 },
      { wch: 10 },
      { wch: 15 },
      { wch: 10 },
      { wch: 15 },
    ];
    worksheet['!cols'] = colWidths;

    const fileName = `cart_hierarchy_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    
    toast({
      title: 'Export successful',
      description: `Exported ${exportData.length} rows to ${fileName}`,
    });
  };

  const totalVolume = filteredItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = filteredItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const uniqueSkuCount = new Set(filteredItems.map(item => item.sku)).size;

  const renderTreeNode = (node: TreeNode) => {
    const isExpanded = expandedNodes.has(node.key);
    const hasChildren = node.children.length > 0;
    const depthColor = DEPTH_COLORS[node.depth % DEPTH_COLORS.length];

    return (
      <div key={node.key} data-testid={`tree-node-${node.key}`}>
        <div 
          className={`flex items-center gap-2 py-2 px-3 border-b hover:bg-muted/50 transition-colors ${isExpanded && hasChildren ? depthColor : ''}`}
          style={{ paddingLeft: `${node.depth * 24 + 12}px` }}
        >
          <div className="flex items-center gap-2 flex-1">
            {hasChildren ? (
              <button 
                className="p-0.5 hover:bg-muted rounded cursor-pointer" 
                data-testid={`toggle-${node.key}`}
                onClick={(e) => toggleNode(node.key, e)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            ) : (
              <div className="w-5" />
            )}
            <span className="text-xs text-muted-foreground uppercase tracking-wider">{node.dimension}:</span>
            <span className="font-medium">{node.label}</span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="text-right min-w-[60px]">
              <span className="text-muted-foreground text-xs">SKUs: </span>
              <span className="font-medium">{node.skuCount}</span>
            </div>
            <div className="text-right min-w-[80px]">
              <span className="text-muted-foreground text-xs">Vol: </span>
              <span className="font-semibold text-blue-600">{node.volume.toLocaleString()}</span>
            </div>
            <div className="text-right min-w-[100px]">
              <span className="text-muted-foreground text-xs">Value: </span>
              <span className="font-semibold text-green-600">${node.aggregateValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
        {isExpanded && hasChildren && (
          <div>
            {node.children.map(child => renderTreeNode(child))}
          </div>
        )}
      </div>
    );
  };

  const handleReturnToShop = () => {
    navigate('/shop');
  };

  if (isDraftsLoading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/4" />
            <div className="h-64 bg-muted rounded" />
            <div className="h-64 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="flex-1 overflow-auto">
        <div className="sticky top-0 z-20 bg-background border-b">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold">Carts Summary</h1>
                <span className="text-sm text-muted-foreground">
                  {filteredDrafts.length} cart{filteredDrafts.length !== 1 ? 's' : ''} of {drafts.length} total
                </span>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Subtotal</p>
                  <p className="text-lg font-semibold text-muted-foreground">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">VAT ({parseFloat((user as any)?.taxRate || '5')}%)</p>
                  <p className="text-lg font-semibold text-muted-foreground">${(totalValue * parseFloat((user as any)?.taxRate || '5') / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="text-right border-l pl-6">
                  <p className="text-sm text-muted-foreground">Total with VAT</p>
                  <p className="text-2xl font-bold text-primary">${(totalValue + totalValue * parseFloat((user as any)?.taxRate || '5') / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {(['all', 'draft', 'pending', 'approved', 'rejected'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                    statusFilter === status
                      ? 'bg-gradient-to-r from-[#FE4438] to-[#FE4438] text-white shadow-lg border-[#FE4438]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-[#FE4438] hover:text-[#FE4438]'
                  }`}
                  data-testid={`filter-status-${status}`}
                >
                  {status === 'all' ? 'All' : status === 'draft' ? 'Open' : status === 'pending' ? 'In Review' : status.charAt(0).toUpperCase() + status.slice(1)} ({statusCounts[status]})
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-600">Date Range:</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-40 h-9 text-sm"
                  data-testid="input-date-from"
                />
                <span className="text-gray-400">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-40 h-9 text-sm"
                  data-testid="input-date-to"
                />
              </div>
              {(dateFrom !== format(startOfMonth(today), 'yyyy-MM-dd') || dateTo !== format(endOfMonth(today), 'yyyy-MM-dd')) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateFrom(format(startOfMonth(today), 'yyyy-MM-dd'));
                    setDateTo(format(endOfMonth(today), 'yyyy-MM-dd'));
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                  data-testid="button-reset-dates"
                >
                  Reset to Current Month
                </Button>
              )}
            </div>

            {uniqueBrands.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-600 mr-2">Brands:</span>
                {uniqueBrands.map((brand) => (
                  <button
                    key={brand}
                    onClick={() => {
                      setSelectedBrands(prev => 
                        prev.includes(brand) 
                          ? prev.filter(b => b !== brand)
                          : [...prev, brand]
                      );
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      selectedBrands.includes(brand)
                        ? 'bg-[#FE4438] text-white border-[#FE4438] shadow-md'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-[#FE4438] hover:text-[#FE4438]'
                    }`}
                    data-testid={`filter-brand-${brand}`}
                  >
                    {brand}
                  </button>
                ))}
                {selectedBrands.length > 0 && (
                  <button
                    onClick={() => setSelectedBrands([])}
                    className="px-2 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    data-testid="button-clear-brands"
                  >
                    <X className="w-3 h-3" />
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-6">
          <button
            onClick={() => setShowHierarchy(!showHierarchy)}
            className="flex items-center gap-2 text-lg font-semibold mb-4 hover:text-primary transition-colors"
            data-testid="button-toggle-hierarchy"
          >
            <GripVertical className="w-5 h-5" />
            Hierarchical Pivot View
            {showHierarchy ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showHierarchy && (
            <>
              <Card className="rounded-none mb-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <GripVertical className="w-4 h-4" />
                    Pivot Dimensions
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Drag and drop dimensions to organize your cart data hierarchy</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        ACTIVE DIMENSIONS (drag to reorder)
                      </p>
                      <div 
                        className="flex flex-wrap gap-2 min-h-[40px] p-2 border-2 border-dashed border-muted rounded-lg bg-muted/20"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDropOnActive(e, activeDimensions.length)}
                      >
                        {activeDimensions.map((dim, index) => (
                          <div
                            key={dim}
                            draggable
                            onDragStart={() => handleDragStart(dim)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDropOnActive(e, index)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium cursor-grab active:cursor-grabbing transition-all ${
                              dragOverIndex === index ? 'ring-2 ring-primary ring-offset-2' : ''
                            } ${DEPTH_COLORS[index % DEPTH_COLORS.length]} border`}
                            data-testid={`active-dimension-${dim}`}
                          >
                            <GripVertical className="w-3 h-3 text-muted-foreground" />
                            <span>{DIMENSION_CONFIGS[dim].label}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeDimension(dim);
                              }}
                              className="ml-1 hover:text-destructive"
                              data-testid={`remove-dimension-${dim}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        {activeDimensions.length === 0 && (
                          <span className="text-sm text-muted-foreground italic">Drag dimensions here to group data</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">AVAILABLE DIMENSIONS (drag to add)</p>
                      <div 
                        className="flex flex-wrap gap-2 min-h-[40px] p-2 border border-dashed border-muted rounded-lg"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDropOnAvailable}
                      >
                        {availableDimensions.map(dim => (
                          <div
                            key={dim}
                            draggable
                            onDragStart={() => handleDragStart(dim)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-muted/50 border border-muted-foreground/20 cursor-grab active:cursor-grabbing hover:bg-muted transition-colors"
                            data-testid={`available-dimension-${dim}`}
                          >
                            <GripVertical className="w-3 h-3 text-muted-foreground" />
                            <span>{DIMENSION_CONFIGS[dim].label}</span>
                          </div>
                        ))}
                        {availableDimensions.length === 0 && (
                          <span className="text-sm text-muted-foreground italic">All dimensions in use</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-none">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Hierarchical View</CardTitle>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="Search products, SKU, brand..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9 w-64"
                          data-testid="input-search-hierarchy"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2"
                            data-testid="button-clear-search"
                          >
                            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                          </button>
                        )}
                      </div>
                      <Button variant="outline" size="sm" onClick={expandAll} data-testid="button-expand-all">
                        Expand All
                      </Button>
                      <Button variant="outline" size="sm" onClick={collapseAll} data-testid="button-collapse-all">
                        Collapse All
                      </Button>
                      <Button 
                        onClick={handleExportToExcel}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                        data-testid="button-export-excel"
                      >
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Export
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {activeDimensions.length === 0 ? (
                    <div className="py-16 text-center text-muted-foreground">
                      <Boxes className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">No grouping dimensions selected</p>
                      <p className="text-sm">Drag dimensions from above to create a hierarchy</p>
                    </div>
                  ) : treeData.length === 0 ? (
                    <div className="py-16 text-center text-muted-foreground">
                      <ShoppingCart className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">No cart data available</p>
                      <p className="text-sm">Add products to your carts to see the hierarchy</p>
                      <Button onClick={handleReturnToShop} className="mt-4">Go to Shop</Button>
                    </div>
                  ) : (
                    <div className="border-t">
                      <div className="flex items-center gap-2 py-2 px-3 bg-muted/50 border-b text-sm font-medium text-muted-foreground">
                        <div className="flex-1">Hierarchy</div>
                        <div className="flex items-center gap-6">
                          <div className="text-right min-w-[60px]">SKUs</div>
                          <div className="text-right min-w-[80px]">Volume</div>
                          <div className="text-right min-w-[100px]">Value</div>
                        </div>
                      </div>
                      {treeData.map(node => renderTreeNode(node))}
                      <div className="flex items-center gap-2 py-3 px-3 bg-primary/5 border-t-2 border-primary/20 font-semibold">
                        <div className="flex-1">GRAND TOTAL</div>
                        <div className="flex items-center gap-6">
                          <div className="text-right min-w-[60px]">{uniqueSkuCount}</div>
                          <div className="text-right min-w-[80px] text-blue-600">{totalVolume.toLocaleString()}</div>
                          <div className="text-right min-w-[100px] text-green-600">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {drafts.length > 0 && (
            <Card className="rounded-none bg-primary/5 border-primary/20 mt-6">
              <CardContent className="py-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Grand Total</h3>
                    <p className="text-sm text-muted-foreground">
                      Across all {filteredDrafts.length} filtered cart{filteredDrafts.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-primary">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="text-sm text-muted-foreground">{totalVolume.toLocaleString()} total items</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
