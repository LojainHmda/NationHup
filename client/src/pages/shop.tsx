import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query';
import { ShoppingCart, Filter, SlidersHorizontal, X, Package, ArrowUp, Loader2 } from 'lucide-react';
import { useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { ShopProductCard, type ProductGroup } from '@/components/shop/ShopProductCard';
import { FilterSidebar } from '@/components/FilterSidebar';
import { SmartFilter, SmartFilterSearch } from '@/components/SmartFilter';
import { BrandLogoFilter } from '@/components/BrandLogoFilter';
import { useFilters } from '@/hooks/useFilters';
import { useCartContext } from '@/hooks/useCartContext';
import { useProductMode } from '@/hooks/useProductMode';
import { clearPageState, restoreScrollPosition } from '@/hooks/usePageState';
import type { ShopCartProduct } from '@/components/shop/ShopCartTable';
import type { Product, Order } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { SIZE_STANDARDS, type SizeStandard } from '@/lib/filterConstants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function Shop() {
  const [location, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const currentPath = location + (searchString ? `?${searchString}` : '');
  const scrollRestoredRef = useRef(false);
  const [isScrollReady, setIsScrollReady] = useState(() => {
    const pendingScrollData = sessionStorage.getItem('pending_scroll_restore');
    return !pendingScrollData;
  });
  
  const {
    drafts,
    activeDraftId,
    openCartId,
    openCart,
    activeDraft,
    draftsQueryKey,
  } = useCartContext();
  
  const { productMode, setProductMode, permissions, isLoadingPermissions } = useProductMode();
  
  // Sync productMode with URL path (respecting permissions)
  // Only redirect after permissions are fully loaded to prevent authorized users from being redirected
  useEffect(() => {
    if (isLoadingPermissions) {
      return; // Don't redirect while permissions are loading
    }
    
    if (location === '/shop/stock') {
      setProductMode('stock');
    } else if (location === '/shop/pre-order') {
      if (permissions.allowPreOrders) {
        setProductMode('preorder');
      } else {
        // Redirect to stock if pre-order not allowed
        navigate('/shop/stock');
      }
    }
  }, [location, setProductMode, permissions, navigate, isLoadingPermissions]);
  
  const urlParams = useMemo(() => {
    return new URLSearchParams(searchString);
  }, [searchString]);
  
  const brandFilter = urlParams.get('brand');
  
  const productType = productMode === 'all' ? null : productMode;
  
  console.log('[Shop] Current productMode:', productMode, 'productType:', productType);

  const {
    filters,
    updateFilter,
    toggleArrayFilter,
    removeFilter,
    getActiveFilters,
  } = useFilters();

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(() => {
    try {
      const saved = sessionStorage.getItem('shop_filter_panel_open');
      return saved === 'true';
    } catch {
      return false;
    }
  });
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [sizeStandard, setSizeStandard] = useState<SizeStandard>(() => {
    try {
      const saved = sessionStorage.getItem('shop_size_standard');
      if (saved && (saved === 'EU' || saved === 'US' || saved === 'UK')) {
        return saved as SizeStandard;
      }
    } catch {}
    return 'EU';
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('shop_size_standard', sizeStandard);
    } catch {}
  }, [sizeStandard]);

  useEffect(() => {
    try {
      sessionStorage.setItem('shop_filter_panel_open', isFilterPanelOpen ? 'true' : 'false');
    } catch {
      // ignore storage errors
    }
  }, [isFilterPanelOpen]);

  useEffect(() => {
    const handleScroll = () => {
      const container = document.getElementById('main-scroll-container');
      if (container) {
        setShowBackToTop(container.scrollTop > 400);
      } else {
        setShowBackToTop(window.scrollY > 400);
      }
    };

    const container = document.getElementById('main-scroll-container');
    if (container) {
      container.addEventListener('scroll', handleScroll);
    }
    window.addEventListener('scroll', handleScroll);

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    const container = document.getElementById('main-scroll-container');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const PAGE_SIZE = 2000;

  const baseQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.categories && filters.categories.length > 0) params.set('category', filters.categories.join(','));
    if (filters.brands && filters.brands.length > 0) params.set('brand', filters.brands.join(','));
    if (brandFilter) params.set('brand', brandFilter);
    if (filters.collections && filters.collections.length > 0) params.set('collections', filters.collections.join(','));
    if (filters.genders && filters.genders.length > 0) params.set('genders', filters.genders.join(','));
    if (filters.sizes && filters.sizes.length > 0) params.set('sizes', filters.sizes.join(','));
    if (filters.colors && filters.colors.length > 0) params.set('colors', filters.colors.join(','));
    if (filters.search) params.set('search', filters.search);
    if (filters.models && filters.models.length > 0) params.set('models', filters.models.join(','));
    // Additional filters
    if (filters.styles && filters.styles.length > 0) params.set('styles', filters.styles.join(','));
    if (filters.occasions && filters.occasions.length > 0) params.set('occasions', filters.occasions.join(','));
    if (filters.supplierLocations && filters.supplierLocations.length > 0) params.set('supplierLocations', filters.supplierLocations.join(','));
    if (filters.minPrice !== undefined) params.set('minPrice', filters.minPrice.toString());
    if (filters.maxPrice !== undefined) params.set('maxPrice', filters.maxPrice.toString());
    // Three-layer category system filters
    if (filters.mainCategories && filters.mainCategories.length > 0) params.set('mainCategories', filters.mainCategories.join(','));
    if (filters.kidsGenders && filters.kidsGenders.length > 0) params.set('kidsGenders', filters.kidsGenders.join(','));
    if (filters.kidsAgeGroups && filters.kidsAgeGroups.length > 0) params.set('kidsAgeGroups', filters.kidsAgeGroups.join(','));
    // Division filter
    if (filters.divisions && filters.divisions.length > 0) params.set('divisions', filters.divisions.join(','));
    if (productType === 'preorder') params.set('isPreOrder', 'true');
    if (productType === 'stock') params.set('isPreOrder', 'false');
    params.set('limit', PAGE_SIZE.toString());
    return params.toString();
  }, [filters, productType, brandFilter]);

  const {
    data: productsData,
    isLoading: isLoadingProducts,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<Product[]>({
    queryKey: ['products', baseQueryParams, productType],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams(baseQueryParams);
      params.set('offset', String(pageParam));
      console.log('[Shop] Fetching products with params:', params.toString());
      const response = await fetch(`/api/products?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch products');
      return response.json();
    },
    getNextPageParam: (lastPage, allPages) => {
      // If we got less than PAGE_SIZE, there's no more data
      if (lastPage.length < PAGE_SIZE) return undefined;
      // Otherwise, return the next offset
      return allPages.flat().length;
    },
    initialPageParam: 0,
    enabled: productType !== null, // Only fetch when productType is set (preorder or stock)
  });

  // Flatten all pages into a single products array
  const products = useMemo(() => {
    return productsData?.pages.flat() ?? [];
  }, [productsData]);

  // Build query params for count endpoint (same filters as products, without pagination)
  const countQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.categories && filters.categories.length > 0) params.set('category', filters.categories.join(','));
    if (filters.brands && filters.brands.length > 0) params.set('brand', filters.brands.join(','));
    if (brandFilter) params.set('brand', brandFilter);
    if (filters.collections && filters.collections.length > 0) params.set('collections', filters.collections.join(','));
    if (filters.genders && filters.genders.length > 0) params.set('genders', filters.genders.join(','));
    if (filters.sizes && filters.sizes.length > 0) params.set('sizes', filters.sizes.join(','));
    if (filters.colors && filters.colors.length > 0) params.set('colors', filters.colors.join(','));
    if (filters.search) params.set('search', filters.search);
    if (filters.models && filters.models.length > 0) params.set('models', filters.models.join(','));
    if (filters.styles && filters.styles.length > 0) params.set('styles', filters.styles.join(','));
    if (filters.occasions && filters.occasions.length > 0) params.set('occasions', filters.occasions.join(','));
    if (filters.supplierLocations && filters.supplierLocations.length > 0) params.set('supplierLocations', filters.supplierLocations.join(','));
    if (filters.minPrice !== undefined) params.set('minPrice', filters.minPrice.toString());
    if (filters.maxPrice !== undefined) params.set('maxPrice', filters.maxPrice.toString());
    if (filters.mainCategories && filters.mainCategories.length > 0) params.set('mainCategories', filters.mainCategories.join(','));
    if (filters.kidsGenders && filters.kidsGenders.length > 0) params.set('kidsGenders', filters.kidsGenders.join(','));
    if (filters.kidsAgeGroups && filters.kidsAgeGroups.length > 0) params.set('kidsAgeGroups', filters.kidsAgeGroups.join(','));
    if (filters.divisions && filters.divisions.length > 0) params.set('divisions', filters.divisions.join(','));
    if (productType === 'preorder') params.set('isPreOrder', 'true');
    if (productType === 'stock') params.set('isPreOrder', 'false');
    return params.toString();
  }, [filters, productType, brandFilter]);

  // Fetch total product count with all filters applied (SQL COUNT on full dataset)
  const { data: filteredCountData } = useQuery<{ count: number }>({
    queryKey: ['/api/products/count', countQueryParams],
    queryFn: async () => {
      const response = await fetch(`/api/products/count?${countQueryParams}`);
      if (!response.ok) throw new Error('Failed to fetch product count');
      return response.json();
    },
  });

  // Total product count from filtered SQL query
  const totalProductCount = filteredCountData?.count ?? null;

  // Infinite scroll: fetch next page when scrolling near bottom
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          console.log('[Shop] Loading more products, current count:', products.length);
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );
    
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, products.length]);

  useEffect(() => {
    if (!isLoadingProducts && products.length > 0 && !scrollRestoredRef.current) {
      const pendingScrollData = sessionStorage.getItem('pending_scroll_restore');
      if (pendingScrollData) {
        try {
          const { path, scrollX, scrollY } = JSON.parse(pendingScrollData);
          if (path === currentPath || path === location) {
            scrollRestoredRef.current = true;
            sessionStorage.removeItem('pending_scroll_restore');
            
            const tryScroll = (attempts = 0) => {
              if (attempts > 50) {
                clearPageState(path);
                setIsScrollReady(true);
                return;
              }
              
              requestAnimationFrame(() => {
                const container = document.getElementById('main-scroll-container');
                const maxScrollY = container ? container.scrollHeight - container.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
                if (maxScrollY >= scrollY || attempts > 5) {
                  restoreScrollPosition(scrollX, scrollY);
                  clearPageState(path);
                  setIsScrollReady(true);
                } else {
                  setTimeout(() => tryScroll(attempts + 1), 50);
                }
              });
            };
            
            tryScroll();
          } else {
            setIsScrollReady(true);
          }
        } catch (e) {
          sessionStorage.removeItem('pending_scroll_restore');
          setIsScrollReady(true);
        }
      } else {
        setIsScrollReady(true);
      }
    }
  }, [isLoadingProducts, products.length, currentPath, location]);

  useEffect(() => {
    scrollRestoredRef.current = false;
    const pendingScrollData = sessionStorage.getItem('pending_scroll_restore');
    setIsScrollReady(!pendingScrollData);
  }, [currentPath]);

  const productGroups = useMemo((): ProductGroup[] => {
    // Group all products by name (case-insensitive)
    const nameGroupMap = new Map<string, Product[]>();
    
    products.forEach(product => {
      const nameKey = product.name.trim().toLowerCase();
      const existing = nameGroupMap.get(nameKey) || [];
      existing.push(product);
      nameGroupMap.set(nameKey, existing);
    });
    
    // One variant per product (per UPC) - no colourway consolidation
    const result: ProductGroup[] = [];
    
    for (const [nameKey, sameNameProducts] of Array.from(nameGroupMap.entries())) {
      const variants = [...sameNameProducts].sort((a, b) => (a.sku || '').localeCompare(b.sku || ''));
      if (variants.length > 0) {
        result.push({
          name: variants[0].name,
          variants,
        });
      }
    }
    
    return result;
  }, [products]);

  const addItemsToDraftMutation = useMutation({
    mutationFn: async ({ draftId, items }: { draftId: string; items: any[] }) => {
      const res = await apiRequest(`/api/orders/${draftId}/items`, 'POST', { items });
      
      // Handle 409 Conflict (cart type mismatch)
      if (res.status === 409) {
        const errorData = await res.json();
        const error = new Error(errorData.message) as Error & { cartType?: string; productType?: string; productName?: string };
        error.cartType = errorData.cartType;
        error.productType = errorData.productType;
        error.productName = errorData.productName;
        throw error;
      }
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to add items to cart');
      }
      
      return { draftId, updatedOrder: await res.json() as Order };
    },
    onMutate: async ({ draftId, items }) => {
      await queryClient.cancelQueries({ queryKey: draftsQueryKey });
      const previousDrafts = queryClient.getQueryData<Order[]>(draftsQueryKey);
      queryClient.setQueryData<Order[]>(draftsQueryKey, (old) => {
        if (!old) return old;
        return old.map(draft => {
          if (draft.id === draftId) {
            return { ...draft, items: [...(draft.items || []), ...items] };
          }
          return draft;
        });
      });
      setIsCartOpen(true);
      return { previousDrafts };
    },
    onSuccess: ({ draftId, updatedOrder }) => {
      queryClient.setQueryData<Order[]>(draftsQueryKey, (old) => {
        if (!old) return old;
        return old.map(draft => draft.id === draftId ? updatedOrder : draft);
      });
    },
    onError: (err: Error & { cartType?: string; productType?: string; productName?: string }, vars, context) => {
      if (context?.previousDrafts) {
        queryClient.setQueryData(draftsQueryKey, context.previousDrafts);
      }
      
      // Show toast for cart type mismatch
      if (err.cartType && err.productType) {
        const cartTypeLabel = err.cartType === 'pre-order' ? 'Pre-Order' : 'Stock';
        const productTypeLabel = err.productType === 'pre-order' ? 'Pre-Order' : 'Stock';
        toast({
          variant: "destructive",
          title: "Action not allowed",
          description: `This product is ${productTypeLabel} and can't be added to a ${cartTypeLabel} cart. Please switch to a ${productTypeLabel} cart to continue.`,
        });
      } else {
        toast({
          title: 'Unable to Add Product',
          description: err.message || 'There was an error adding this product to your cart. Please try again.',
          variant: 'destructive',
        });
      }
    },
  });

  const removeItemsFromCartMutation = useMutation({
    mutationFn: async ({ draftId, productId }: { draftId: string; productId: string }) => {
      try {
        const response = await apiRequest(`/api/orders/${draftId}/products/${productId}`, 'DELETE');
        return { draftId, updatedOrder: await response.json() as Order };
      } catch (error: any) {
        if (error?.message?.includes('404') || error?.status === 404) {
          return { draftId, alreadyRemoved: true as const };
        }
        throw error;
      }
    },
    onMutate: async ({ draftId, productId }) => {
      await queryClient.cancelQueries({ queryKey: draftsQueryKey });
      const previousDrafts = queryClient.getQueryData<Order[]>(draftsQueryKey);
      queryClient.setQueryData<Order[]>(draftsQueryKey, (old) => {
        if (!old) return old;
        return old.map(draft => {
          if (draft.id === draftId) {
            const filteredItems = draft.items?.filter(item => 
              item.productId !== productId
            ) || [];
            return { ...draft, items: filteredItems };
          }
          return draft;
        });
      });
      return { previousDrafts };
    },
    onSuccess: (result) => {
      if ('updatedOrder' in result && result.updatedOrder) {
        queryClient.setQueryData<Order[]>(draftsQueryKey, (old) => {
          if (!old) return old;
          return old.map(draft => draft.id === result.draftId ? result.updatedOrder : draft);
        });
      }
    },
    onError: (err, vars, context) => {
      if (context?.previousDrafts) {
        queryClient.setQueryData(draftsQueryKey, context.previousDrafts);
      }
      toast({
        title: 'Error',
        description: 'Failed to remove product from cart',
        variant: 'destructive',
      });
    },
  });

  const handleAddToCartFromGroup = useCallback(async (product: Product) => {
    if (!openCartId) {
      toast({
        title: 'Please open a cart first',
        description: 'Click on a cart toggle to open it before adding products.',
      });
      return;
    }
    const existingItems = openCart?.items?.filter(item => item.productId === product.id);
    if (existingItems && existingItems.length > 0) {
      removeItemsFromCartMutation.mutate({ draftId: openCartId, productId: product.id });
      return;
    }
    
    // Check if product has available sizes
    const hasSizes = product.availableSizes && product.availableSizes.length > 0;
    
    // Check if this is a carton product
    const isCarton = product.unitsPerCarton && product.unitsPerCarton > 0;
    const unitPrice = parseFloat(product.wholesalePrice);
    
    let newItems;
    if (!hasSizes) {
      // Product has no sizes - add as "One Size" with quantity 0
      newItems = [{
        productId: product.id,
        productName: product.name,
        sku: product.sku || '',
        brand: product.brand || '',
        size: 'One Size',
        quantity: 0,
        unitPrice,
        totalPrice: 0,
      }];
    } else if (isCarton) {
      // For carton products, use stock as quantity (or 1 if no stock)
      // Filter out sizes with no stock first, then fall back to all sizes with qty 1
      const sizesWithStock = product.availableSizes.filter(s => s.stock && s.stock > 0);
      const sizesToUse = sizesWithStock.length > 0 ? sizesWithStock : product.availableSizes;
      
      newItems = sizesToUse.map(sizeObj => ({
        productId: product.id,
        productName: product.name,
        sku: product.sku || '',
        brand: product.brand || '',
        size: sizeObj.size,
        quantity: sizeObj.stock && sizeObj.stock > 0 ? sizeObj.stock : 1,
        unitPrice,
        totalPrice: (sizeObj.stock && sizeObj.stock > 0 ? sizeObj.stock : 1) * unitPrice,
      }));
    } else {
      // Regular product - add with quantity 0 (user selects quantities in cart)
      newItems = product.availableSizes.map(sizeObj => ({
        productId: product.id,
        productName: product.name,
        sku: product.sku || '',
        brand: product.brand || '',
        size: sizeObj.size,
        quantity: 0,
        unitPrice,
        totalPrice: 0,
      }));
    }
    
    addItemsToDraftMutation.mutate({ draftId: openCartId, items: newItems });
  }, [openCartId, openCart, toast, removeItemsFromCartMutation, addItemsToDraftMutation]);

  const getCartProductsFromDraft = useCallback((): ShopCartProduct[] => {
    if (!activeDraft || !activeDraft.items) return [];
    const grouped = new Map<string, any>();
    activeDraft.items.forEach((item) => {
      const key = item.productId;
      const product = products.find(p => p.id === item.productId);
      const displayColor = product?.colourway || 'Default';
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key, sku: item.sku, name: item.productName, color: displayColor, image1: '',
          price: item.unitPrice, sizes: [], quantities: {}, availableSizes: {}, isPreOrder: false,
          unitsPerCarton: product?.unitsPerCarton,
          unitsPerSize: product?.unitsPerSize,
          limitOrder: product?.limitOrder ?? undefined,
        });
      }
      const cartProduct = grouped.get(key);
      cartProduct.sizes.push(item.size);
      cartProduct.quantities[item.size] = item.quantity;
      if (product) {
        cartProduct.image1 = product.image1;
        cartProduct.isPreOrder = product.isPreOrder;
        cartProduct.unitsPerCarton = product.unitsPerCarton;
        cartProduct.unitsPerSize = product.unitsPerSize;
        cartProduct.limitOrder = product.limitOrder ?? undefined;
        cartProduct.limitOrderPerSize = (product.availableSizes as { size: string; limitOrder?: number }[] | undefined)
          ? Object.fromEntries(
              (product.availableSizes as { size: string; limitOrder?: number }[])
                .filter((s) => s.limitOrder != null && s.limitOrder >= 1)
                .map((s) => [s.size, s.limitOrder!])
            )
          : undefined;
        cartProduct.supportedSizes = (product.availableSizes as { size: string }[] | undefined)?.map((s) => s.size);
        const sizeObj = (product.availableSizes as { size: string; stock?: number }[]).find(s => s.size === item.size);
        cartProduct.availableSizes[item.size] = sizeObj?.stock || 0;
      }
    });
    return Array.from(grouped.values());
  }, [activeDraft, products]);

  const cartProducts = getCartProductsFromDraft();

  const cartProductKeys = useMemo(() => {
    const keys = new Set<string>();
    if (openCart?.items) {
      openCart.items.forEach(item => {
        // Look up product to get color since items don't store color directly
        const product = products.find(p => p.id === item.productId);
        const color = product?.colourway || 'Default';
        keys.add(`${item.sku}-${color}`);
      });
    }
    return keys;
  }, [openCart, products]);

  const handleBulkQuantityChange = useCallback((updates: Array<{productId: string, size: string, quantity: number}>) => {
    if (!activeDraft || updates.length === 0) return;
    const bulkUpdates = updates.map(({ productId, size, quantity }) => {
      const realProductId = productId.includes('::') ? productId.split('::')[0] : productId;
      const itemIndex = activeDraft.items?.findIndex(item => item.productId === realProductId && item.size === size);
      if (itemIndex === undefined || itemIndex === -1) return null;
      const item = activeDraft.items[itemIndex];
      return { itemIndex, updates: { quantity, totalPrice: item.unitPrice * quantity } };
    }).filter(Boolean);
    if (bulkUpdates.length === 0) return;
    apiRequest(`/api/orders/${activeDraft.id}/items/bulk`, 'PATCH', { updates: bulkUpdates })
      .then(() => queryClient.invalidateQueries({ queryKey: draftsQueryKey }))
      .catch(() => {
        queryClient.invalidateQueries({ queryKey: draftsQueryKey });
        toast({ title: 'Error', description: 'Failed to update quantities', variant: 'destructive' });
      });
  }, [activeDraft, toast]);

  const handleQuantityChange = useCallback((productId: string, size: string, quantity: number) => {
    if (!activeDraft) return;
    const realProductId = productId.includes('::') ? productId.split('::')[0] : productId;
    const itemIndex = activeDraft.items?.findIndex(item => item.productId === realProductId && item.size === size);
    if (itemIndex === undefined || itemIndex === -1) {
      if (quantity === 0) return;
      const existingItem = activeDraft.items?.find(item => item.productId === realProductId);
      if (!existingItem) return;
      const newItem = { ...existingItem, size, quantity, totalPrice: existingItem.unitPrice * quantity };
      apiRequest(`/api/orders/${activeDraft.id}/items`, 'POST', { items: [newItem] })
        .then(() => queryClient.invalidateQueries({ queryKey: draftsQueryKey }))
        .catch(() => {
          queryClient.invalidateQueries({ queryKey: draftsQueryKey });
          toast({ title: 'Error', description: 'Failed to add size to cart', variant: 'destructive' });
        });
      return;
    }
    const item = activeDraft.items[itemIndex];
    apiRequest(`/api/orders/${activeDraft.id}/items/${itemIndex}`, 'PATCH', { ...item, quantity, totalPrice: item.unitPrice * quantity })
      .then(() => queryClient.invalidateQueries({ queryKey: draftsQueryKey }))
      .catch(() => {
        queryClient.invalidateQueries({ queryKey: draftsQueryKey });
        toast({ title: 'Error', description: 'Failed to update quantity', variant: 'destructive' });
      });
  }, [activeDraft, toast]);

  const handleRemoveProduct = useCallback((productId: string) => {
    if (!activeDraft) return;
    const actualProductId = productId.includes('::') ? productId.split('::')[0] : productId;
    apiRequest(`/api/orders/${activeDraft.id}/products/${actualProductId}`, 'DELETE')
      .then(() => {
        queryClient.invalidateQueries({ queryKey: draftsQueryKey });
        toast({ title: 'Removed', description: 'Product removed from cart' });
      })
      .catch(() => {
        queryClient.invalidateQueries({ queryKey: draftsQueryKey });
        toast({ title: 'Error', description: 'Failed to remove product', variant: 'destructive' });
      });
  }, [activeDraft, toast]);

  const handleToggleSelect = useCallback((productId: string, selected: boolean) => {
    console.log('Toggle select:', productId, selected);
  }, []);

  const allSizes = useMemo(() => {
    const sizeSet = new Set<string>();
    products.forEach(product => {
      product.availableSizes.forEach(sizeObj => {
        sizeSet.add(sizeObj.size);
      });
    });
    return Array.from(sizeSet).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
  }, [products]);

  const activeFilterCount = getActiveFilters().length;

  const clearAllFilters = useCallback(() => {
    updateFilter('search', '');
    updateFilter('categories', []);
    updateFilter('brands', []);
    updateFilter('collections', []);
    updateFilter('genders', []);
    updateFilter('sizes', []);
    updateFilter('models', []);
    updateFilter('ageRanges', []);
    updateFilter('mainCategories', []);
    updateFilter('kidsGenders', []);
    updateFilter('kidsAgeGroups', []);
    updateFilter('divisions', []);
    updateFilter('colors', []);
    updateFilter('occasions', []);
    updateFilter('minPrice', undefined);
    updateFilter('maxPrice', undefined);
  }, [updateFilter]);

  return (
    <div className="flex min-h-screen bg-gradient-to-b from-[#fffbf5] via-white to-[#fffbf5] relative">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="bg-black sticky top-0 z-20 shadow-sm">
          <div className="max-w-7xl mx-auto">
            <nav className="flex items-center justify-center gap-2 py-3 px-6">
              <button 
                onClick={() => { 
                  updateFilter('mainCategories', []); 
                  updateFilter('kidsAgeGroups', []); 
                }} 
                className={`relative px-6 py-2.5 text-sm font-semibold tracking-wide transition-all duration-300 text-white ${
                  !(filters.mainCategories?.length) && !(filters.kidsAgeGroups?.length)
                    ? 'border-b-2 border-[#FD4338]' 
                    : 'hover:opacity-80'
                }`} 
                data-testid="nav-all"
              >
                SHOES
              </button>
              <button 
                onClick={() => { 
                  updateFilter('mainCategories', ['Male']); 
                  updateFilter('kidsAgeGroups', ['Adult']); 
                }} 
                className={`relative px-6 py-2.5 text-sm font-semibold tracking-wide transition-all duration-300 text-white ${
                  filters.mainCategories?.includes('Male') && filters.kidsAgeGroups?.includes('Adult') && filters.kidsAgeGroups?.length === 1
                    ? 'border-b-2 border-[#FD4338]' 
                    : 'hover:opacity-80'
                }`} 
                data-testid="nav-men"
              >
                MEN
              </button>
              <button 
                onClick={() => { 
                  updateFilter('mainCategories', ['Female']); 
                  updateFilter('kidsAgeGroups', ['Adult']); 
                }} 
                className={`relative px-6 py-2.5 text-sm font-semibold tracking-wide transition-all duration-300 text-white ${
                  filters.mainCategories?.includes('Female') && filters.kidsAgeGroups?.includes('Adult') && filters.kidsAgeGroups?.length === 1
                    ? 'border-b-2 border-[#FD4338]' 
                    : 'hover:opacity-80'
                }`} 
                data-testid="nav-women"
              >
                WOMEN
              </button>
              <button 
                onClick={() => { 
                  updateFilter('mainCategories', ['Male']); 
                  updateFilter('kidsAgeGroups', ['Junior', 'Kids', 'Infant']); 
                }} 
                className={`relative px-6 py-2.5 text-sm font-semibold tracking-wide transition-all duration-300 text-white ${
                  filters.mainCategories?.includes('Male') && 
                  (filters.kidsAgeGroups?.includes('Junior') || filters.kidsAgeGroups?.includes('Kids') || filters.kidsAgeGroups?.includes('Infant')) &&
                  !filters.kidsAgeGroups?.includes('Adult')
                    ? 'border-b-2 border-[#FD4338]' 
                    : 'hover:opacity-80'
                }`} 
                data-testid="nav-boys"
              >
                BOYS
              </button>
              <button 
                onClick={() => { 
                  updateFilter('mainCategories', ['Female']); 
                  updateFilter('kidsAgeGroups', ['Junior', 'Kids', 'Infant']); 
                }} 
                className={`relative px-6 py-2.5 text-sm font-semibold tracking-wide transition-all duration-300 text-white ${
                  filters.mainCategories?.includes('Female') && 
                  (filters.kidsAgeGroups?.includes('Junior') || filters.kidsAgeGroups?.includes('Kids') || filters.kidsAgeGroups?.includes('Infant')) &&
                  !filters.kidsAgeGroups?.includes('Adult')
                    ? 'border-b-2 border-[#FD4338]' 
                    : 'hover:opacity-80'
                }`} 
                data-testid="nav-girls"
              >
                GIRLS
              </button>
            </nav>
          </div>
        </div>

        <div className="bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <BrandLogoFilter filters={filters} onToggleArrayFilter={toggleArrayFilter} productType={productType} />
          </div>
        </div>

        <div className="bg-gradient-to-r from-[#fffbf5] to-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-4">
              <Button 
                onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)} 
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 focus:outline-none focus:ring-0 focus-visible:ring-0 ${
                  isFilterPanelOpen 
                    ? 'bg-gradient-to-r from-[#FE4438] to-[#FE4438] text-white shadow-lg shadow-[#FE4438]/30 hover:shadow-xl hover:from-[#FE4438] hover:to-[#FE4438]' 
                    : 'bg-white text-gray-700 border border-gray-200 hover:border-[#FE4438] hover:text-[#FE4438] shadow-sm hover:shadow-md hover:bg-white'
                }`} 
                data-testid="button-toggle-filters"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {isFilterPanelOpen ? 'Hide Filters' : 'Show Filters'}
                {activeFilterCount > 0 && (
                  <span className={`ml-1 px-2 py-0.5 text-xs font-bold rounded-full ${
                    isFilterPanelOpen ? 'bg-white/20 text-white' : 'bg-[#FE4438] text-white'
                  }`}>
                    {activeFilterCount}
                  </span>
                )}
              </Button>

              <Select value={sizeStandard} onValueChange={(value: SizeStandard) => setSizeStandard(value)}>
                <SelectTrigger 
                  className="w-[100px] h-10 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:border-[#FE4438] transition-colors"
                  data-testid="select-size-standard"
                >
                  <SelectValue placeholder="Size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EU" data-testid="size-standard-eu">EU Sizes</SelectItem>
                  <SelectItem value="US" data-testid="size-standard-us">US Sizes</SelectItem>
                  <SelectItem value="UK" data-testid="size-standard-uk">UK Sizes</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex-1 max-w-xl">
                <SmartFilterSearch filters={filters} onFilterChange={updateFilter} onToggleArrayFilter={toggleArrayFilter} productType={productType} />
              </div>

              {activeFilterCount > 0 && (
                <Button
                  onClick={clearAllFilters}
                  variant="ghost"
                  className="text-sm font-semibold text-[#FE4438] hover:text-[#FE4438] hover:bg-[#FE4438]/5 transition-all duration-300"
                  data-testid="button-clear-filters"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
              )}

              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Package className="h-4 w-4" />
                <span className="font-medium">
                  {totalProductCount !== null 
                    ? `${totalProductCount.toLocaleString()} Products` 
                    : `${products.length.toLocaleString()} Products`}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex">
          {isFilterPanelOpen && (
            <aside className="w-72 bg-white border-r border-gray-100 flex-shrink-0 shadow-sm">
              <div className="sticky top-[52px] h-[calc(100vh-52px)] overflow-y-auto">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Filters</h3>
                    <div className="flex items-center gap-2">
                      {activeFilterCount > 0 && (
                        <button 
                          onClick={clearAllFilters}
                          className="text-xs font-semibold text-[#FE4438] hover:text-[#FE4438] transition-colors"
                        >
                          Reset All
                        </button>
                      )}
                      <button 
                        onClick={() => setIsFilterPanelOpen(false)}
                        className="text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
                        data-testid="button-hide-filters"
                      >
                        Hide Filters
                      </button>
                    </div>
                  </div>
                  <FilterSidebar 
                    filters={filters} 
                    onFilterChange={updateFilter} 
                    onToggleArrayFilter={toggleArrayFilter} 
                    onRemoveFilter={removeFilter} 
                    activeFilters={getActiveFilters()} 
                    isHorizontal={false} 
                    productType={productType}
                    sizeStandard={sizeStandard}
                  />
                </div>
              </div>
            </aside>
          )}

          <main className="flex-1 bg-[#F1F4F3]">
            <div className="max-w-7xl mx-auto px-6 py-8">
              {filters.search && (
                <div className="flex items-center justify-between mb-8 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FE4438] to-[#FE4438] flex items-center justify-center shadow-lg shadow-[#FE4438]/30">
                      <Filter className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Search Results</h2>
                      <p className="text-sm text-gray-500">Showing results for "{filters.search}"</p>
                    </div>
                  </div>
                  <Button
                    onClick={clearAllFilters}
                    variant="ghost"
                    className="text-sm font-semibold text-[#FE4438] hover:text-[#FE4438] hover:bg-[#FE4438]/5 rounded-xl transition-all duration-300"
                    data-testid="button-return-to-all"
                  >
                    Return to All Products
                  </Button>
                </div>
              )}

              {isLoadingProducts ? (
                <div className={`grid gap-6 ${isFilterPanelOpen ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'}`}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                      <div className="animate-pulse">
                        <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl mb-4" />
                        <div className="h-4 bg-gray-100 rounded-full w-3/4 mb-3" />
                        <div className="h-4 bg-gray-100 rounded-full w-1/2 mb-3" />
                        <div className="h-5 bg-gray-100 rounded-full w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-6">
                    <ShoppingCart className="w-12 h-12 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">No products found</h3>
                  <p className="text-gray-500 text-center max-w-md mb-6">
                    We couldn't find any products matching your criteria. Try adjusting your filters or search terms.
                  </p>
                  <Button
                    onClick={clearAllFilters}
                    className="bg-gradient-to-r from-[#FE4438] to-[#FE4438] text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-[#FE4438]/30 hover:shadow-xl transition-all duration-300"
                  >
                    Clear All Filters
                  </Button>
                </div>
              ) : (
                <div 
                  className={`grid gap-5 transition-opacity duration-100 ${isFilterPanelOpen ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'} ${isScrollReady ? 'opacity-100' : 'opacity-0'}`}
                >
                  {productGroups.map((group, index) => (
                    <ShopProductCard 
                      key={`${group.name}-${index}`} 
                      productGroup={group} 
                      cartProductKeys={cartProductKeys} 
                      onAddToCart={handleAddToCartFromGroup} 
                      disabled={addItemsToDraftMutation.isPending || removeItemsFromCartMutation.isPending} 
                    />
                  ))}
                </div>
              )}
              
              {/* Infinite scroll trigger */}
              <div ref={loadMoreRef} className="w-full py-8 flex justify-center">
                {isFetchingNextPage && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Loading more products...</span>
                  </div>
                )}
                {!hasNextPage && products.length > 0 && (
                  <span className="text-sm text-muted-foreground">All {products.length.toLocaleString()} products loaded</span>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Back to Top Button */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-12 h-12 bg-gradient-to-r from-[#FE4438] to-[#FE4438] text-white rounded-full shadow-lg shadow-[#FE4438]/30 hover:shadow-xl hover:scale-110 transition-all duration-300 flex items-center justify-center"
          data-testid="button-back-to-top"
          aria-label="Back to top"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
