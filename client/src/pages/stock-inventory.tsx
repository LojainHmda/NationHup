import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Package, Filter, Download, RefreshCw, PackageOpen, Plus, Edit, Trash2, Search, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductSchema } from "@shared/schema";
import { z } from "zod";

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  brand: string;
  category: string;
  gender: string;
  mainCategory?: string | null;
  kidsGender?: string | null;
  kidsAgeGroup?: string | null;
  description?: string | null;
  currentStock: number;
  isPreOrder: boolean;
  limitOrder?: number | null;
  limitOrderLabel?: string | null;
  minOrder?: number;
  moq?: number | null;
  wholesalePrice: number;
  retailPrice: number;
  cost?: number | null;
  discount?: number;
  image1?: string;
  sizes?: unknown;
  collections?: string[];
  inStock?: boolean;
  stockLevel?: string;
  division?: string | null;
  countryOfOrigin?: string | null;
  keyCategory?: string | null;
  colourway?: string | null;
  primaryColor?: string | null;
  ageGroup?: string | null;
  corporateMarketingLine?: string | null;
  productLine?: string | null;
  productType?: string | null;
  sportsCategory?: string | null;
  conditions?: string | null;
  materialComposition?: string | null;
  unitsPerCarton?: number | null;
  baseCurrency?: string;
}

interface PaginatedResponse {
  items: InventoryItem[];
  /** Count of all products in catalog (ignores list filters). */
  allProductsTotal: number;
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasMore: boolean;
  };
}

const productFormSchema = insertProductSchema.extend({
  name: z.string().min(1, "Product name is required"),
  sku: z.string().min(1, "UPC is required"),
  brand: z.string().min(1, "Brand is required"),
  category: z.string().min(1, "Category is required"),
  gender: z.string().min(1, "Gender is required"),
  wholesalePrice: z.string().min(1, "Wholesale price is required"),
  retailPrice: z.string().min(1, "Retail price is required"),
  minOrder: z.string().min(1, "Minimum order is required"),
});

type InventoryMode = "all" | "stock" | "preorder";
type LimitOrderFilter = "all" | "limited";
type StockLevelFilter = "all" | "out_of_stock";

type InvFilterState = {
  inventoryMode: InventoryMode;
  limitOrderFilter: LimitOrderFilter;
  stockLevelFilter: StockLevelFilter;
  selectedBrand: string;
  selectedGender: string;
  selectedSize: string;
  skuSearch: string;
};

const defaultInvFilters: InvFilterState = {
  inventoryMode: "all",
  limitOrderFilter: "all",
  stockLevelFilter: "all",
  selectedBrand: "all-brands",
  selectedGender: "all-genders",
  selectedSize: "all-sizes",
  skuSearch: "",
};

function sizeMatchesRow(sizes: unknown, needle: string): boolean {
  if (needle === "all-sizes") return true;
  if (!Array.isArray(sizes)) return false;
  return sizes.some((s) => {
    if (typeof s === "string") return s === needle;
    if (s && typeof s === "object" && "size" in (s as object))
      return String((s as { size?: string }).size) === needle;
    return false;
  });
}

