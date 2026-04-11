import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Package, ArrowUp, X, Upload, GripVertical, ChevronDown, ChevronRight, Lock, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { Brand } from '@shared/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import * as XLSX from 'xlsx';

type ProductGroupingKey = 'brand' | 'category' | 'division' | 'mainCategory' | 'productLine' | 'sku' | 'productName' | 'colourway' | 'gender';

interface ProductDimensionConfig {
  key: ProductGroupingKey;
  label: string;
  getValue: (p: Product) => string;
}

const PRODUCT_DIMENSION_CONFIGS: Record<ProductGroupingKey, ProductDimensionConfig> = {
  brand: { key: 'brand', label: 'BRAND', getValue: (p) => p.brandName || p.brand || 'Unknown' },
  category: { key: 'category', label: 'CATEGORY', getValue: (p) => p.category || 'Unknown' },
  division: { key: 'division', label: 'DIVISION', getValue: (p) => p.division || 'Unknown' },
  mainCategory: { key: 'mainCategory', label: 'MAIN CATEGORY', getValue: (p) => p.mainCategory || 'Unknown' },
  productLine: { key: 'productLine', label: 'MODEL', getValue: (p) => p.productLine || 'Unknown' },
  sku: { key: 'sku', label: 'SKU', getValue: (p) => p.sku || 'Unknown' },
  productName: { key: 'productName', label: 'PRODUCT NAME', getValue: (p) => p.name || 'Unknown' },
  colourway: { key: 'colourway', label: 'COLOR', getValue: (p) => p.colourway || 'Unknown' },
  gender: { key: 'gender', label: 'GENDER', getValue: (p) => p.gender || 'Unknown' },
};

const ALL_PRODUCT_DIMENSIONS: ProductGroupingKey[] = ['brand', 'division', 'category', 'mainCategory', 'productLine', 'colourway', 'gender', 'sku', 'productName'];

interface ProductTreeNode {
  key: string;
  label: string;
  dimension: string;
  productCount: number;
  totalValue: number;
  skuCount: number;
  children: ProductTreeNode[];
  items: Product[];
  depth: number;
}

const PIVOT_DEPTH_COLORS = [
  'bg-blue-50 border-blue-200', 'bg-green-50 border-green-200', 'bg-purple-50 border-purple-200',
  'bg-red-50 border-red-200', 'bg-pink-50 border-pink-200', 'bg-cyan-50 border-cyan-200',
  'bg-yellow-50 border-yellow-200', 'bg-indigo-50 border-indigo-200', 'bg-rose-50 border-rose-200', 'bg-teal-50 border-teal-200',
];

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  brand: string;
  brandName: string;
  gender: string;
  mainCategory?: string;
  kidsGender?: string;
  kidsAgeGroup?: string;
  description?: string;
  wholesalePrice: string;
  retailPrice: string;
  cost?: string;
  imageUrl?: string;
  image1?: string;
  image2?: string;
  image3?: string;
  image4?: string;
  primaryColor?: string;
  colourway?: string;
  isPreOrder?: boolean;
  collections?: string[];
  stock?: number;
  stockLevel?: string;
  division?: string;
  countryOfOrigin?: string;
  minOrder?: number;
  moq?: number;
  limitOrder?: number;
  unitsPerCarton?: number;
  keyCategory?: string;
  ageGroup?: string;
  productLine?: string;
  productType?: string;
  sportsCategory?: string;
  corporateMarketingLine?: string;
  conditions?: string;
  materialComposition?: string;
  discount?: string;
  baseCurrency?: string;
}

type TabFilter = 'all' | 'stock' | 'preorder' | 'catalogue';

