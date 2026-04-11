import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Grid, List, ShoppingCart, Sparkles, TrendingUp, Star, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { Product } from "@shared/schema";
import type { FilterState } from "@/lib/types";

const getAIBadge = (product: Product) => {
  const totalStock = product.availableSizes.reduce((sum, s) => sum + s.stock, 0);
  const discount = ((parseFloat(product.retailPrice) - parseFloat(product.wholesalePrice)) / parseFloat(product.retailPrice)) * 100;
  
  if (totalStock > 5000) return { text: 'High Demand', icon: TrendingUp, color: 'blue' };
  if (totalStock > 3000) return { text: 'Best Seller', icon: Star, color: 'cyan' };
  if (discount > 25) return { text: 'Price Drop', icon: Zap, color: 'orange' };
  if (totalStock < 100) return { text: 'Trending', icon: Sparkles, color: 'purple' };
  return null;
};

interface ProductGridProps {
  filters: FilterState;
  onOpenSizeColorModal: (product: Product) => void;
  onProductClick?: (productName: string) => void;
  selectedProducts?: string[];
  onToggleSelection?: (productId: string) => void;
}

export function ProductGrid({ filters, onOpenSizeColorModal, onProductClick, selectedProducts = [], onToggleSelection }: ProductGridProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState('best_selling');
  const [hoveredProduct, setHoveredProduct] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  // Helper function to format gender display
  const formatGender = (gender: string): string => {
    switch (gender.toLowerCase()) {
      case 'men': return 'Men';
      case 'women': return 'Women'; 
      case 'kids': return 'Kids';
      case 'unisex': return 'Unisex';
      default: return gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
    }
  };

  // Build query parameters from filters
  const queryParams = new URLSearchParams();
  if (filters.categories.length > 0) queryParams.set('category', filters.categories.join(','));
  if (filters.brands.length > 0) queryParams.set('brand', filters.brands.join(','));
  if (filters.collections.length > 0) queryParams.set('collections', filters.collections.join(','));
  if (filters.minPrice) queryParams.set('minPrice', filters.minPrice.toString());
  if (filters.maxPrice) queryParams.set('maxPrice', filters.maxPrice.toString());
  if (filters.sizes.length > 0) queryParams.set('sizes', filters.sizes.join(','));
  if (filters.search) {
    console.log('🔍 Setting search filter:', filters.search);
    queryParams.set('search', filters.search);
  }
  if (filters.styles && filters.styles.length > 0) queryParams.set('styles', filters.styles.join(','));
  if (filters.ageRanges && filters.ageRanges.length > 0) queryParams.set('ageRanges', filters.ageRanges.join(','));
  if (filters.occasions && filters.occasions.length > 0) queryParams.set('occasions', filters.occasions.join(','));
  if (filters.genders && filters.genders.length > 0) queryParams.set('genders', filters.genders.join(','));
  if (filters.colors && filters.colors.length > 0) queryParams.set('colors', filters.colors.join(','));
  if (filters.supplierLocations && filters.supplierLocations.length > 0) queryParams.set('supplierLocations', filters.supplierLocations.join(','));

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", queryParams.toString()],
  });

  const ColorDot = ({ color, size = 'sm' }: { color: string; size?: 'sm' | 'lg' }) => {
    const colorMap: Record<string, string> = {
      Black: "bg-black",
      White: "bg-white border-gray-300",
      Red: "bg-red-500",
      Blue: "bg-blue-600",
      Brown: "bg-amber-800",
      Pink: "bg-pink-500",
      Green: "bg-green-500",
      Grey: "bg-gray-500",
      Purple: "bg-purple-500",
      Beige: "bg-amber-200",
      Bordeaux: "bg-red-800",
      Coral: "bg-red-400",
      "Light blue": "bg-sky-400",
    };

    const sizeClasses = {
      sm: "w-4 h-4",
      lg: "w-5 h-5"
    };

    return (
      <div
        className={`${sizeClasses[size]} rounded-full border shadow-sm ${
          colorMap[color] || "bg-gray-400"
        } ${color === "White" ? "border-gray-300" : "border-white"}`}
        title={color}
      />
    );
  };

  if (isLoading) {
    return (
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-64" />
          <div className="flex space-x-3">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-semibold tracking-tight">Products</h2>
          <span className="text-sm text-muted-foreground" data-testid="text-product-count">
            {products.length} results
          </span>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* View Options */}
          <div className="flex bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-2 shadow-lg border border-slate-200/20 dark:border-slate-700/20">
            <Button
              data-testid="button-view-grid"
              variant={viewMode === 'grid' ? "default" : "ghost"}
              size="sm"
              className={`px-4 py-2 rounded-xl font-medium transition-all duration-300 ${
                viewMode === 'grid' 
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg border-0' 
                  : 'hover:bg-white/70 dark:hover:bg-slate-700/70 text-slate-600 dark:text-slate-300'
              }`}
              onClick={() => setViewMode('grid')}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              data-testid="button-view-list"
              variant={viewMode === 'list' ? "default" : "ghost"}
              size="sm"
              className={`px-4 py-2 rounded-xl font-medium transition-all duration-300 ${
                viewMode === 'list' 
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg border-0' 
                  : 'hover:bg-white/70 dark:hover:bg-slate-700/70 text-slate-600 dark:text-slate-300'
              }`}
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Sort */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger data-testid="select-sort" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="best_selling">Default</SelectItem>
              <SelectItem value="price_low_high">Price Ascending</SelectItem>
              <SelectItem value="price_high_low">Price Descending</SelectItem>
              <SelectItem value="availability">Availability</SelectItem>
              <SelectItem value="new_arrivals">New arrivals</SelectItem>
              <SelectItem value="name_az">Name A-Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Compact Product Cards - 5-7 per line */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
        {products.map((product) => {
          const isHovered = hoveredProduct === product.id;
          const aiBadge = getAIBadge(product);
          const isSelected = selectedProducts.includes(product.id);
          
          return (
            <div
              key={product.id}
              data-testid={`card-product-${product.id}`}
              className={`group cursor-pointer bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm border-2 rounded-xl shadow-md hover:shadow-lg hover:scale-[1.02] transition-all duration-300 overflow-hidden ${
                isSelected 
                  ? 'border-yellow-400 ring-2 ring-yellow-400' 
                  : 'border-slate-200 dark:border-slate-700'
              }`}
              onMouseEnter={() => setHoveredProduct(product.id)}
              onMouseLeave={() => setHoveredProduct(null)}
              onClick={() => {
                if (onToggleSelection) {
                  onToggleSelection(product.id);
                } else {
                  setLocation(`/product/${product.id}`);
                }
              }}
            >
              {/* Product Image */}
              <div className="relative overflow-hidden">
                <img
                  src={product.image1}
                  alt={product.name}
                  className="w-full h-full object-fill transition-transform duration-300 group-hover:scale-110"
                  data-testid={`img-product-${product.id}`}
                />
                {isSelected && (
                  <div className="absolute top-2 left-2 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-blue-900 text-sm font-bold">✓</span>
                  </div>
                )}
                {aiBadge && (
                  <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-md backdrop-blur-sm shadow-md ${
                    aiBadge.color === 'blue' ? 'bg-blue-500/90 text-white' :
                    aiBadge.color === 'cyan' ? 'bg-cyan-500/90 text-slate-900' :
                    aiBadge.color === 'orange' ? 'bg-red-500/90 text-white' :
                    'bg-purple-500/90 text-white'
                  }`}>
                    <aiBadge.icon className="w-3 h-3" />
                    <span className="text-[10px] font-bold">{aiBadge.text}</span>
                  </div>
                )}
                <div className="absolute top-2 right-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg px-2 py-0.5 shadow-md">
                  <span className="text-xs font-bold text-blue-600 dark:text-cyan-400">${product.wholesalePrice}</span>
                  {parseFloat(product.retailPrice) > parseFloat(product.wholesalePrice) && (
                    <span className="text-[10px] text-slate-500 line-through ml-1">${product.retailPrice}</span>
                  )}
                </div>
                
                {/* Add to Cart Button - appears on hover */}
                {isHovered && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center transition-opacity duration-200">
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenSizeColorModal(product);
                      }}
                      className="bg-yellow-400 hover:bg-yellow-500 text-blue-900 font-bold shadow-lg"
                      data-testid={`button-add-to-cart-${product.id}`}
                    >
                      <ShoppingCart className="w-3 h-3 mr-1" />
                      Add to Cart
                    </Button>
                  </div>
                )}
              </div>

              {/* Product Details */}
              <div className="p-3">
                <div className="mb-2">
                  <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 mb-0.5 line-clamp-1" data-testid={`text-product-name-${product.id}`}>
                    {product.name}
                  </h3>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-medium" data-testid={`text-brand-${product.id}`}>
                      {product.brand}
                    </p>
                    <span className="text-slate-300 text-xs">•</span>
                    <p className="text-xs text-cyan-600 dark:text-cyan-400 font-medium" data-testid={`text-gender-${product.id}`}>
                      {formatGender(product.gender)}
                    </p>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{product.category}</p>
                </div>

                {/* Color Dot - single colourway */}
                {product.colourway && (
                  <div className="flex justify-center gap-1 mt-2">
                    <ColorDot key={product.colourway} color={product.colourway} size="lg" />
                  </div>
                )}

                {/* Size Buttons */}
                <div className="flex flex-wrap justify-center gap-1 mt-2">
                  {product.availableSizes.filter(s => s.stock > 0).slice(0, 6).map(sizeObj => (
                    <button
                      key={sizeObj.size}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenSizeColorModal(product);
                      }}
                      className="px-2 py-1 text-xs font-medium border border-slate-300 dark:border-slate-600 rounded hover:border-black dark:hover:border-white hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      data-testid={`button-size-${product.id}-${sizeObj.size}`}
                    >
                      {sizeObj.size}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {products.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No products found</h3>
          <p className="text-muted-foreground">Try adjusting your filters or search terms</p>
        </div>
      )}
    </main>
  );
}