export default function StockInventoryPage() {
  const { toast } = useToast();
  const [draftFilters, setDraftFilters] = useState<InvFilterState>(() => ({
    ...defaultInvFilters,
  }));
  const [appliedFilters, setAppliedFilters] = useState<InvFilterState>(() => ({
    ...defaultInvFilters,
  }));
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<{id: string, sku: string, color: string, size: string, currentStock: number} | null>(null);
  const loadMoreRef = useRef<HTMLTableRowElement>(null);

  // Build query params from applied filters only (updated when user clicks Search)
  const buildQueryParams = useCallback((page: number, a: InvFilterState) => {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", "100");
    if (a.inventoryMode !== "all") params.set("mode", a.inventoryMode);
    if (a.selectedBrand !== "all-brands") params.set("brand", a.selectedBrand);
    if (a.selectedGender !== "all-genders") params.set("gender", a.selectedGender);
    const q = a.skuSearch.trim();
    if (q) params.set("search", q);
    if (a.limitOrderFilter === "limited") params.set("hasLimitOrder", "true");
    if (a.stockLevelFilter === "out_of_stock") params.set("outOfStockOnly", "true");
    return params.toString();
  }, []);

  // Fetch paginated inventory with infinite query
  const {
    data: inventoryData,
    isLoading: inventoryLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch
  } = useInfiniteQuery<PaginatedResponse>({
    queryKey: [
      "/api/stock/inventory",
      appliedFilters.inventoryMode,
      appliedFilters.limitOrderFilter,
      appliedFilters.stockLevelFilter,
      appliedFilters.selectedBrand,
      appliedFilters.selectedGender,
      appliedFilters.skuSearch,
    ],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await fetch(
        `/api/stock/inventory?${buildQueryParams(pageParam as number, appliedFilters)}`
      );
      if (!response.ok) throw new Error('Failed to fetch inventory');
      return response.json();
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.hasMore) {
        return lastPage.pagination.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  // Flatten all pages into a single array
  const inventory = inventoryData?.pages.flatMap(page => page.items) ?? [];
  const totalItems = inventoryData?.pages[0]?.pagination.totalItems ?? 0;
  const allProductsTotal = inventoryData?.pages[0]?.allProductsTotal ?? 0;

  // Infinite scroll - auto-load when scrolling to bottom
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Fetch categories and brands for filtering
  const { data: categories = [] } = useQuery({
    queryKey: ["/api/categories"],
  });

  const { data: brands = [] } = useQuery({
    queryKey: ["/api/brands"],
  });

  // Delete product mutation
  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/products/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "✓ Product deleted", description: "The product has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete product", variant: "destructive" });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiRequest("/api/products/bulk-delete", "POST", { ids });
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setSelectedItems([]);
      toast({ title: "✓ Products deleted", description: `Removed ${data.count} products.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete products", variant: "destructive" });
    },
  });

  // Client-side size filter (applied with last Search — uses appliedFilters.selectedSize)
  const filteredInventory =
    appliedFilters.selectedSize === "all-sizes"
      ? inventory
      : inventory.filter((item: InventoryItem) =>
          sizeMatchesRow(item.sizes, appliedFilters.selectedSize)
        );

  const handleExport = (data: any[], filename: string) => {
    const csvContent = [
      ['UPC', 'Product', 'Color', 'Size', 'Brand', 'Category', 'Gender', 'Stock', 'Status'].join(','),
      ...data.map(item => [
        item.sku,
        `"${item.name}"`,
        item.color,
        item.size,
        item.brand || '',
        item.category || '',
        item.gender || '',
        item.currentStock,
        item.inStock ? 'In Stock' : 'Out of Stock'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="p-4">
          <div className="mb-3">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PackageOpen className="w-6 h-6 text-blue-600 shrink-0" />
              Inventory Management
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage stock levels and upload inventory data
            </p>
          </div>

          <div className="space-y-3">
              <Card className="p-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">Product Stock Levels</h2>
                    <div className="flex gap-2">
                      {selectedItems.length > 0 && (
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => {
                            if (confirm(`Delete ${selectedItems.length} selected product(s)?`)) {
                              bulkDeleteMutation.mutate(selectedItems);
                            }
                          }}
                          disabled={bulkDeleteMutation.isPending}
                          data-testid="button-bulk-delete"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete ({selectedItems.length})
                        </Button>
                      )}
                      <Dialog open={isAddProductDialogOpen} onOpenChange={setIsAddProductDialogOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="button-add-product">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Product
                          </Button>
                        </DialogTrigger>
                        <AddProductDialog
                          isOpen={isAddProductDialogOpen}
                          onClose={() => setIsAddProductDialogOpen(false)}
                          brands={brands as any[]}
                          categories={categories as any[]}
                        />
                      </Dialog>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          queryClient.invalidateQueries({ queryKey: ["/api/stock/inventory"] });
                          toast({ title: "Refreshed", description: "Inventory data has been refreshed" });
                        }}
                        data-testid="button-refresh-inventory"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleExport(filteredInventory, `inventory_${new Date().getTime()}.csv`)}
                        data-testid="button-export-all"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </Button>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-9 gap-2 p-2.5 bg-muted/30 rounded-md">
                    <div className="space-y-0.5">
                      <Label className="text-[11px] leading-none text-muted-foreground">Search SKU</Label>
                      <Input
                        placeholder="Enter SKU..."
                        value={draftFilters.skuSearch}
                        onChange={(e) =>
                          setDraftFilters((f) => ({ ...f, skuSearch: e.target.value }))
                        }
                        className="h-7 text-xs py-0 px-2"
                        data-testid="input-sku-search"
                      />
                    </div>

                    <div className="space-y-0.5">
                      <Label className="text-[11px] leading-none text-muted-foreground">Stock / Pre-order</Label>
                      <Select
                        value={draftFilters.inventoryMode}
                        onValueChange={(v) =>
                          setDraftFilters((f) => ({
                            ...f,
                            inventoryMode: v as InventoryMode,
                          }))
                        }
                      >
                        <SelectTrigger className="h-7 text-xs py-0" data-testid="select-inventory-mode">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="stock">Stock</SelectItem>
                          <SelectItem value="preorder">Pre-order</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-0.5">
                      <Label className="text-[11px] leading-none text-muted-foreground">
                        Order limit
                      </Label>
                      <Select
                        value={draftFilters.limitOrderFilter}
                        onValueChange={(v) =>
                          setDraftFilters((f) => ({
                            ...f,
                            limitOrderFilter: v as LimitOrderFilter,
                          }))
                        }
                      >
                        <SelectTrigger className="h-7 text-xs py-0" data-testid="select-limit-order-filter">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All products</SelectItem>
                          <SelectItem value="limited">Has limit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-0.5">
                      <Label className="text-[11px] leading-none text-muted-foreground">
                        Stock items
                      </Label>
                      <Select
                        value={draftFilters.stockLevelFilter}
                        onValueChange={(v) =>
                          setDraftFilters((f) => ({
                            ...f,
                            stockLevelFilter: v as StockLevelFilter,
                          }))
                        }
                      >
                        <SelectTrigger className="h-7 text-xs py-0" data-testid="select-stock-level-filter">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All levels</SelectItem>
                          <SelectItem value="out_of_stock">Out of stock</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-0.5">
                      <Label className="text-[11px] leading-none text-muted-foreground">Brand</Label>
                      <Select
                        value={draftFilters.selectedBrand}
                        onValueChange={(v) =>
                          setDraftFilters((f) => ({ ...f, selectedBrand: v }))
                        }
                      >
                        <SelectTrigger className="h-7 text-xs py-0">
                          <SelectValue placeholder="All brands" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all-brands">All brands</SelectItem>
                          {(brands as any[]).map((brand: any) => (
                            <SelectItem key={brand.id} value={brand.name}>
                              {brand.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-0.5">
                      <Label className="text-[11px] leading-none text-muted-foreground">Gender</Label>
                      <Select
                        value={draftFilters.selectedGender}
                        onValueChange={(v) =>
                          setDraftFilters((f) => ({ ...f, selectedGender: v }))
                        }
                      >
                        <SelectTrigger className="h-7 text-xs py-0">
                          <SelectValue placeholder="All genders" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all-genders">All genders</SelectItem>
                          <SelectItem value="men">Men</SelectItem>
                          <SelectItem value="women">Women</SelectItem>
                          <SelectItem value="kids">Kids</SelectItem>
                          <SelectItem value="unisex">Unisex</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-0.5">
                      <Label className="text-[11px] leading-none text-muted-foreground">Size</Label>
                      <Select
                        value={draftFilters.selectedSize}
                        onValueChange={(v) =>
                          setDraftFilters((f) => ({ ...f, selectedSize: v }))
                        }
                      >
                        <SelectTrigger className="h-7 text-xs py-0">
                          <SelectValue placeholder="All sizes" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all-sizes">All sizes</SelectItem>
                          {["6", "7", "8", "9", "10", "11", "12", "13"].map((size) => (
                            <SelectItem key={size} value={size}>
                              {size}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-0.5">
                      <Label className="text-[11px] leading-none text-muted-foreground">Results</Label>
                      <div className="h-7 flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[11px] px-1.5 py-0 font-normal tabular-nums">
                          {totalItems.toLocaleString()} matching
                        </Badge>
                        {totalItems !== allProductsTotal && (
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            ({allProductsTotal.toLocaleString()} in catalog)
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-0.5">
                      <Label className="text-[11px] leading-none text-muted-foreground">Actions</Label>
                      <div className="flex gap-1 flex-wrap">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-xs py-0 px-2"
                          onClick={() => setAppliedFilters({ ...draftFilters })}
                          data-testid="button-inventory-search"
                        >
                          <Search className="h-3 w-3 mr-1" />
                          Search
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-7 text-xs py-0 px-2"
                          onClick={() => {
                            setDraftFilters({ ...defaultInvFilters });
                            setAppliedFilters({ ...defaultInvFilters });
                          }}
                        >
                          <Filter className="h-3 w-3 mr-1" />
                          Clear
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Inventory Table */}
                  {inventoryLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-muted-foreground text-sm">Loading inventory...</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-1 text-xs text-muted-foreground">
                        <span>Showing {filteredInventory.length} of {totalItems} items</span>
                      </div>
                      <ScrollArea className="h-[min(380px,calc(100vh-14rem))] border rounded-md">
                        <div className="min-w-max">
                        <Table className="[&_th]:h-7 [&_th]:!px-2 [&_th]:!py-1 [&_th]:text-[11px] [&_td]:!p-1.5 [&_td]:!py-1.5 [&_td]:text-xs">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[50px]">
                                <Checkbox
                                  checked={selectedItems.length === filteredInventory.length && filteredInventory.length > 0}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedItems(filteredInventory.map((item: InventoryItem) => item.id));
                                    } else {
                                      setSelectedItems([]);
                                    }
                                  }}
                                />
                              </TableHead>
                              <TableHead>Product</TableHead>
                              <TableHead>UPC</TableHead>
                              <TableHead>Brand</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Gender</TableHead>
                              <TableHead>Main Cat.</TableHead>
                              <TableHead>Division</TableHead>
                              <TableHead>Colourway</TableHead>
                              <TableHead>Primary Color</TableHead>
                              <TableHead>Stock</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Limited order</TableHead>
                              <TableHead>MOQ</TableHead>
                              <TableHead>Wholesale</TableHead>
                              <TableHead>Retail</TableHead>
                              <TableHead>Cost</TableHead>
                              <TableHead>Discount</TableHead>
                              <TableHead>Currency</TableHead>
                              <TableHead>Country</TableHead>
                              <TableHead>Collections</TableHead>
                              <TableHead>Pre-Order</TableHead>
                              <TableHead>Material</TableHead>
                              <TableHead>Carton Qty</TableHead>
                              <TableHead className="w-[100px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredInventory.length === 0 && !inventoryLoading && (
                              <TableRow>
                                <TableCell colSpan={25} className="text-center py-8">
                                  <span className="text-muted-foreground text-sm">No products match your filters</span>
                                </TableCell>
                              </TableRow>
                            )}
                            {filteredInventory.map((item: InventoryItem) => (
                              <TableRow key={item.id} data-testid={`row-inventory-${item.id}`}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedItems.includes(item.id)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setSelectedItems([...selectedItems, item.id]);
                                      } else {
                                        setSelectedItems(selectedItems.filter(id => id !== item.id));
                                      }
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="font-medium max-w-[200px]">
                                  <span className="font-semibold line-clamp-1" title={item.name}>
                                    {item.name}
                                  </span>
                                </TableCell>
                                <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                                <TableCell>{item.brand || 'Unknown'}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">
                                    {item.category || 'Unknown'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="text-xs">
                                    {item.gender || 'Unknown'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs">{item.mainCategory || "-"}</TableCell>
                                <TableCell className="text-xs">{item.division || "-"}</TableCell>
                                <TableCell className="text-xs">{item.colourway || "-"}</TableCell>
                                <TableCell className="text-xs">{item.primaryColor || "-"}</TableCell>
                                <TableCell>
                                  {item.isPreOrder ? (
                                    <span className="text-muted-foreground">-</span>
                                  ) : (
                                    <span
                                      className={`font-semibold ${
                                        item.currentStock > 0 ? "text-green-600" : "text-red-600"
                                      }`}
                                    >
                                      {item.currentStock}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {item.isPreOrder ? (
                                    <Badge variant="default" className="bg-blue-500">Pre-Order</Badge>
                                  ) : item.currentStock > 0 ? (
                                    <Badge variant="default" className="bg-green-500">In Stock</Badge>
                                  ) : (
                                    <Badge variant="destructive">Out of Stock</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-muted-foreground tabular-nums">
                                  {item.limitOrderLabel ?? "-"}
                                </TableCell>
                                <TableCell className="tabular-nums">{item.moq ?? "-"}</TableCell>
                                <TableCell className="tabular-nums">{item.wholesalePrice.toFixed(2)}</TableCell>
                                <TableCell className="tabular-nums">{item.retailPrice.toFixed(2)}</TableCell>
                                <TableCell className="tabular-nums">{item.cost != null ? item.cost.toFixed(2) : "-"}</TableCell>
                                <TableCell className="tabular-nums">{item.discount ? `${item.discount}%` : "-"}</TableCell>
                                <TableCell className="text-xs">{item.baseCurrency || "USD"}</TableCell>
                                <TableCell className="text-xs">{item.countryOfOrigin || "-"}</TableCell>
                                <TableCell className="text-xs max-w-[120px]">
                                  <span className="line-clamp-1" title={item.collections?.join(", ") || "-"}>
                                    {item.collections?.length ? item.collections.join(", ") : "-"}
                                  </span>
                                </TableCell>
                                <TableCell>{item.isPreOrder ? "Yes" : "No"}</TableCell>
                                <TableCell className="text-xs max-w-[120px]">
                                  <span className="line-clamp-1" title={item.materialComposition || "-"}>
                                    {item.materialComposition || "-"}
                                  </span>
                                </TableCell>
                                <TableCell className="tabular-nums">{item.unitsPerCarton ?? "-"}</TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      onClick={() => setEditingStock({
                                        id: item.id,
                                        sku: item.sku,
                                        color: '',
                                        size: '',
                                        currentStock: item.currentStock || 0
                                      })}
                                      data-testid={`button-edit-stock-${item.id}`}
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      onClick={() => {
                                        if (confirm(`Delete ${item.name}?`)) {
                                          deleteProductMutation.mutate(item.id);
                                        }
                                      }}
                                      disabled={deleteProductMutation.isPending}
                                      data-testid={`button-delete-${item.id}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                            {/* Infinite scroll trigger row */}
                            {hasNextPage && (
                              <TableRow ref={loadMoreRef}>
                                <TableCell colSpan={25} className="text-center py-2">
                                  {isFetchingNextPage ? (
                                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      <span>Loading more items...</span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">Scroll to load more</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            )}
                            {!hasNextPage && filteredInventory.length > 0 && (
                              <TableRow>
                                <TableCell colSpan={25} className="text-center py-2 text-muted-foreground text-xs">
                                  All {totalItems} items loaded
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                        </div>
                        <ScrollBar orientation="horizontal" />
                      </ScrollArea>
                    </>
                  )}
                </div>
              </Card>
          </div>
        </div>

      {/* Stock Update Dialog */}
      {editingStock && (
        <UpdateStockDialog
          item={editingStock}
          onClose={() => setEditingStock(null)}
        />
      )}
    </>
  );
}

interface AddProductDialogProps {
  isOpen: boolean;
  onClose: () => void;
  brands: any[];
  categories: any[];
}

function AddProductDialog({ isOpen, onClose, brands, categories }: AddProductDialogProps) {
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof productFormSchema>>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: '',
      sku: '',
      barcode: '',
      brand: '',
      category: '',
      gender: 'unisex',
      wholesalePrice: '',
      retailPrice: '',
      imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400',
      description: '',
      colors: [],
      availableSizes: [],
      inStock: true,
      stockLevel: 'in_stock',
      minOrder: '1',
      countryOfOrigin: '',
      division: ''
    }
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/products', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "✓ Product created",
        description: "The product has been added successfully.",
      });
      form.reset();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create product",
        description: error.message || "Failed to create product",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = (values: z.infer<typeof productFormSchema>) => {
    // Convert string fields to appropriate types
    const productData = {
      ...values,
      minOrder: parseInt(values.minOrder),
      wholesalePrice: values.wholesalePrice.toString(),
      retailPrice: values.retailPrice.toString(),
    };
    createProductMutation.mutate(productData);
  };

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Add New Product</DialogTitle>
        <DialogDescription>
          Enter product details based on your Excel schema
        </DialogDescription>
      </DialogHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* UPC */}
            <FormField
              control={form.control}
              name="sku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>UPC (Article Number) *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., 104889-01" data-testid="input-sku" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Barcode */}
            <FormField
              control={form.control}
              name="barcode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Barcode</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ''} placeholder="e.g., 4059506474293" data-testid="input-barcode" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Product Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Product Name (Article Name) *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., Nike Air Max 90" data-testid="input-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Brand */}
            <FormField
              control={form.control}
              name="brand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-brand">
                        <SelectValue placeholder="Select brand" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {brands.map((brand: any) => (
                        <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category (Division) *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((cat: any) => (
                        <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Division (RBU) */}
            <FormField
              control={form.control}
              name="division"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Division (RBU)</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ''} placeholder="e.g., Teamsport, Running" data-testid="input-division" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Gender */}
            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-gender">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="men">Men</SelectItem>
                      <SelectItem value="women">Women</SelectItem>
                      <SelectItem value="kids">Kids</SelectItem>
                      <SelectItem value="unisex">Unisex</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Wholesale Price */}
            <FormField
              control={form.control}
              name="wholesalePrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Wholesale Price *</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" step="0.01" placeholder="0.00" data-testid="input-wholesale-price" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Retail Price */}
            <FormField
              control={form.control}
              name="retailPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Retail Price *</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" step="0.01" placeholder="0.00" data-testid="input-retail-price" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Minimum Order */}
            <FormField
              control={form.control}
              name="minOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum Order *</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" placeholder="1" data-testid="input-min-order" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Country of Origin */}
            <FormField
              control={form.control}
              name="countryOfOrigin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country of Origin (COO)</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ''} placeholder="e.g., KH, CN, VN" data-testid="input-coo" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Image URL */}
            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Image URL</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="https://..." data-testid="input-image-url" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ''} placeholder="Product description" data-testid="input-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
              Cancel
            </Button>
            <Button type="submit" disabled={createProductMutation.isPending} data-testid="button-submit">
              {createProductMutation.isPending ? "Creating..." : "Create Product"}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