export default function AllProductsPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');

  // Edit dialog state
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [imageUploadMode, setImageUploadMode] = useState<'url' | 'upload'>('url');
  const [uploadingImage, setUploadingImage] = useState(false);

  // Pivot view state
  const [viewMode, setViewMode] = useState<'table' | 'pivot'>('table');
  const [activeDimensions, setActiveDimensions] = useState<ProductGroupingKey[]>(['brand', 'category']);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [draggedDimension, setDraggedDimension] = useState<ProductGroupingKey | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [pivotSearchQuery, setPivotSearchQuery] = useState('');

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const el = document.getElementById('main-scroll-container');
    if (!el) return;
    const handleScroll = () => setShowScrollTop(el.scrollTop > 400);
    handleScroll(); // initial check
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ['/api/brands'],
  });

  const { data: countData } = useQuery<{ count: number; stockCount: number; preorderCount: number; catalogueCount: number }>({
    queryKey: ['/api/products/all/count', debouncedSearch, brandFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (brandFilter) params.set('brand', brandFilter);
      const response = await fetch(`/api/products/all/count?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch count');
      return response.json();
    },
  });

  // Derive server-side type param from active tab
  const typeParam = activeTab === 'stock' ? 'stock' : activeTab === 'preorder' ? 'preorder' : activeTab === 'catalogue' ? 'catalogue' : '';

  // Table: infinite scroll only (loads on scroll, no auto-fetch)
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery<Product[]>({
    queryKey: ['allProducts', debouncedSearch, brandFilter, typeParam],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      params.set('limit', '200');
      params.set('offset', String(pageParam));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (brandFilter) params.set('brand', brandFilter);
      if (typeParam) params.set('type', typeParam);
      const response = await fetch(`/api/products/all?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch products');
      return response.json();
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < 200) return undefined;
      return allPages.length * 200;
    },
    initialPageParam: 0,
  });

  const allProducts = data?.pages.flat() ?? [];

  // Client-side division filter (tab filter is now server-side)
  const products = useMemo(() => {
    let filtered = allProducts;

    // Division filter
    if (divisionFilter) {
      filtered = filtered.filter(p => p.division === divisionFilter);
    }

    return filtered;
  }, [allProducts, divisionFilter]);

  // Hierarchical View: separate query that loads ALL products (no tab/brand/division filter - hierarchy shows full catalog)
  const {
    data: pivotData,
    fetchNextPage: pivotFetchNextPage,
    hasNextPage: pivotHasNextPage,
    isFetchingNextPage: pivotIsFetchingNextPage,
    isLoading: pivotIsLoading,
    isError: pivotIsError,
  } = useInfiniteQuery<Product[]>({
    queryKey: ['allProductsPivot', debouncedSearch],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      params.set('limit', '200');
      params.set('offset', String(pageParam));
      if (debouncedSearch) params.set('search', debouncedSearch);
      const response = await fetch(`/api/products/all?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch products');
      return response.json();
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length === 0) return undefined;
      return allPages.length * 200;
    },
    initialPageParam: 0,
    enabled: true,
  });

  const pivotAllProducts = pivotData?.pages.flat() ?? [];
  // Hierarchy always uses full pivot data (no division filter) so all brands appear
  const pivotProductsBase = pivotAllProducts;

  // Pivot: products filtered by search for hierarchy (uses pivot's own data)
  const filteredProductsForPivot = useMemo(() => {
    if (!pivotSearchQuery.trim()) return pivotProductsBase;
    const q = pivotSearchQuery.toLowerCase();
    return pivotProductsBase.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.brandName || p.brand || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.division || '').toLowerCase().includes(q)
    );
  }, [pivotProductsBase, pivotSearchQuery]);

  const buildProductTree = useCallback((items: Product[], dimensions: ProductGroupingKey[], depth = 0, parentKey = ''): ProductTreeNode[] => {
    if (dimensions.length === 0 || items.length === 0) return [];
    const currentDim = dimensions[0];
    const remaining = dimensions.slice(1);
    const config = PRODUCT_DIMENSION_CONFIGS[currentDim];
    const groups: Record<string, Product[]> = {};
    items.forEach(p => {
      const val = config.getValue(p);
      if (!groups[val]) groups[val] = [];
      groups[val].push(p);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, groupItems]) => {
        const nodeKey = parentKey ? `${parentKey}__${currentDim}:${label}` : `${currentDim}:${label}`;
        const totalValue = groupItems.reduce((s, p) => s + (parseFloat(p.wholesalePrice) || 0), 0);
        return {
          key: nodeKey,
          label,
          dimension: config.label,
          productCount: groupItems.length,
          totalValue,
          skuCount: new Set(groupItems.map(p => p.sku)).size,
          children: buildProductTree(groupItems, remaining, depth + 1, nodeKey),
          items: groupItems,
          depth,
        };
      });
  }, []);

  const productTreeData = useMemo(() => buildProductTree(filteredProductsForPivot, activeDimensions), [filteredProductsForPivot, activeDimensions, buildProductTree]);

  const togglePivotNode = (nodeKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeKey)) next.delete(nodeKey);
      else next.add(nodeKey);
      return next;
    });
  };

  const expandAllPivot = () => {
    const keys = new Set<string>();
    const collect = (nodes: ProductTreeNode[]) => {
      nodes.forEach(n => {
        if (n.children.length > 0) { keys.add(n.key); collect(n.children); }
      });
    };
    collect(productTreeData);
    setExpandedNodes(keys);
  };

  const collapseAllPivot = () => setExpandedNodes(new Set());

  const handlePivotDragStart = (dim: ProductGroupingKey) => setDraggedDimension(dim);
  const handlePivotDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIndex(idx); };
  const handlePivotDragLeave = () => setDragOverIndex(null);
  const handlePivotDropOnActive = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (!draggedDimension) return;
    const srcIdx = activeDimensions.indexOf(draggedDimension);
    if (srcIdx === -1) {
      const next = [...activeDimensions];
      next.splice(targetIdx, 0, draggedDimension);
      setActiveDimensions(next);
    } else if (srcIdx !== targetIdx) {
      const next = [...activeDimensions];
      next.splice(srcIdx, 1);
      next.splice(targetIdx > srcIdx ? targetIdx - 1 : targetIdx, 0, draggedDimension);
      setActiveDimensions(next);
    }
    setDraggedDimension(null);
    setDragOverIndex(null);
    setExpandedNodes(new Set());
  };
  const handlePivotDropOnAvailable = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedDimension && activeDimensions.includes(draggedDimension)) {
      setActiveDimensions(activeDimensions.filter(d => d !== draggedDimension));
    }
    setDraggedDimension(null);
    setDragOverIndex(null);
  };
  const removePivotDimension = (dim: ProductGroupingKey) => {
    setActiveDimensions(activeDimensions.filter(d => d !== dim));
    setExpandedNodes(new Set());
  };

  const availableDimensions = ALL_PRODUCT_DIMENSIONS.filter(d => !activeDimensions.includes(d));

  const handleExportProductsExcel = () => {
    const rows: any[] = [];
    const flatten = (node: ProductTreeNode, path: string[] = []) => {
      const p = [...path, `${node.dimension}: ${node.label}`];
      rows.push({ 'Hierarchy Path': p.join(' > '), Level: node.depth + 1, Dimension: node.dimension, Value: node.label, 'SKU Count': node.skuCount, 'Product Count': node.productCount, 'Total Value': node.totalValue });
      if (node.children.length > 0) node.children.forEach(c => flatten(c, p));
      else node.items.forEach(prod => rows.push({ 'Hierarchy Path': p.join(' > '), Level: node.depth + 2, Dimension: 'PRODUCT', Value: prod.name, SKU: prod.sku, Brand: prod.brandName, Category: prod.category, Division: prod.division, Price: prod.wholesalePrice }));
    };
    productTreeData.forEach(n => flatten(n));
    rows.push({ 'Hierarchy Path': 'GRAND TOTAL', Level: 0, Dimension: 'TOTAL', Value: 'All Products', 'SKU Count': new Set(filteredProductsForPivot.map(p => p.sku)).size, 'Product Count': filteredProductsForPivot.length, 'Total Value': filteredProductsForPivot.reduce((s, p) => s + (parseFloat(p.wholesalePrice) || 0), 0) });
    if (rows.length === 0) {
      toast({ title: 'No data to export', description: 'No products in pivot view.', variant: 'destructive' });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Product Hierarchy');
    XLSX.writeFile(wb, `product_hierarchy_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Export successful', description: `Exported ${rows.length} rows.` });
  };

  const totalPivotValue = filteredProductsForPivot.reduce((s, p) => s + (parseFloat(p.wholesalePrice) || 0), 0);
  const totalPivotSkus = new Set(filteredProductsForPivot.map(p => p.sku)).size;

  const renderProductTreeNode = (node: ProductTreeNode) => {
    const isExp = expandedNodes.has(node.key);
    const hasCh = node.children.length > 0;
    const depthCl = PIVOT_DEPTH_COLORS[node.depth % PIVOT_DEPTH_COLORS.length];
    return (
      <div key={node.key}>
        <div className={`flex items-center gap-2 py-1 px-2 border-b hover:bg-muted/50 transition-colors leading-tight ${isExp && hasCh ? depthCl : ''}`} style={{ paddingLeft: `${node.depth * 20 + 10}px` }}>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {hasCh ? (
              <button className="p-0.5 hover:bg-muted rounded cursor-pointer shrink-0" onClick={(e) => togglePivotNode(node.key, e)}>
                {isExp ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
            ) : <div className="w-4 shrink-0" />}
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">{node.dimension}:</span>
            <span className="font-medium text-xs truncate">{node.label}</span>
          </div>
          <div className="flex items-center gap-4 text-xs shrink-0">
            <div className="text-right min-w-[52px]"><span className="text-muted-foreground text-[10px]">SKUs: </span><span className="font-medium">{node.skuCount}</span></div>
            <div className="text-right min-w-[72px]"><span className="text-muted-foreground text-[10px]">Count: </span><span className="font-semibold text-blue-600">{node.productCount.toLocaleString()}</span></div>
            <div className="text-right min-w-[88px]"><span className="text-muted-foreground text-[10px]">Value: </span><span className="font-semibold text-green-600">${node.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
          </div>
        </div>
        {isExp && hasCh && <div>{node.children.map(c => renderProductTreeNode(c))}</div>}
      </div>
    );
  };

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [target] = entries;
      if (target.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  );

  // Table: IntersectionObserver for scroll-to-load (only when in table view)
  useEffect(() => {
    if (viewMode !== 'table') return;
    const element = loadMoreRef.current;
    const scrollRoot = document.getElementById('main-scroll-container');
    if (!element || !scrollRoot) return;
    observerRef.current = new IntersectionObserver(handleObserver, {
      root: scrollRoot,
      rootMargin: '400px',
      threshold: 0,
    });
    observerRef.current.observe(element);
    return () => { observerRef.current?.disconnect(); };
  }, [handleObserver, viewMode]);

  // Hierarchical View: auto-fetch ALL pages (runs in background so hierarchy has full data)
  useEffect(() => {
    if (!pivotHasNextPage || pivotIsFetchingNextPage) return;
    const id = setTimeout(() => pivotFetchNextPage(), 0);
    return () => clearTimeout(id);
  }, [pivotHasNextPage, pivotIsFetchingNextPage, pivotFetchNextPage]);

  // Update product mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest(`/api/products/${id}`, 'PATCH', data);
      return res;
    },
    onSuccess: () => {
      toast({ title: 'Product updated', description: 'Changes saved successfully.' });
      queryClient.invalidateQueries({ queryKey: ['allProducts'] });
      queryClient.invalidateQueries({ queryKey: ['allProductsPivot'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products/all/count'] });
      setEditProduct(null);
    },
    onError: (err: any) => {
      toast({ title: 'Update failed', description: err.message || 'Something went wrong.', variant: 'destructive' });
    },
  });

  const openEdit = (product: Product) => {
    setEditProduct(product);
    setEditForm({
      name: product.name || '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      category: product.category || '',
      description: product.description || '',
      wholesalePrice: product.wholesalePrice || '',
      retailPrice: product.retailPrice || '',
      cost: product.cost || '',
      gender: product.gender || '',
      mainCategory: product.mainCategory || '',
      kidsGender: product.kidsGender || '',
      kidsAgeGroup: product.kidsAgeGroup || '',
      division: product.division || '',
      countryOfOrigin: product.countryOfOrigin || '',
      colourway: product.colourway || '',
      primaryColor: product.primaryColor || '',
      image1: product.image1 || '',
      image2: product.image2 || '',
      image3: product.image3 || '',
      image4: product.image4 || '',
      stock: product.stock ?? 0,
      minOrder: product.minOrder ?? 1,
      moq: product.moq || '',
      limitOrder: product.limitOrder || '',
      unitsPerCarton: product.unitsPerCarton || '',
      discount: product.discount || '0',
      baseCurrency: product.baseCurrency || 'USD',
      keyCategory: product.keyCategory || '',
      ageGroup: product.ageGroup || '',
      productLine: product.productLine || '',
      productType: product.productType || '',
      sportsCategory: product.sportsCategory || '',
      conditions: product.conditions || '',
      materialComposition: product.materialComposition || '',
    });
    setImageUploadMode('url');
  };

  const handleSaveEdit = () => {
    if (!editProduct) return;
    // Build payload with only changed fields
    const payload: Record<string, any> = {};
    const fieldsToPatch = [
      'name', 'sku', 'barcode', 'category', 'description',
      'wholesalePrice', 'retailPrice', 'cost', 'gender',
      'mainCategory', 'kidsGender', 'kidsAgeGroup', 'division',
      'countryOfOrigin', 'colourway', 'primaryColor',
      'image1', 'image2', 'image3', 'image4',
      'minOrder', 'moq', 'limitOrder', 'unitsPerCarton',
      'discount', 'baseCurrency', 'keyCategory', 'ageGroup',
      'productLine', 'productType', 'sportsCategory',
      'conditions', 'materialComposition',
    ];
    for (const field of fieldsToPatch) {
      const newVal = editForm[field];
      const oldVal = (editProduct as any)[field];
      // Normalize both to string for comparison
      const nNew = newVal === '' || newVal === null || newVal === undefined ? '' : String(newVal);
      const nOld = oldVal === '' || oldVal === null || oldVal === undefined ? '' : String(oldVal);
      if (nNew !== nOld) {
        payload[field] = newVal === '' ? null : newVal;
      }
    }
    // Handle numeric fields
    for (const numField of ['minOrder', 'moq', 'limitOrder', 'unitsPerCarton', 'stock']) {
      if (numField in payload) {
        payload[numField] = payload[numField] ? parseInt(payload[numField], 10) : null;
      }
    }

    if (Object.keys(payload).length === 0) {
      toast({ title: 'No changes', description: 'Nothing was modified.' });
      return;
    }
    updateMutation.mutate({ id: editProduct.id, data: payload });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, imageField: string) => {
    const file = e.target.files?.[0];
    if (!file || !editProduct) return;
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const response = await fetch(`/api/products/${editProduct.id}/photo`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Upload failed');
      const result = await response.json();
      setEditForm((prev: Record<string, any>) => ({ ...prev, [imageField]: result.photoUrl }));
      toast({ title: 'Image uploaded', description: 'Image uploaded successfully.' });
    } catch (err) {
      toast({ title: 'Upload failed', description: 'Failed to upload image.', variant: 'destructive' });
    } finally {
      setUploadingImage(false);
    }
  };

  const getTypeBadge = (product: Product) => {
    // Catalogue = products with no collections (uploaded via Catalogue, not yet assigned)
    const hasNoCollections = !product.collections || product.collections.length === 0;
    if (hasNoCollections) return <Badge className="bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-50 text-[10px] px-1.5 py-0">Catalogue</Badge>;
    if (product.isPreOrder) return <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50 text-[10px] px-1.5 py-0">Pre-Order</Badge>;
    return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-[10px] px-1.5 py-0">Stock</Badge>;
  };

  // Use server-side counts for accurate tab numbers (not dependent on scroll/loaded pages)
  const tabCounts = useMemo(() => ({
    all: countData?.count ?? 0,
    stock: countData?.stockCount ?? 0,
    preorder: countData?.preorderCount ?? 0,
    catalogue: countData?.catalogueCount ?? 0,
  }), [countData]);

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-[1400px] mx-auto px-6 py-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">All Products</h1>
          <p className="text-sm text-gray-500 mt-1">
            Central product registry — {countData?.count?.toLocaleString() ?? '...'} total products
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <div className="flex items-center px-6">
              {([
                { key: 'all', label: 'All Products' },
                { key: 'stock', label: 'Stock' },
                { key: 'preorder', label: 'Pre-Order' },
                { key: 'catalogue', label: 'Catalogue' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative px-4 py-3.5 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                  <span className="ml-1.5 text-xs text-gray-400">({tabCounts[tab.key]})</span>
                  {activeTab === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500 rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Filters Row */}
          <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by SKU, name, barcode..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm bg-gray-50 border-gray-200 rounded-lg"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                </button>
                )}
              </div>

            {/* Division filter */}
            <Select value={divisionFilter || '__all__'} onValueChange={(v) => setDivisionFilter(v === '__all__' ? '' : v)}>
              <SelectTrigger className="w-[160px] h-9 text-sm bg-gray-50 border-gray-200 rounded-lg">
                <SelectValue placeholder="Division" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Divisions</SelectItem>
                <SelectItem value="Footwear">Footwear</SelectItem>
                <SelectItem value="Apparel">Apparel</SelectItem>
                <SelectItem value="Accessories">Accessories</SelectItem>
              </SelectContent>
            </Select>

            {/* Brand filter */}
            <Select value={brandFilter || '__all__'} onValueChange={(v) => setBrandFilter(v === '__all__' ? '' : v)}>
              <SelectTrigger className="w-[160px] h-9 text-sm bg-gray-50 border-gray-200 rounded-lg">
                <SelectValue placeholder="Brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Brands</SelectItem>
                {brands.map(b => (
                  <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Active filters count */}
            {(divisionFilter || brandFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setDivisionFilter(''); setBrandFilter(''); }}
                className="text-xs text-gray-500 hover:text-gray-700 h-9"
              >
                Clear filters
                <X className="w-3 h-3 ml-1" />
              </Button>
            )}

            {/* View mode toggle */}
            <div className="flex items-center gap-1 ml-auto border-l pl-4">
              <span className="text-xs text-gray-500 mr-2">View:</span>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === 'table' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Table
              </button>
              <button
                onClick={() => setViewMode('pivot')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === 'pivot' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Hierarchical Pivot
              </button>
            </div>
          </div>

          {/* Table or Pivot View */}
          {viewMode === 'table' ? (
          <>
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
            </div>
          ) : isError ? (
            <div className="text-center py-20 text-red-500 text-sm">Failed to load products.</div>
          ) : products.length === 0 ? (
            <div className="text-center py-20">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 text-sm">No products found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-3 py-1.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide leading-none">Product name</th>
                    <th className="text-left px-2 py-1.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide leading-none">SKU</th>
                    <th className="text-left px-2 py-1.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide leading-none">Category</th>
                    <th className="text-left px-2 py-1.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide leading-none">Division</th>
                    <th className="text-left px-2 py-1.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide leading-none">Brand</th>
                    <th className="text-left px-2 py-1.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide leading-none">Price</th>
                    <th className="text-left px-2 py-1.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide leading-none">Type</th>
                    <th className="text-right px-3 py-1.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide leading-none whitespace-nowrap min-w-[150px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {products.map((product) => {
                    const imgSrc = product.image1 || product.imageUrl || '';
                    return (
                      <tr key={product.id} className="hover:bg-gray-50/60 transition-colors group text-xs leading-tight">
                        {/* Product name + image */}
                        <td className="px-3 py-1">
                          <div className="flex items-center gap-2">
                            {imgSrc ? (
                              <img
                                src={imgSrc}
                                alt={product.name}
                                className="w-7 h-7 rounded-md object-cover bg-gray-100 border border-gray-100 shrink-0"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                                <Package className="w-3.5 h-3.5 text-gray-400" />
        </div>
      )}
                            <span className="font-medium text-gray-900 truncate max-w-[220px]" title={product.name}>
                              {product.name}
                            </span>
                          </div>
                        </td>

                        {/* SKU */}
                        <td className="px-2 py-1">
                          <span className="text-gray-600 font-mono tabular-nums">{product.sku}</span>
                        </td>

                        {/* Category - from Excel Category column (e.g. Running, Lifestyle) */}
                        <td className="px-2 py-1">
                          <span className="text-gray-600">{product.category || '-'}</span>
                        </td>

                        {/* Division - from upload Division column only (Footwear, Apparel, Accessories) */}
                        <td className="px-2 py-1">
                          <span className="text-gray-600">{product.division || '-'}</span>
                        </td>

                        {/* Brand */}
                        <td className="px-2 py-1">
                          <span className="text-gray-700">{product.brandName}</span>
                        </td>

                        {/* Price */}
                        <td className="px-2 py-1">
                          <span className="font-medium text-gray-900 tabular-nums">${product.wholesalePrice}</span>
                        </td>

                        {/* Type */}
                        <td className="px-2 py-1">
                          {getTypeBadge(product)}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-1 text-right align-middle whitespace-nowrap min-w-[150px]">
                          <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end sm:gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2.5 text-[11px] font-medium text-gray-700 border-gray-200 hover:text-blue-700 hover:bg-blue-50 hover:border-blue-200"
                              onClick={() => window.open(`/product/${product.id}`, '_blank')}
                            >
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2.5 text-[11px] font-medium text-gray-700 border-gray-200 hover:text-red-700 hover:bg-red-50 hover:border-red-200"
                              onClick={() => openEdit(product)}
                            >
                              Edit
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
        </div>
      )}

          {/* Load more sentinel */}
          <div ref={loadMoreRef} className="py-4 flex justify-center">
            {isFetchingNextPage && <Loader2 className="w-5 h-5 animate-spin text-gray-400" />}
            {!hasNextPage && products.length > 0 && (
              <p className="text-xs text-gray-400">Showing all {products.length.toLocaleString()} products</p>
            )}
          </div>
          </>
          ) : (
          /* Hierarchical Pivot View */
          <div className="px-6 py-6">
            <Card className="rounded-none mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <GripVertical className="w-4 h-4" />
                  Pivot Dimensions
                </CardTitle>
                <p className="text-sm text-muted-foreground">Drag and drop dimensions to organize your product hierarchy</p>
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
                      onDrop={(e) => handlePivotDropOnActive(e, activeDimensions.length)}
                    >
                      {activeDimensions.map((dim, idx) => (
                        <div
                          key={dim}
                          draggable
                          onDragStart={() => handlePivotDragStart(dim)}
                          onDragOver={(e) => handlePivotDragOver(e, idx)}
                          onDragLeave={handlePivotDragLeave}
                          onDrop={(e) => handlePivotDropOnActive(e, idx)}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium cursor-grab active:cursor-grabbing transition-all border ${dragOverIndex === idx ? 'ring-2 ring-primary ring-offset-2' : ''} ${PIVOT_DEPTH_COLORS[idx % PIVOT_DEPTH_COLORS.length]}`}
                        >
                          <GripVertical className="w-3 h-3 text-muted-foreground" />
                          <span>{PRODUCT_DIMENSION_CONFIGS[dim].label}</span>
                          <button onClick={(e) => { e.stopPropagation(); removePivotDimension(dim); }} className="ml-1 hover:text-destructive">
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
                      onDrop={handlePivotDropOnAvailable}
                    >
                      {availableDimensions.map(dim => (
                        <div
                          key={dim}
                          draggable
                          onDragStart={() => handlePivotDragStart(dim)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-muted/50 border border-muted-foreground/20 cursor-grab active:cursor-grabbing hover:bg-muted"
                        >
                          <GripVertical className="w-3 h-3 text-muted-foreground" />
                          <span>{PRODUCT_DIMENSION_CONFIGS[dim].label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-none">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">Hierarchical View</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search products, SKU, brand..."
                        value={pivotSearchQuery}
                        onChange={(e) => setPivotSearchQuery(e.target.value)}
                        className="pl-9 w-64 h-9"
                      />
                    </div>
                    <Button variant="outline" size="sm" onClick={expandAllPivot}>Expand All</Button>
                    <Button variant="outline" size="sm" onClick={collapseAllPivot}>Collapse All</Button>
                    <Button onClick={handleExportProductsExcel} size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                      <FileSpreadsheet className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {activeDimensions.length === 0 ? (
                  <div className="py-16 text-center text-muted-foreground">
                    <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No grouping dimensions selected</p>
                    <p className="text-sm">Drag dimensions from above to create a hierarchy</p>
                  </div>
                ) : pivotIsLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                    <Loader2 className="w-10 h-10 animate-spin" />
                    <p className="text-sm font-medium">Loading products for hierarchy...</p>
                  </div>
                ) : pivotIsError ? (
                  <div className="py-16 text-center text-red-500">
                    <p className="text-sm font-medium">Failed to load products for hierarchy.</p>
                  </div>
                ) : productTreeData.length === 0 ? (
                  <div className="py-16 text-center text-muted-foreground">
                    <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No products to display</p>
                    <p className="text-sm">No products match the current filters</p>
                  </div>
                ) : (
                  <div className="border-t max-h-[70vh] overflow-y-auto">
                    <div className="flex items-center gap-2 py-1 px-2 bg-muted/50 border-b text-xs font-medium text-muted-foreground sticky top-0 z-10 bg-muted/95 backdrop-blur-sm leading-none">
                      <div className="flex-1">Hierarchy</div>
                      <div className="flex items-center gap-4">
                        <div className="text-right min-w-[52px]">SKUs</div>
                        <div className="text-right min-w-[72px]">Count</div>
                        <div className="text-right min-w-[88px]">Value</div>
                      </div>
                    </div>
                    {productTreeData.map(node => renderProductTreeNode(node))}
                    <div className="flex items-center gap-2 py-2 px-2 bg-primary/5 border-t-2 border-primary/20 font-semibold text-xs leading-tight">
                      <div className="flex-1">GRAND TOTAL</div>
                      <div className="flex items-center gap-4">
                        <div className="text-right min-w-[60px]">{totalPivotSkus}</div>
                        <div className="text-right min-w-[80px] text-blue-600">{filteredProductsForPivot.length.toLocaleString()}</div>
                        <div className="text-right min-w-[100px] text-green-600">${totalPivotValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground mt-4">
              {pivotHasNextPage ? (
                <span className="flex items-center gap-2">
                  {pivotIsFetchingNextPage && <Loader2 className="w-3 h-3 animate-spin" />}
                  Loading all products for full hierarchy... ({filteredProductsForPivot.length.toLocaleString()} loaded)
                </span>
              ) : (
                `Showing pivot for ${filteredProductsForPivot.length.toLocaleString()} products (all loaded).`
              )}
            </p>
          </div>
          )}
        </div>
      </div>

      {/* Scroll to top */}
      {showScrollTop && (
        <Button
          onClick={() => document.getElementById('main-scroll-container')?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 rounded-full w-11 h-11 shadow-lg bg-red-500 hover:bg-red-600"
          size="icon"
        >
          <ArrowUp className="w-5 h-5" />
        </Button>
      )}

      {/* ==================== EDIT DIALOG ==================== */}
      <Dialog open={!!editProduct} onOpenChange={(open) => { if (!open) setEditProduct(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100 sticky top-0 bg-white z-10">
            <DialogTitle className="text-lg font-semibold">Edit Product</DialogTitle>
            {editProduct && (
              <p className="text-sm text-gray-500 mt-0.5">SKU: {editProduct.sku}</p>
            )}
          </DialogHeader>

          <div className="px-6 py-5 space-y-6">
            {/* Image Section */}
            <div>
              <Label className="text-sm font-semibold text-gray-700 mb-3 block">Product Images</Label>
              <div className="grid grid-cols-4 gap-3 mb-3">
                {(['image1', 'image2', 'image3', 'image4'] as const).map((imgField) => (
                  <div key={imgField} className="space-y-1.5">
                    <p className="text-[10px] font-medium text-gray-500 uppercase">{imgField}</p>
                    <div className="relative aspect-square bg-gray-50 rounded-lg border border-gray-200 overflow-hidden group/img">
                      {editForm[imgField] ? (
                        <img src={editForm[imgField]} alt={imgField} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-6 h-6 text-gray-300" />
                        </div>
                      )}
                      {/* Upload overlay */}
                      <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity cursor-pointer">
                        <Upload className="w-5 h-5 text-white" />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageUpload(e, imgField)}
                          disabled={uploadingImage}
                        />
                      </label>
                    </div>
                    <Input
                      placeholder="Image URL..."
                      value={editForm[imgField] || ''}
                      onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, [imgField]: e.target.value }))}
                      className="h-7 text-[10px] px-2"
                    />
                  </div>
                ))}
              </div>
              {uploadingImage && (
                <div className="flex items-center gap-2 text-xs text-red-600">
                  <Loader2 className="w-3 h-3 animate-spin" /> Uploading image...
                </div>
              )}
            </div>

            {/* Basic Info */}
            <div>
              <Label className="text-sm font-semibold text-gray-700 mb-3 block">Basic Information</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Product Name</Label>
                  <Input value={editForm.name || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, name: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">SKU</Label>
                  <Input value={editForm.sku || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, sku: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Barcode</Label>
                  <Input value={editForm.barcode || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, barcode: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Category</Label>
                  <Input value={editForm.category || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, category: e.target.value }))} placeholder="From Excel Category column (e.g. Running)" className="h-9 text-sm" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs text-gray-500">Description</Label>
                  <Textarea value={editForm.description || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, description: e.target.value }))} className="text-sm min-h-[60px]" />
                </div>
              </div>
            </div>

            {/* Classification */}
            <div>
              <Label className="text-sm font-semibold text-gray-700 mb-3 block">Classification</Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Gender</Label>
                  <Input value={editForm.gender || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, gender: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Main Category</Label>
                  <Input value={editForm.mainCategory || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, mainCategory: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Division</Label>
                  <Select value={editForm.division || '__none__'} onValueChange={(v) => setEditForm((prev: Record<string, any>) => ({ ...prev, division: v === '__none__' ? '' : v }))}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="From upload Division column (Footwear, Apparel, Accessories)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">(No division)</SelectItem>
                      <SelectItem value="Footwear">Footwear</SelectItem>
                      <SelectItem value="Apparel">Apparel</SelectItem>
                      <SelectItem value="Accessories">Accessories</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Kids Gender</Label>
                  <Input value={editForm.kidsGender || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, kidsGender: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Kids Age Group</Label>
                  <Input value={editForm.kidsAgeGroup || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, kidsAgeGroup: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Country of Origin</Label>
                  <Input value={editForm.countryOfOrigin || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, countryOfOrigin: e.target.value }))} className="h-9 text-sm" />
                </div>
              </div>
            </div>

            {/* Appearance */}
            <div>
              <Label className="text-sm font-semibold text-gray-700 mb-3 block">Appearance</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Colourway</Label>
                  <Input value={editForm.colourway || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, colourway: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Primary Color</Label>
                  <Input value={editForm.primaryColor || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, primaryColor: e.target.value }))} className="h-9 text-sm" />
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div>
              <Label className="text-sm font-semibold text-gray-700 mb-3 block">Pricing</Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Wholesale Price</Label>
                  <Input type="number" step="0.01" value={editForm.wholesalePrice || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, wholesalePrice: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Retail Price</Label>
                  <Input type="number" step="0.01" value={editForm.retailPrice || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, retailPrice: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Cost</Label>
                  <Input type="number" step="0.01" value={editForm.cost || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, cost: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Discount (%)</Label>
                  <Input type="number" step="0.01" value={editForm.discount || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, discount: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Base Currency</Label>
                  <Input value={editForm.baseCurrency || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, baseCurrency: e.target.value }))} className="h-9 text-sm" />
                </div>
              </div>
            </div>

            {/* Inventory */}
            <div>
              <Label className="text-sm font-semibold text-gray-700 mb-3 block">Inventory & Ordering</Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Min Order</Label>
                  <Input type="number" value={editForm.minOrder || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, minOrder: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">MOQ</Label>
                  <Input type="number" value={editForm.moq || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, moq: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Limit Order</Label>
                  <Input type="number" value={editForm.limitOrder || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, limitOrder: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Units Per Carton</Label>
                  <Input type="number" value={editForm.unitsPerCarton || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, unitsPerCarton: e.target.value }))} className="h-9 text-sm" />
                </div>
              </div>
            </div>

            {/* Product Details */}
            <div>
              <Label className="text-sm font-semibold text-gray-700 mb-3 block">Product Details</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Key Category</Label>
                  <Input value={editForm.keyCategory || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, keyCategory: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Age Group</Label>
                  <Input value={editForm.ageGroup || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, ageGroup: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Product Line</Label>
                  <Input value={editForm.productLine || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, productLine: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Product Type</Label>
                  <Input value={editForm.productType || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, productType: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Sports Category</Label>
                  <Input value={editForm.sportsCategory || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, sportsCategory: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Material Composition</Label>
                  <Input value={editForm.materialComposition || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, materialComposition: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs text-gray-500">Conditions</Label>
                  <Textarea value={editForm.conditions || ''} onChange={(e) => setEditForm((prev: Record<string, any>) => ({ ...prev, conditions: e.target.value }))} className="text-sm min-h-[50px]" />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 sticky bottom-0 bg-white">
            <Button variant="outline" onClick={() => setEditProduct(null)} className="h-9 px-4 text-sm">
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              className="h-9 px-6 text-sm bg-red-500 hover:bg-red-600 text-white"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
