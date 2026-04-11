import { useState, useRef, useEffect, useMemo } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Product, Brand } from "@shared/schema";
import type { FilterState } from "@/lib/types";

interface SmartFilterProps {
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: any) => void;
  onToggleArrayFilter: (key: 'categories' | 'brands' | 'sizes' | 'colors' | 'models', value: string) => void;
  onRemoveFilter: (key: keyof FilterState, value?: string) => void;
  activeFilters: { key: keyof FilterState; value: string; label: string }[];
}

interface SmartFilterSearchProps {
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: any) => void;
  onToggleArrayFilter: (key: 'categories' | 'brands' | 'sizes' | 'colors' | 'models', value: string) => void;
  productType?: 'preorder' | 'stock' | null;
}

interface FilterSuggestion {
  type: 'brand' | 'category' | 'size' | 'model' | 'color';
  value: string;
  label: string;
  parent?: string;
  count?: number;
  productId?: string;
  product?: Product;
  sku?: string;
}

export function SmartFilter({
  filters,
  onFilterChange,
  onToggleArrayFilter,
  onRemoveFilter,
  activeFilters,
}: SmartFilterProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();

  // Fetch all products to build smart suggestions
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Build suggestions from product data - memoized properly
  const suggestions = useMemo((): FilterSuggestion[] => {
    // Return empty array if no query to prevent unnecessary calculations
    if (!query.trim()) return [];
    
    const suggestionMap = new Map<string, FilterSuggestion>();

    allProducts.forEach(product => {
      // Brand suggestions
      const brandKey = `brand-${product.brand}`;
      if (!suggestionMap.has(brandKey)) {
        suggestionMap.set(brandKey, {
          type: 'brand',
          value: product.brand,
          label: product.brand,
          count: 1,
        });
      } else {
        suggestionMap.get(brandKey)!.count! += 1;
      }

      // Category suggestions
      const categoryKey = `category-${product.category}`;
      if (!suggestionMap.has(categoryKey)) {
        suggestionMap.set(categoryKey, {
          type: 'category',
          value: product.category,
          label: product.category,
          parent: product.brand,
          count: 1,
        });
      } else {
        suggestionMap.get(categoryKey)!.count! += 1;
      }

      // Model suggestions (with product data for navigation)
      const modelKey = `model-${product.id}`;
      if (!suggestionMap.has(modelKey)) {
        suggestionMap.set(modelKey, {
          type: 'model',
          value: product.name,
          label: product.name,
          parent: `${product.brand} > ${product.category}`,
          count: 1,
          productId: product.id,
          product: product,
          sku: product.sku,
        });
      }

      // Color suggestions (using single colourway)
      if (product.colourway) {
        const colorKey = `color-${product.colourway}`;
        if (!suggestionMap.has(colorKey)) {
          suggestionMap.set(colorKey, {
            type: 'color',
            value: product.colourway,
            label: product.colourway,
            count: 1,
          });
        } else {
          suggestionMap.get(colorKey)!.count! += 1;
        }
      }

      // Size suggestions
      product.availableSizes.forEach(({ size }) => {
        const sizeKey = `size-${size}`;
        if (!suggestionMap.has(sizeKey)) {
          suggestionMap.set(sizeKey, {
            type: 'size',
            value: size,
            label: `Size ${size}`,
            count: 1,
          });
        } else {
          suggestionMap.get(sizeKey)!.count! += 1;
        }
      });
    });

    return Array.from(suggestionMap.values())
      .filter(suggestion => 
        suggestion.label.toLowerCase().includes(query.toLowerCase()) ||
        suggestion.parent?.toLowerCase().includes(query.toLowerCase()) ||
        suggestion.sku?.toLowerCase().includes(query.toLowerCase())
      )
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 10);
  }, [allProducts, query]);

  // Build breadcrumb path from active filters
  const filterPath = useMemo(() => {
    const path: string[] = [];
    
    // Add brands first
    if (filters.brands.length > 0) {
      path.push(...filters.brands);
    }
    
    // Add categories
    if (filters.categories.length > 0) {
      path.push(...filters.categories);
    }
    
    // Add models/products
    if (filters.models && filters.models.length > 0) {
      path.push(...filters.models);
    }
    
    // Add colors
    if (filters.colors && filters.colors.length > 0) {
      path.push(`Colors: ${filters.colors.join(', ')}`);
    }
    
    // Add sizes
    if (filters.sizes.length > 0) {
      path.push(`Sizes: ${filters.sizes.join(', ')}`);
    }
    
    if (filters.minPrice || filters.maxPrice) {
      const priceRange = `$${filters.minPrice || 0} - $${filters.maxPrice || '∞'}`;
      path.push(priceRange);
    }

    return path;
  }, [filters]);

  const handleSelectSuggestion = (suggestion: FilterSuggestion) => {
    switch (suggestion.type) {
      case 'brand':
        onToggleArrayFilter('brands', suggestion.value);
        break;
      case 'category':
        onToggleArrayFilter('categories', suggestion.value);
        break;
      case 'size':
        onToggleArrayFilter('sizes', suggestion.value);
        break;
      case 'model':
        if (suggestion.productId && suggestion.product) {
          const url = `/product/${suggestion.productId}`;
          window.history.pushState({ product: suggestion.product }, '', url);
          window.dispatchEvent(new PopStateEvent('popstate', { state: { product: suggestion.product } }));
        }
        break;
      case 'color':
        onToggleArrayFilter('colors', suggestion.value);
        break;
    }
    setQuery("");
    setIsOpen(false);
  };

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'brand': return '🏢';
      case 'category': return '📂';
      case 'size': return '📏';
      case 'model': return '👟';
      case 'color': return '🎨';
      default: return '🔍';
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div>
      {/* Active Filter Tags */}
      {activeFilters.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Active Filters</div>
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((filter, index) => (
              <Badge
                key={`${filter.key}-${filter.value}-${index}`}
                variant="secondary"
                className="inline-flex items-center px-3 py-1 bg-primary/10 text-primary text-xs hover:bg-primary/20 transition-all cursor-pointer"
                data-testid={`filter-tag-${filter.key}-${filter.value}`}
              >
                {filter.label}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-2 h-auto p-0.5 hover:bg-primary/20"
                  onClick={() => onRemoveFilter(filter.key, filter.value)}
                  data-testid={`button-remove-tag-${filter.key}-${filter.value}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SmartFilterSearch({
  filters,
  onFilterChange,
  onToggleArrayFilter,
  productType,
}: SmartFilterSearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);
  const inputFieldRef = useRef<HTMLInputElement>(null);

  // Debounce search query to avoid too many API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Build search URL with proper filters for shop visibility (same as shop listing)
  const searchParams = useMemo(() => {
    if (!debouncedQuery) return null;
    const params = new URLSearchParams();
    params.set('search', debouncedQuery);
    // Apply isPreOrder filter based on shop context (same visibility rules as shop)
    if (productType === 'preorder') {
      params.set('isPreOrder', 'true');
    } else if (productType === 'stock') {
      params.set('isPreOrder', 'false');
    }
    // No limit - uses same pagination/visibility as the rest of the shop system
    return params.toString();
  }, [debouncedQuery, productType]);

  // Server-side search - only fetches when there's a search query
  const { data: searchProducts = [], isLoading: isSearching } = useQuery<Product[]>({
    queryKey: ["/api/products", searchParams],
    queryFn: async () => {
      if (!searchParams) return [];
      const response = await fetch(`/api/products?${searchParams}`);
      if (!response.ok) throw new Error('Search failed');
      return response.json();
    },
    enabled: !!debouncedQuery,
    staleTime: 30000, // Cache for 30 seconds
  });

  const { data: brandsData = [] } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

  // Build suggestions from server-side search results
  const suggestions = useMemo((): FilterSuggestion[] => {
    if (!debouncedQuery || searchProducts.length === 0) return [];
    
    const suggestionMap = new Map<string, FilterSuggestion>();

    searchProducts.forEach(product => {
      const brandKey = `brand-${product.brand}`;
      if (!suggestionMap.has(brandKey)) {
        suggestionMap.set(brandKey, {
          type: 'brand',
          value: product.brand,
          label: product.brand,
          count: 1,
        });
      } else {
        suggestionMap.get(brandKey)!.count! += 1;
      }

      const categoryKey = `category-${product.category}`;
      if (!suggestionMap.has(categoryKey)) {
        suggestionMap.set(categoryKey, {
          type: 'category',
          value: product.category,
          label: product.category,
          parent: product.brand,
          count: 1,
        });
      } else {
        suggestionMap.get(categoryKey)!.count! += 1;
      }

      const modelKey = `model-${product.id}`;
      if (!suggestionMap.has(modelKey)) {
        suggestionMap.set(modelKey, {
          type: 'model',
          value: product.name,
          label: product.name,
          parent: `${product.brand} > ${product.category}`,
          count: 1,
          productId: product.id,
          product: product,
          sku: product.sku,
        });
      }

      if (product.colourway) {
        const colorKey = `color-${product.colourway}`;
        if (!suggestionMap.has(colorKey)) {
          suggestionMap.set(colorKey, {
            type: 'color',
            value: product.colourway,
            label: product.colourway,
            count: 1,
          });
        } else {
          suggestionMap.get(colorKey)!.count! += 1;
        }
      }

      product.availableSizes.forEach(({ size }) => {
        const sizeKey = `size-${size}`;
        if (!suggestionMap.has(sizeKey)) {
          suggestionMap.set(sizeKey, {
            type: 'size',
            value: size,
            label: `Size ${size}`,
            count: 1,
          });
        } else {
          suggestionMap.get(sizeKey)!.count! += 1;
        }
      });
    });

    return Array.from(suggestionMap.values())
      .sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [searchProducts, debouncedQuery]);

  // Get product results from suggestions
  const productResults = useMemo(() => {
    return suggestions
      .filter(s => s.type === 'model' && s.product)
      .map(s => s.product!)
      .slice(0, 10);
  }, [suggestions]);

  // Get brand results from suggestions
  const brandResults = useMemo(() => {
    const brandSuggestions = suggestions.filter(s => s.type === 'brand');
    return brandsData
      .filter(brand => 
        brand.isActive && brandSuggestions.some(s => s.value === brand.name)
      )
      .slice(0, 4);
  }, [suggestions, brandsData]);

  const handleSelectSuggestion = (suggestion: FilterSuggestion) => {
    switch (suggestion.type) {
      case 'brand':
        onToggleArrayFilter('brands', suggestion.value);
        break;
      case 'category':
        onToggleArrayFilter('categories', suggestion.value);
        break;
      case 'size':
        onToggleArrayFilter('sizes', suggestion.value);
        break;
      case 'model':
        if (suggestion.productId && suggestion.product) {
          const url = `/product/${suggestion.productId}`;
          window.history.pushState({ product: suggestion.product }, '', url);
          window.dispatchEvent(new PopStateEvent('popstate', { state: { product: suggestion.product } }));
        }
        break;
      case 'color':
        onToggleArrayFilter('colors', suggestion.value);
        break;
    }
    setQuery("");
    setIsOpen(false);
  };

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'brand': return '🏢';
      case 'category': return '📂';
      case 'size': return '📏';
      case 'model': return '👟';
      case 'color': return '🎨';
      default: return '🔍';
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div 
      className="relative flex-1 max-w-md" 
      ref={inputRef}
    >
      <div className="relative transition-all duration-200 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 focus-within:ring-2 focus-within:ring-[#f97a1f] focus-within:ring-offset-0 focus-within:border-transparent">
        <div className="absolute left-3.5 top-1/2 transform -translate-y-1/2 rounded p-0.5 bg-[#fbf8f7]">
          <Search className="h-4 w-4 pointer-events-none" style={{ color: '#3d3329' }} />
        </div>
        <Input
          ref={inputFieldRef}
          type="text"
          placeholder="Search by brand, SKU, or product name..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && query.trim()) {
              e.preventDefault();
              onFilterChange('search', query.trim());
              setQuery("");
              setIsOpen(false);
            }
            if (e.key === 'Escape') {
              setQuery("");
              setIsOpen(false);
            }
          }}
          className="pl-10 pr-4 py-2.5 text-sm text-left border-0 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-gray-500 dark:placeholder:text-gray-400 dark:text-white bg-[#fbf8f7]"
          data-testid="input-smart-filter"
        />
      </div>
      {isOpen && query && (
        <div className="absolute top-full left-0 z-[100] mt-2 w-screen max-w-5xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl">
          <div className="bg-gray-50 dark:bg-gray-800 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Search term:</span>
              <span className="font-semibold text-gray-900 dark:text-white">{query}</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setQuery("")}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                data-testid="button-clear-search"
              >
                Clear search term
              </button>
              <button
                onClick={() => {
                  setQuery("");
                  setIsOpen(false);
                }}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                data-testid="button-close-search"
              >
                (X) Close
              </button>
            </div>
          </div>

          <div className="px-6 py-4">
            {isSearching ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-white mb-2"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Searching...</p>
              </div>
            ) : brandResults.length === 0 && productResults.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500 dark:text-gray-400">No results found</p>
              </div>
            ) : (
              <>
                {brandResults.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-3">Brands</h4>
                    <div className="grid grid-cols-4 gap-4">
                      {brandResults.map((brand) => (
                        <div
                          key={brand.id}
                          className="group cursor-pointer border border-gray-200 dark:border-gray-700 rounded-lg p-4 transition-all hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                          onClick={() => {
                            onToggleArrayFilter('brands', brand.name);
                            onFilterChange('search', brand.name);
                            setQuery("");
                            setIsOpen(false);
                          }}
                          data-testid={`search-brand-${brand.slug}`}
                        >
                          <div className="bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden mb-3 relative aspect-square flex items-center justify-center">
                            {brand.logoUrl ? (
                              <img
                                src={brand.logoUrl}
                                alt={`${brand.name} logo`}
                                className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform"
                                style={{ filter: 'grayscale(100%) brightness(0)' }}
                              />
                            ) : (
                              <div className="text-gray-400 text-center">{brand.name}</div>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white text-center">
                            {brand.name}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {productResults.length > 0 && (
                  <div>
                    {brandResults.length > 0 && (
                      <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-3">Products</h4>
                    )}
                    <div className="grid grid-cols-5 gap-4 mb-6">
                      {productResults.map((product) => (
                        <div
                          key={product.id}
                          className="group cursor-pointer border border-gray-200 dark:border-gray-700 rounded-lg p-3 transition-all hover:border-gray-300 dark:hover:border-gray-600"
                          onClick={() => {
                            const url = `/product/${product.id}`;
                            window.history.pushState({ product }, '', url);
                            window.dispatchEvent(new PopStateEvent('popstate', { state: { product } }));
                            setQuery("");
                            setIsOpen(false);
                          }}
                          data-testid={`search-product-${product.id}`}
                        >
                          <div className="bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden mb-3 relative aspect-square flex items-center justify-center">
                            {product.image1 ? (
                              <img
                                src={product.image1}
                                alt={product.name}
                                className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform"
                              />
                            ) : (
                              <div className="text-gray-400">No image</div>
                            )}
                          </div>
                          <p className="text-xs text-gray-700 dark:text-gray-300 mb-1 truncate group-hover:text-[#f97a1f] transition-colors">
                            {product.name.length > 30 ? `${product.name.substring(0, 27)}...` : product.name}
                          </p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            €{parseFloat(product.retailPrice).toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    onFilterChange('search', query.trim());
                    setQuery("");
                    setIsOpen(false);
                  }}
                  className="w-full bg-black hover:bg-gray-900 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-black font-semibold py-3 rounded-lg transition-colors"
                  data-testid="button-view-all-results"
                >
                  VIEW ALL RESULTS
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}