interface UpdateStockDialogProps {
  item: {
    id: string;
    sku: string;
    color: string;
    size: string;
    currentStock: number;
  };
  onClose: () => void;
}

function UpdateStockDialog({ item, onClose }: UpdateStockDialogProps) {
  const { toast } = useToast();
  const [newStock, setNewStock] = useState(item.currentStock.toString());
  
  const updateStockMutation = useMutation({
    mutationFn: async (stockData: { productId: string; sku: string; color: string; size: string; newStock: number }) => {
      return await apiRequest('/api/stock/adjustments', 'POST', {
        productId: stockData.productId,
        sku: stockData.sku,
        color: stockData.color,
        size: stockData.size,
        previousStock: item.currentStock,
        newStock: stockData.newStock,
        adjustmentType: 'manual',
        reason: 'Manual stock adjustment'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock/inventory"] });
      toast({
        title: "✓ Stock updated",
        description: "Stock level has been updated successfully.",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update stock",
        description: error.message || "Failed to update stock level",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = () => {
    const stockNumber = parseInt(newStock);
    if (isNaN(stockNumber) || stockNumber < 0) {
      toast({
        title: "Invalid stock",
        description: "Please enter a valid stock number",
        variant: "destructive",
      });
      return;
    }

    updateStockMutation.mutate({
      productId: item.id,
      sku: item.sku,
      color: item.color,
      size: item.size,
      newStock: stockNumber
    });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Stock Level</DialogTitle>
          <DialogDescription>
            Update the stock quantity for {item.sku} - {item.color} - {item.size}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <Label>Current Stock</Label>
            <div className="text-2xl font-bold text-muted-foreground">{item.currentStock}</div>
          </div>

          <div>
            <Label htmlFor="new-stock">New Stock Level *</Label>
            <Input
              id="new-stock"
              type="number"
              min="0"
              value={newStock}
              onChange={(e) => setNewStock(e.target.value)}
              placeholder="Enter new stock level"
              data-testid="input-new-stock"
            />
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-stock">
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={updateStockMutation.isPending}
              data-testid="button-submit-stock"
            >
              {updateStockMutation.isPending ? "Updating..." : "Update Stock"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
