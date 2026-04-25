import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ChevronRight as ChevronIcon, ShoppingCart, Check, X, Package, ChevronDown } from "lucide-react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCartContext } from "@/hooks/useCartContext";
import { useAuth } from "@/hooks/useAuth";
import { getStoredScrollPosition, clearPageState } from "@/hooks/usePageState";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Product, Order, Brand } from "@shared/schema";
import defaultProductImage from "@assets/image_1764103914777.png";

// Size standard types
type SizeStandard = 'EU' | 'US' | 'UK';

export default function ProductDetailPage() {
  const [, params] = useRoute("/product/:id");
  const productId = params?.id;
  const [, setLocation] = useLocation();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  
  // Track selected variant for instant switching
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [variantStripCanScrollLeft, setVariantStripCanScrollLeft] = useState(false);
  const [variantStripCanScrollRight, setVariantStripCanScrollRight] = useState(false);
  const variantStripRef = useRef<HTMLDivElement>(null);
  
  // Local optimistic state for instant UI updates
  const [optimisticInCart, setOptimisticInCart] = useState<boolean | null>(null);
  
  // State for carton sizes collapsible
  const [cartonSizesOpen, setCartonSizesOpen] = useState(false);
  
  // State for size standard switcher (EU, US, UK)
  const [selectedSizeStandard, setSelectedSizeStandard] = useState<SizeStandard>('EU');
  
  // Use shared cart context
  const { drafts, activeDraftId, openCartId, setOpenCartId, setActiveDraftId, createDraft, deleteDraft, isCreatingDraft, draftsQueryKey } = useCartContext();
  
  // Currency formatting
  const { formatPrice } = useCurrency();
  
  const historyState = window.history.state as { product?: any; fromPage?: string } | null;
  
  const previousPage = historyState?.fromPage || '/shop';

  const handleClose = useCallback(() => {
    const savedPosition = getStoredScrollPosition(previousPage);
    console.log('[SCROLL RESTORE] Reading saved position for:', previousPage, savedPosition);
    
    if (savedPosition) {
      const pendingData = {
        path: previousPage,
        scrollX: savedPosition.scrollX,
        scrollY: savedPosition.scrollY
      };
      console.log('[SCROLL RESTORE] Setting pending scroll:', pendingData);
      sessionStorage.setItem('pending_scroll_restore', JSON.stringify(pendingData));
    }
    
    window.history.back();
  }, [previousPage]);
  
  // Normalize product from state - handle both full Product and ShopCartProduct formats
  const [stateProduct] = useState<Product | undefined>(() => {
    const p = historyState?.product;
    if (!p) return undefined;
    
    // If availableSizes is a Record (from cart), convert to array format
    if (p.availableSizes && !Array.isArray(p.availableSizes)) {
      const sizesRecord = p.availableSizes as Record<string, number>;
      const sizesArray = Object.entries(sizesRecord).map(([size, stock]) => ({
        size,
        stock: stock || 0
      }));
      return { ...p, availableSizes: sizesArray } as Product;
    }
    
    return p as Product;
  });

  // Get the open cart
  const openCart = openCartId ? drafts.find(d => d.id === openCartId) : null;

  // Check if this product is in the currently OPEN (active) cart only
  const serverInCart = useMemo(() => {
    if (!productId || !openCart) return false;
    return openCart.items?.some(item => item.productId === productId) || false;
  }, [productId, openCart]);

  // Use optimistic state if set, otherwise use server state
  const isProductInCart = optimisticInCart !== null ? optimisticInCart : serverInCart;

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
      
      return res.json() as Promise<Order>;
    },
    onMutate: async ({ draftId, items }) => {
      // Set optimistic state immediately
      setOptimisticInCart(true);
      
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: draftsQueryKey });
      
      // Snapshot previous value
      const previousDrafts = queryClient.getQueryData<Order[]>(draftsQueryKey);
      
      // Optimistically update cache
      queryClient.setQueryData<Order[]>(draftsQueryKey, (old) => {
        if (!old) return old;
        return old.map(draft => {
          if (draft.id === draftId) {
            return { ...draft, items: [...(draft.items || []), ...items] };
          }
          return draft;
        });
      });
      
      return { previousDrafts };
    },
    onError: (err: Error & { cartType?: string; productType?: string; productName?: string }, _vars, context) => {
      // Rollback on error
      setOptimisticInCart(null);
      if (context?.previousDrafts) {
        queryClient.setQueryData(draftsQueryKey, context.previousDrafts);
      }
      
      // Show toast for cart type mismatch
      if (err.cartType && err.productType) {
        const cartTypeLabel = err.cartType === 'pre-order' ? 'Pre-Order' : 'Stock';
        const productTypeLabel = err.productType === 'pre-order' ? 'Pre-Order' : 'Stock';
        toast({ 
          title: "Action not allowed", 
          description: `This product is ${productTypeLabel} and can't be added to a ${cartTypeLabel} cart. Please switch to a ${productTypeLabel} cart to continue.`, 
          variant: "destructive" 
        });
      } else {
        toast({ 
          title: "Unable to Add Product", 
          description: err.message || "There was an error adding this product to your cart. Please try again.", 
          variant: "destructive" 
        });
      }
    },
    onSuccess: () => {
      // Sync optimistic state with server
      setOptimisticInCart(null);
      toast({ title: "Product Added", description: "Product has been added to your cart successfully" });
    },
    onSettled: () => {
      // Refetch in background to ensure consistency
      queryClient.invalidateQueries({ queryKey: draftsQueryKey });
    },
  });

  const removeItemsFromCartMutation = useMutation({
    mutationFn: async ({ draftId, productId }: { draftId: string; productId: string }) => {
      await apiRequest(`/api/orders/${draftId}/products/${productId}`, 'DELETE');
    },
    onMutate: async ({ draftId, productId }) => {
      setOptimisticInCart(false);
      await queryClient.cancelQueries({ queryKey: draftsQueryKey });
      const previousDrafts = queryClient.getQueryData<Order[]>(draftsQueryKey);
      queryClient.setQueryData<Order[]>(draftsQueryKey, (old) => {
        if (!old) return old;
        return old.map(draft => {
          if (draft.id === draftId) {
            return { 
              ...draft, 
              items: (draft.items || []).filter(item => item.productId !== productId) 
            };
          }
          return draft;
        });
      });
      return { previousDrafts };
    },
    onError: (_err, _vars, context) => {
      setOptimisticInCart(null);
      if (context?.previousDrafts) {
        queryClient.setQueryData(draftsQueryKey, context.previousDrafts);
      }
      toast({ title: "Error", description: "Failed to remove product from cart", variant: "destructive" });
    },
    onSuccess: () => {
      setOptimisticInCart(null);
      toast({ title: "Removed from cart", description: "Product removed successfully" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: draftsQueryKey });
    },
  });

  const { data: fetchedProduct, isLoading, isError, refetch } = useQuery<Product>({
    queryKey: [`/api/products/${productId}`],
    enabled: !!productId,
    initialData: stateProduct, // Use navigation state as initial data while fetching
    staleTime: 0, // Always refetch to get latest stock data
    retry: 1, // Retry once on failure (e.g. transient network)
  });

  // Normalize product to ensure availableSizes is always an array
  const product = useMemo(() => {
    const p = fetchedProduct || stateProduct;
    if (!p) return undefined;
    
    // If availableSizes is a Record (from cart), convert to array format
    if (p.availableSizes && !Array.isArray(p.availableSizes)) {
      const sizesRecord = p.availableSizes as unknown as Record<string, number>;
      const sizesArray = Object.entries(sizesRecord).map(([size, stock]) => ({
        size,
        stock: stock || 0
      }));
      return { ...p, availableSizes: sizesArray } as Product;
    }
    
    return p;
  }, [stateProduct, fetchedProduct]);

  // Fetch variants by exact product name - use the value from Excel as-is, no processing or splitting
  const { data: sameNameProductsData = [] } = useQuery<Product[]>({
    queryKey: ["/api/products/variants/by-name", product?.name],
    queryFn: async () => {
      if (!product?.name) return [];
      const params = new URLSearchParams({ name: product.name });
      const res = await fetch(`/api/products/variants/by-name?${params}`);
      if (!res.ok) throw new Error('Failed to fetch variants');
      return res.json();
    },
    enabled: !!product?.name,
  });

  const sameNameProducts = sameNameProductsData;

  // Fetch collections and size charts to get actual size data for carton products
  const { data: collections = [] } = useQuery<any[]>({
    queryKey: ["/api/collections"],
    enabled: !!product,
  });

  const { data: sizeCharts = [] } = useQuery<any[]>({
    queryKey: ["/api/size-charts"],
    enabled: !!product,
  });

  // Fetch brands to get size standards for size conversion
  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
    enabled: !!product,
  });

  // Find the brand for this product and get its size standards
  // Match by name (API returns brandName) or by ID (fallback when brand is stored as ID)
  // Normalize names (remove spaces) so "NewBalance" matches "New Balance"
  const productBrand = useMemo(() => {
    if (!product?.brand || !brands.length) return null;
    const productBrandNorm = String(product.brand).toLowerCase().replace(/\s+/g, '');
    const byName = brands.find(b => {
      const bNorm = (b.name || '').toLowerCase().replace(/\s+/g, '');
      return bNorm === productBrandNorm;
    });
    if (byName) return byName;
    const byId = brands.find(b => b.id === product.brand);
    return byId || null;
  }, [product?.brand, brands]);

  // Normalize size string for comparison (handle common formatting variations)
  // Must be defined before brandSizeStandards which uses it
  const normalizeSize = useCallback((size: string): string => {
    if (!size) return '';
    let normalized = String(size).trim().toUpperCase();
    normalized = normalized.replace(/^(US|UK|EU|SIZE)\s*/i, '');
    normalized = normalized.replace(/\s*(M|W|MEN|WOMEN)$/i, '');
    normalized = normalized.replace(/(\d+)\s*[/]\s*2/, '$1.5');
    normalized = normalized.replace(/\s+/g, '');
    return normalized;
  }, []);

  // For matching: strip trailing width letters (C,D,E,W,M,N) so "3.5C" matches "3.5" - common in US kids sizes
  const normalizeSizeForMatch = useCallback((size: string): string => {
    const n = normalizeSize(size);
    if (!n) return n;
    return n.replace(/(\d+\.?\d*)[CDEWMN]$/i, '$1') || n;
  }, [normalizeSize]);

  // Get size standards for the product's gender/category with Kids age group support
  const brandSizeStandards = useMemo(() => {
    if (!productBrand?.sizeStandards) return null;
    
    const standards = productBrand.sizeStandards as Record<string, { EU?: string[]; US?: string[]; UK?: string[] }>;
    const standardCategories = Object.keys(standards);
    if (standardCategories.length === 0) return null;
    
    // Get product category info (gender, main category, kids gender, kids age group)
    // New Balance uses "Grade Boys" / "Grade Girls" in rawAttributes - use that when kidsGender is empty
    const rawGenderNbme = (product?.rawAttributes as Record<string, string> | undefined)?.['Gender (NBME)'] || '';
    const gender = (product?.gender || '').toLowerCase();
    const mainCategory = (product?.mainCategory || '').toUpperCase();
    const kidsGender = (product?.kidsGender || rawGenderNbme || '').toUpperCase();
    const kidsAgeGroup = (product?.kidsAgeGroup || '').toUpperCase();
    
    // Category mappings: product attributes -> brand size chart keys
    // Size chart keys: Adult Female, Adult Male, Unisex, Kids Female, Kids Male, Kids Unisex, Infant
    const categoryMappings: Record<string, string[]> = {
      'men': ['Adult Male', 'Unisex', 'Adult Female'],
      'male': ['Adult Male', 'Unisex', 'Adult Female'],
      'm': ['Adult Male', 'Unisex', 'Adult Female'],
      "men's": ['Adult Male', 'Unisex', 'Adult Female'],
      'women': ['Adult Female', 'Unisex', 'Adult Male'],
      'female': ['Adult Female', 'Unisex', 'Adult Male'],
      'w': ['Adult Female', 'Unisex', 'Adult Male'],
      "women's": ['Adult Female', 'Unisex', 'Adult Male'],
      'boy': ['Kids Male', 'Kids Unisex', 'Adult Male'],
      'boys': ['Kids Male', 'Kids Unisex', 'Adult Male'],
      'grade boys': ['Kids Male', 'Kids Unisex', 'Kids Female'],
      'grade boy': ['Kids Male', 'Kids Unisex', 'Kids Female'],
      'girl': ['Kids Female', 'Kids Unisex', 'Adult Female'],
      'girls': ['Kids Female', 'Kids Unisex', 'Adult Female'],
      'grade girls': ['Kids Female', 'Kids Unisex', 'Kids Male'],
      'grade girl': ['Kids Female', 'Kids Unisex', 'Kids Male'],
      'kids': ['Kids Male', 'Kids Female', 'Kids Unisex'],
      'kid': ['Kids Male', 'Kids Female', 'Kids Unisex'],
      'children': ['Kids Male', 'Kids Female', 'Kids Unisex'],
      'child': ['Kids Male', 'Kids Female', 'Kids Unisex'],
      'unisex': ['Unisex', 'Adult Male', 'Adult Female'],
      '': ['Unisex', 'Adult Male', 'Adult Female'],
      'other': ['Unisex', 'Adult Male', 'Adult Female'],
      'unknown': ['Unisex', 'Adult Male', 'Adult Female']
    };
    
    // Kids age group / infant mappings (products with kidsAgeGroup or Infant category)
    const kidsAgeGroupMappings: Record<string, string[]> = {
      'LARGE': ['Kids Male', 'Kids Female', 'Kids Unisex'],
      'JUNIOR': ['Kids Male', 'Kids Female', 'Kids Unisex'],
      'NEW BORN': ['Infant', 'Kids Male', 'Kids Female'],
      'NEWBORN': ['Infant', 'Kids Male', 'Kids Female'],
      'KIDS': ['Kids Male', 'Kids Female', 'Kids Unisex'],
      'INFANT': ['Infant']
    };
    
    // If product is KIDS/INFANT with specific age group, prioritize that; else use gender mapping
    // Products with mainCategory Kids (e.g. from Excel) should try Kids Male/Female/Unisex to match brand size standards
    // Also: products with kidsAgeGroup (Junior, Large, etc.) but mainCategory Male/Female are still kids - use Kids charts
    let categoriesToTry: string[] = [];
    if ((mainCategory === 'KIDS' || mainCategory === 'INFANT') && kidsAgeGroup && kidsAgeGroupMappings[kidsAgeGroup]) {
      categoriesToTry = kidsAgeGroupMappings[kidsAgeGroup];
    } else if (mainCategory === 'INFANT') {
      categoriesToTry = ['Infant'];
    } else if (mainCategory === 'KIDS') {
      // Use kidsGender when set: BOYS->Kids Male, GIRLS->Kids Female, UNISEX->Kids Unisex
      if (kidsGender === 'BOYS' || kidsGender === 'BOY') {
        categoriesToTry = ['Kids Male', 'Kids Unisex', 'Kids Female'];
      } else if (kidsGender === 'GIRLS' || kidsGender === 'GIRL') {
        categoriesToTry = ['Kids Female', 'Kids Unisex', 'Kids Male'];
      } else if (kidsGender === 'UNISEX') {
        categoriesToTry = ['Kids Unisex', 'Kids Male', 'Kids Female'];
      } else {
        categoriesToTry = ['Kids Male', 'Kids Female', 'Kids Unisex'];
      }
    } else if (kidsAgeGroup && kidsAgeGroupMappings[kidsAgeGroup]) {
      // Kids age group set (Junior, Large, etc.) but mainCategory is Male/Female - still a kids product (e.g. New Balance)
      // Use kidsGender to prioritize Kids Male vs Kids Female when available (incl. "Grade Boys"/"Grade Girls" from NB)
      if (kidsGender === 'BOYS' || kidsGender === 'BOY' || kidsGender === 'GRADE BOYS') {
        categoriesToTry = ['Kids Male', 'Kids Unisex', 'Kids Female'];
      } else if (kidsGender === 'GIRLS' || kidsGender === 'GIRL' || kidsGender === 'GRADE GIRLS') {
        categoriesToTry = ['Kids Female', 'Kids Unisex', 'Kids Male'];
      } else {
        categoriesToTry = kidsAgeGroupMappings[kidsAgeGroup];
      }
    } else {
      categoriesToTry = categoryMappings[gender] || [gender];
    }
    
    // Find first matching category in size standards (case-insensitive)
    for (const categoryToTry of categoriesToTry) {
      for (const [category, sizes] of Object.entries(standards)) {
        if (category.toLowerCase() === categoryToTry.toLowerCase()) {
          return sizes;
        }
      }
    }
    
    // Fallback: pick the category whose sizes best match the product's sizes (for unknown gender or wrong mapping)
    const productSizesForMatch = (product?.availableSizes as { size: string }[] | undefined)?.map(s => normalizeSize(String(s.size))) || [];
    if (productSizesForMatch.length > 0) {
      let bestCategory: string | null = null;
      let bestMatches = 0;
      for (const [category, sizes] of Object.entries(standards)) {
        const euSizes = (sizes.EU || []).filter(s => s !== '-').map(s => normalizeSize(s));
        const usSizes = (sizes.US || []).filter(s => s !== '-').map(s => normalizeSize(s));
        const ukSizes = (sizes.UK || []).filter(s => s !== '-').map(s => normalizeSize(s));
        const allSizes = [...new Set([...euSizes, ...usSizes, ...ukSizes])];
        const matches = productSizesForMatch.filter(ps => allSizes.includes(ps)).length;
        if (matches > bestMatches) {
          bestMatches = matches;
          bestCategory = category;
        }
      }
      if (bestCategory && standards[bestCategory]) return standards[bestCategory];
    }
    
    // Last resort: first available category
    const firstCategory = standardCategories[0];
    if (firstCategory && standards[firstCategory]) return standards[firstCategory];
    return null;
  }, [productBrand, product?.gender, product?.mainCategory, product?.kidsAgeGroup, product?.kidsGender, product?.availableSizes, normalizeSize]);

  // Find the size chart linked to this product's collection
  const linkedSizeChart = useMemo(() => {
    if (!product || !collections.length || !sizeCharts.length) return null;
    const productCollections = product.collections || [];
    
    for (const collectionName of productCollections) {
      // Case-insensitive collection name matching
      const collection = collections.find((c: any) => 
        c.name?.toLowerCase() === collectionName?.toLowerCase()
      );
      if (collection?.sizeChartId) {
        const sizeChart = sizeCharts.find((sc: any) => sc.id === collection.sizeChartId);
        if (sizeChart) return sizeChart;
      }
    }
    return null;
  }, [product, collections, sizeCharts]);

  // One variant per product (per UPC) - show all products with same name, each as its own swatch
  const productVariants = useMemo(() => {
    if (!sameNameProducts.length) return [];
    return [...sameNameProducts].sort((a, b) => (a.sku || '').localeCompare(b.sku || ''));
  }, [sameNameProducts]);

  // Get the currently displayed product (selected variant by id, or current product)
  const displayProduct = useMemo((): Product | undefined => {
    if (!product) return undefined;
    if (selectedVariantId) {
      const selected = productVariants.find(v => v.id === selectedVariantId);
      if (selected) return selected;
    }
    return product;
  }, [selectedVariantId, productVariants, product]);

  // Detect the product's base size standard by checking which brand array contains matching sizes
  const detectedBaseStandard = useMemo((): SizeStandard | null => {
    if (!brandSizeStandards || !displayProduct?.availableSizes?.length) return null;
    
    const productSizes = (displayProduct.availableSizes || []).map(s => normalizeSizeForMatch(String(s?.size ?? '')));
    
    // Check each standard to see how many product sizes match
    const standards: SizeStandard[] = ['EU', 'US', 'UK'];
    let bestMatch: { standard: SizeStandard; matches: number } | null = null;
    
    for (const standard of standards) {
      const standardSizes = brandSizeStandards[standard] || [];
      if (standardSizes.length === 0) continue;
      
      // Normalize standard sizes for comparison, filtering out placeholder values
      const normalizedStandardSizes = standardSizes
        .filter(s => s !== '-')
        .map(s => normalizeSizeForMatch(s));
      
      // Count how many product sizes exist in this standard
      const matches = productSizes.filter(size => normalizedStandardSizes.includes(size)).length;
      
      if (matches > 0 && (!bestMatch || matches > bestMatch.matches)) {
        bestMatch = { standard, matches };
      }
    }
    
    // Return best match if at least 1 product size is found (relaxed for products with few sizes)
    if (bestMatch && bestMatch.matches >= Math.max(1, Math.floor(productSizes.length * 0.5))) {
      return bestMatch.standard;
    }
    
    return null;
  }, [brandSizeStandards, displayProduct?.availableSizes, normalizeSize]);

  // Determine available size standards (those with aligned arrays and no placeholders for product sizes)
  // When no brand size standards: all three available so switcher shows for every product (no conversion, same sizes)
  const availableSizeStandards = useMemo(() => {
    if (!displayProduct?.availableSizes?.length) {
      return { EU: false, US: false, UK: false };
    }
    if (!brandSizeStandards || !detectedBaseStandard) {
      return { EU: true, US: true, UK: true }; // Show switcher for all products; no conversion = same sizes
    }
    
    const baseLen = brandSizeStandards[detectedBaseStandard]?.length || 0;
    const baseSizes = brandSizeStandards[detectedBaseStandard] || [];
    const productSizes = (displayProduct.availableSizes || []).map(s => normalizeSizeForMatch(String(s?.size ?? '')));
    
    // Check if a standard can convert all product sizes (no placeholders for required sizes)
    const canConvertAllSizes = (targetSizes: string[]) => {
      if (targetSizes.length !== baseLen) return false;
      
      // For each product size, check if the converted size is not a placeholder
      for (const productSize of productSizes) {
        const index = baseSizes.findIndex(s => s !== '-' && normalizeSizeForMatch(s) === productSize);
        if (index !== -1 && targetSizes[index] === '-') {
          return false; // Found a placeholder for a size the product needs
        }
      }
      return true;
    };
    
    return {
      EU: brandSizeStandards.EU?.length === baseLen && canConvertAllSizes(brandSizeStandards.EU || []),
      US: brandSizeStandards.US?.length === baseLen && canConvertAllSizes(brandSizeStandards.US || []),
      UK: brandSizeStandards.UK?.length === baseLen && canConvertAllSizes(brandSizeStandards.UK || [])
    };
  }, [brandSizeStandards, detectedBaseStandard, displayProduct?.availableSizes, normalizeSize]);

  // Convert size from detected base standard to the selected standard
  const convertSize = useCallback((originalSize: string): string => {
    if (!brandSizeStandards || !detectedBaseStandard) {
      return originalSize;
    }
    
    // If already showing the base standard, no conversion needed
    if (selectedSizeStandard === detectedBaseStandard) {
      return originalSize;
    }
    
    // Only convert if the target standard is properly aligned
    if (!availableSizeStandards[selectedSizeStandard]) {
      return originalSize;
    }
    
    const baseSizes = brandSizeStandards[detectedBaseStandard] || [];
    const targetSizes = brandSizeStandards[selectedSizeStandard] || [];
    
    // Normalize the original size for comparison
    const normalizedOriginal = normalizeSize(originalSize);
    
    // Find the index of this size in the base standard using normalized comparison
    // Skip placeholder values ("-") during lookup
    const index = baseSizes.findIndex(s => s !== '-' && normalizeSize(s) === normalizedOriginal);
    if (index === -1 || !targetSizes[index]) {
      return originalSize; // Fall back to original if no conversion found
    }
    
    // If target size is a placeholder, fall back to original
    const convertedSize = targetSizes[index];
    if (convertedSize === '-') {
      return originalSize;
    }
    
    return convertedSize;
  }, [brandSizeStandards, selectedSizeStandard, detectedBaseStandard, availableSizeStandards, normalizeSize]);

  // Check if size conversion is available (detected base + at least one other aligned standard)
  const hasSizeConversion = useMemo(() => {
    if (!detectedBaseStandard) return false;
    
    const otherStandards = (['EU', 'US', 'UK'] as const).filter(s => s !== detectedBaseStandard);
    return otherStandards.some(s => availableSizeStandards[s]);
  }, [availableSizeStandards, detectedBaseStandard]);

  // Initialize selectedSizeStandard to match detectedBaseStandard when it's first determined
  useEffect(() => {
    if (detectedBaseStandard) {
      setSelectedSizeStandard(detectedBaseStandard);
    }
  }, [detectedBaseStandard]);

  // Convert sizes based on selected standard (must be before early returns to satisfy Rules of Hooks)
  const convertedSizes = useMemo(() => {
    if (!displayProduct?.availableSizes) return [];
    return (displayProduct.availableSizes || []).map(s => ({
      ...s,
      displaySize: convertSize(s.size)
    }));
  }, [displayProduct?.availableSizes, convertSize]);

  // Navigate to a variant - instant state update
  const navigateToVariant = (variant: Product) => {
    setSelectedVariantId(variant.id);
    setCurrentImageIndex(0); // Reset image index
    // Update URL without reload
    window.history.replaceState({ product: variant }, "", `/product/${variant.id}`);
  };

  const checkVariantStripScroll = useCallback(() => {
    const el = variantStripRef.current;
    if (!el) return;
    setVariantStripCanScrollLeft(el.scrollLeft > 0);
    setVariantStripCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    checkVariantStripScroll();
    const el = variantStripRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkVariantStripScroll);
    const ro = new ResizeObserver(checkVariantStripScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkVariantStripScroll);
      ro.disconnect();
    };
  }, [checkVariantStripScroll, productVariants]);

  if (isLoading && !stateProduct) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isError && !stateProduct) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-white px-4">
        <p className="text-xl text-gray-500 text-center">Failed to load product</p>
        <div className="flex gap-3">
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
          <button
            onClick={() => setLocation('/shop')}
            className="px-4 py-2 text-blue-600 hover:underline"
          >
            Back to Shop
          </button>
        </div>
      </div>
    );
  }

  if (!product || !displayProduct) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-white px-4">
        <p className="text-xl text-gray-500">Product not found</p>
        <button
          onClick={() => setLocation('/shop')}
          className="text-blue-600 hover:underline"
        >
          Back to Shop
        </button>
      </div>
    );
  }

  const isValidImageUrl = (url: string) => {
    if (!url) return false;
    // Exclude placeholder URLs
    if (url.includes('placeholder') || url.includes('No+Image')) return false;
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/api/');
  };
  
  // Collect all image fields (image1-4) plus legacy imageUrl
  const allImageFields = [
    displayProduct.image1,
    displayProduct.image2,
    displayProduct.image3,
    displayProduct.image4,
    displayProduct.imageUrl
  ].filter((url): url is string => !!url && isValidImageUrl(url));
  
  // Remove duplicates
  const uniqueImages = Array.from(new Set(allImageFields));
  
  const images = uniqueImages.length > 0 ? uniqueImages : [defaultProductImage];
  
  const currentImage = images[currentImageIndex] || defaultProductImage;

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const totalStock = displayProduct.availableSizes?.reduce((sum, s) => {
    const stock = typeof s.stock === 'string' ? parseInt(s.stock) : s.stock;
    return sum + (stock || 0);
  }, 0) || 0;

  const getColorHex = (colorName: string): string => {
    const colorMap: Record<string, string> = {
      'black': '#000000',
      'white': '#FFFFFF',
      'red': '#DC2626',
      'blue': '#2563EB',
      'green': '#16A34A',
      'yellow': '#EAB308',
      'purple': '#9333EA',
      'pink': '#EC4899',
      'gray': '#6B7280',
      'grey': '#6B7280',
      'orange': '#EA580C',
      'brown': '#92400E',
      'navy': '#1E3A8A',
      'beige': '#D4B896',
    };
    const normalizedColor = colorName.toLowerCase().trim();
    for (const [key, hex] of Object.entries(colorMap)) {
      if (normalizedColor.includes(key)) {
        return hex;
      }
    }
    return '#CBD5E1';
  };

  const handleToggleCart = async () => {
    // If product is already in the open cart, remove it (toggle off) - same as shop page
    if (isProductInCart && openCart) {
      removeItemsFromCartMutation.mutate({ draftId: openCart.id, productId: displayProduct.id });
      return;
    }
    
    // If drafts exist but none are open, show toast and prevent adding
    if (drafts.length > 0 && !openCart) {
      toast({
        title: "Please open a cart first",
        description: "Click on a cart toggle to open it before adding products.",
      });
      return;
    }
    
    // If no drafts exist, create one first (context will auto-open the new cart)
    // Default to stock cart type for programmatic creation
    if (drafts.length === 0) {
      createDraft('Cart 1', 'stock');
      toast({
        title: "Creating cart...",
        description: "Please click again to add the product after the cart is created.",
      });
      return;
    }

    // Check if this is a carton product - same logic as shop page
    const isCarton = displayProduct.unitsPerCarton && displayProduct.unitsPerCarton > 0;
    const unitPrice = parseFloat(displayProduct.wholesalePrice) || 0;
    
    let newItems;
    if (isCarton) {
      // For carton products, use stock as quantity (or 1 if no stock) - same as shop page
      const sizesWithStock = (displayProduct.availableSizes || []).filter(s => s.stock && s.stock > 0);
      const sizesToUse = sizesWithStock.length > 0 ? sizesWithStock : (displayProduct.availableSizes || []);
      
      newItems = sizesToUse.map(sizeObj => ({
        productId: displayProduct.id,
        productName: displayProduct.name,
        sku: displayProduct.sku || '',
        brand: displayProduct.brand || '',
        size: sizeObj.size,
        quantity: sizeObj.stock && sizeObj.stock > 0 ? sizeObj.stock : 1,
        unitPrice,
        totalPrice: (sizeObj.stock && sizeObj.stock > 0 ? sizeObj.stock : 1) * unitPrice,
      }));
    } else {
      // Regular product - add with quantity 0
      newItems = (displayProduct.availableSizes || []).map(sizeObj => ({
        productId: displayProduct.id,
        productName: displayProduct.name,
        sku: displayProduct.sku || '',
        brand: displayProduct.brand || '',
        size: sizeObj.size,
        quantity: 0,
        unitPrice,
        totalPrice: 0,
      }));
    }
    
    addItemsToDraftMutation.mutate({ draftId: openCart!.id, items: newItems });
  };

  const isVariantInCart = (variant: Product) =>
    !!openCart?.items?.some(item => item.productId === variant.id);

  const handleAddVariantToCart = (variant: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isVariantInCart(variant) || !openCart) return;
    if (drafts.length === 0) {
      createDraft('Cart 1', 'stock');
      toast({ title: "Creating cart...", description: "Please click again to add the product after the cart is created." });
      return;
    }
    const isCarton = variant.unitsPerCarton && variant.unitsPerCarton > 0;
    const unitPrice = parseFloat(variant.wholesalePrice) || 0;
    const sizesToUse = variant.availableSizes || [];
    let newItems;
    if (isCarton) {
      const sizesWithStock = sizesToUse.filter((s: { stock?: number }) => s.stock && s.stock > 0);
      const use = sizesWithStock.length > 0 ? sizesWithStock : sizesToUse;
      newItems = use.map((sizeObj: { size: string; stock?: number }) => ({
        productId: variant.id,
        productName: variant.name,
        sku: variant.sku || '',
        brand: variant.brand || '',
        size: sizeObj.size,
        quantity: sizeObj.stock && sizeObj.stock > 0 ? sizeObj.stock : 1,
        unitPrice,
        totalPrice: (sizeObj.stock && sizeObj.stock > 0 ? sizeObj.stock : 1) * unitPrice,
      }));
    } else {
      newItems = sizesToUse.map((sizeObj: { size: string }) => ({
        productId: variant.id,
        productName: variant.name,
        sku: variant.sku || '',
        brand: variant.brand || '',
        size: sizeObj.size,
        quantity: 0,
        unitPrice,
        totalPrice: 0,
      }));
    }
    addItemsToDraftMutation.mutate({ draftId: openCart.id, items: newItems });
  };

  const variantStripScrollLeft = () => {
    variantStripRef.current?.scrollBy({ left: -100, behavior: 'smooth' });
  };
  const variantStripScrollRight = () => {
    variantStripRef.current?.scrollBy({ left: 100, behavior: 'smooth' });
  };

  // Check if product is sold by carton (for hiding Available Sizes from spec sheet)
  // Only check unitsPerCarton or unitsPerSize - never use rawAttributes
  const isCartonProduct = (() => {
    if (!displayProduct) return false;
    if (displayProduct.unitsPerCarton && displayProduct.unitsPerCarton > 0) return true;
    if (displayProduct.unitsPerSize && Object.keys(displayProduct.unitsPerSize).length > 0) {
      const totalUnits = Object.values(displayProduct.unitsPerSize).reduce((sum: number, val: any) => sum + (typeof val === 'number' ? val : parseInt(String(val)) || 0), 0);
      if (totalUnits > 0) return true;
    }
    // Also check linked size chart
    if (linkedSizeChart?.unitsPerSize && Object.keys(linkedSizeChart.unitsPerSize).length > 0) {
      const totalUnits = Object.values(linkedSizeChart.unitsPerSize).reduce((sum: number, val: any) => sum + (typeof val === 'number' ? val : parseInt(String(val)) || 0), 0);
      if (totalUnits > 0) return true;
    }
    return false;
  })();

  // For carton products, get the carton count from rawAttributes (original Excel value)
  // If not available, calculate from totalStock / unitsPerCarton
  const cartonCount = (() => {
    if (!isCartonProduct || !displayProduct) return null;
    
    // First try rawAttributes.stock (original Excel carton count)
    if (displayProduct.rawAttributes?.stock) {
      const parsed = parseInt(displayProduct.rawAttributes.stock);
      if (!isNaN(parsed)) return parsed;
    }
    
    // Fallback: calculate from totalStock / unitsPerCarton
    const unitsPerCarton = displayProduct.unitsPerCarton;
    if (unitsPerCarton && unitsPerCarton > 0 && totalStock > 0) {
      return Math.round(totalStock / unitsPerCarton);
    }
    
    return null;
  })();

  // Build productFields from displayProduct so Available Sizes always reflects the selected variant
  const productFields = useMemo(() => [
    { label: "Brand", value: displayProduct.brand },
    { label: "Colourway", value: displayProduct.colourway },
    { label: "Gender", value: displayProduct.gender },
    { label: "Division", value: displayProduct.division },
    { label: "Age Group", value: displayProduct.ageGroup },
    { label: "Product Type", value: displayProduct.productType },
    { label: "Product Line", value: displayProduct.productLine },
    { label: "Sports Category", value: displayProduct.sportsCategory },
    { label: "Material Composition", value: displayProduct.materialComposition },
    { label: "Wholesale Price", value: displayProduct.wholesalePrice ? formatPrice(Number(displayProduct.wholesalePrice), displayProduct.baseCurrency || "USD") : null },
    { label: "Retail Price", value: displayProduct.retailPrice ? formatPrice(Number(displayProduct.retailPrice), displayProduct.baseCurrency || "USD") : null },
    { label: "MOQ", value: displayProduct.moq },
    { label: "Limit Order", value: displayProduct.limitOrder ? displayProduct.limitOrder.toString() : null },
    // For carton products, always show carton count (never fall back to total units); for regular products, show total units; hide for pre-order
    { label: isCartonProduct ? "Stock (Cartons)" : "Stock", value: displayProduct.isPreOrder ? null : (isCartonProduct ? (cartonCount !== null ? cartonCount.toString() : null) : totalStock.toString()) },
    // Available Sizes: always use displayProduct (selected variant) so sizes update when switching color variants
    { label: `Available Sizes${hasSizeConversion && detectedBaseStandard ? ` (${selectedSizeStandard})` : ''}`, value: isCartonProduct ? null : 'sizes', sizes: convertedSizes.map(s => s.displaySize), isSizes: true },
  ].filter(field => field.value && field.value !== ""), [
    displayProduct, convertedSizes, isCartonProduct, cartonCount, totalStock, hasSizeConversion,
    detectedBaseStandard, selectedSizeStandard, formatPrice
  ]);

  return (
    <div className="flex min-h-full min-h-screen w-full flex-col bg-white">
      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        {/* Breadcrumb Navigation with X Button */}
        <div className="px-4 sm:px-8 lg:px-12 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <nav className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-500 hover:text-gray-700 uppercase tracking-wide cursor-pointer"
              >
                Shop
              </button>
              <ChevronIcon className="w-4 h-4 text-gray-400" />
              <span className="text-gray-900 font-medium truncate max-w-[300px]">
                {displayProduct.name}
              </span>
            </nav>
            <button
              onClick={handleClose}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              aria-label="Close and go back"
              data-testid="button-close-product"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="px-4 sm:px-8 lg:px-12 py-8">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          {/* LEFT SIDE - Image (40% width) */}
          <div className="w-full lg:w-[40%]">
            {/* Main Image Container with Tooltip (admin only) */}
            {isAdmin ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative bg-white rounded-lg overflow-hidden aspect-square cursor-pointer">
                    <img
                      src={currentImage}
                      alt={displayProduct.name}
                      className="w-full h-full object-contain bg-gray-50"
                      data-testid="img-product-detail"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = defaultProductImage;
                      }}
                    />

                    {/* Navigation Arrows */}
                    {images.length > 1 && (
                      <>
                        <button
                          onClick={handlePrevImage}
                          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-md transition-all"
                          data-testid="button-prev-image"
                        >
                          <ChevronLeft className="w-5 h-5 text-gray-700" />
                        </button>
                        <button
                          onClick={handleNextImage}
                          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-md transition-all"
                          data-testid="button-next-image"
                        >
                          <ChevronRight className="w-5 h-5 text-gray-700" />
                        </button>
                      </>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent 
                  side="right" 
                  align="start"
                  className="max-w-[400px] max-h-[500px] overflow-y-auto bg-white border border-gray-200 shadow-lg p-3"
                >
                  <div className="text-xs font-semibold text-gray-900 mb-2 pb-1 border-b border-gray-200">
                    All Product Data
                  </div>
                  <div className="space-y-1">
                    {/* Core product fields */}
                    {[
                      ['ID', displayProduct.id],
                      ['SKU', displayProduct.sku],
                      ['Name', displayProduct.name],
                      ['Brand', displayProduct.brand],
                      ['Division', displayProduct.division],
                      ['Gender', displayProduct.gender],
                      ['Colourway', displayProduct.colourway],
                      ['Main Category', displayProduct.mainCategory],
                      ['Kids Gender', displayProduct.kidsGender],
                      ['Kids Age Group', displayProduct.kidsAgeGroup],
                      ['Is Pre-Order', displayProduct.isPreOrder ? 'Yes' : 'No'],
                      ['Collections', displayProduct.collections?.join(', ')],
                      ['Units Per Carton', displayProduct.unitsPerCarton],
                      ['Available Sizes', displayProduct.availableSizes?.map(s => `${s.size}(${s.stock})`).join(', ')],
                    ].filter(([, value]) => value !== null && value !== undefined && value !== '')
                      .map(([label, value], idx) => (
                        <div key={idx} className="flex text-xs">
                          <span className="font-medium text-gray-600 w-[35%] pr-2 truncate" title={String(label)}>
                            {label}:
                          </span>
                          <span className="text-gray-800 w-[65%] break-all text-[10px]">
                            {String(value)}
                          </span>
                        </div>
                      ))}
                    
                    {/* Image URLs section - always show all fields */}
                    <div className="text-xs font-semibold text-gray-900 mt-3 mb-1 pt-2 border-t border-gray-200">
                      Image URLs
                    </div>
                    {[
                      ['imageUrl (legacy)', displayProduct.imageUrl],
                      ['image1', displayProduct.image1],
                      ['image2', displayProduct.image2],
                      ['image3', displayProduct.image3],
                      ['image4', displayProduct.image4],
                    ].map(([label, value], idx) => (
                      <div key={`img-${idx}`} className="flex text-xs">
                        <span className="font-medium text-blue-600 w-[30%] pr-1 truncate" title={String(label)}>
                          {label}:
                        </span>
                        <span className={`w-[70%] break-all text-[9px] ${value ? 'text-gray-800' : 'text-gray-400 italic'}`}>
                          {value || 'null'}
                        </span>
                      </div>
                    ))}
                    
                    {/* Raw attributes section */}
                    {displayProduct.rawAttributes && Object.keys(displayProduct.rawAttributes).length > 0 && (
                      (() => {
                        const filteredAttrs = Object.entries(displayProduct.rawAttributes)
                          .filter(([key, value]) => {
                            const lowerKey = key.toLowerCase();
                            if (lowerKey.includes('sharedformula') || lowerKey.includes('formula')) return false;
                            if (typeof value === 'object') return false;
                            if (value === null || value === undefined || value === '') return false;
                            return true;
                          });
                        if (filteredAttrs.length === 0) return null;
                        return (
                          <>
                            <div className="text-xs font-semibold text-gray-900 mt-3 mb-1 pt-2 border-t border-gray-200">
                              Raw Attributes
                            </div>
                            {filteredAttrs.map(([key, value], idx) => (
                              <div key={`raw-${idx}`} className="flex text-xs">
                                <span className="font-medium text-gray-500 w-[35%] pr-2 truncate" title={key}>
                                  {key}:
                                </span>
                                <span className="text-gray-700 w-[65%] break-all text-[10px]">
                                  {String(value)}
                                </span>
                              </div>
                            ))}
                          </>
                        );
                      })()
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            ) : (
              <div className="relative bg-white rounded-lg overflow-hidden aspect-square">
                <img
                  src={currentImage}
                  alt={displayProduct.name}
                  className="w-full h-full object-contain bg-gray-50"
                  data-testid="img-product-detail"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = defaultProductImage;
                  }}
                />

                {/* Navigation Arrows */}
                {images.length > 1 && (
                  <>
                    <button
                      onClick={handlePrevImage}
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-md transition-all"
                      data-testid="button-prev-image"
                    >
                      <ChevronLeft className="w-5 h-5 text-gray-700" />
                    </button>
                    <button
                      onClick={handleNextImage}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-md transition-all"
                      data-testid="button-next-image"
                    >
                      <ChevronRight className="w-5 h-5 text-gray-700" />
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Image Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                      idx === currentImageIndex 
                        ? 'border-blue-600' 
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                    data-testid={`button-thumbnail-${idx}`}
                  >
                    <img
                      src={img || defaultProductImage}
                      alt={`${product.name} view ${idx + 1}`}
                      className="w-full h-full object-contain bg-gray-50"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = defaultProductImage;
                      }}
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Image Indicators (dots) */}
            {images.length > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      idx === currentImageIndex ? 'bg-gray-800 w-4' : 'bg-gray-300'
                    }`}
                    data-testid={`button-indicator-${idx}`}
                  />
                ))}
              </div>
            )}

            {/* Disclaimer */}
            <p className="text-xs text-gray-400 text-center mt-6 italic">
              The final product may differ in colour or style from the digital image
            </p>

            {/* Add to Cart Button - Toggle */}
            <button
              onClick={handleToggleCart}
              disabled={addItemsToDraftMutation.isPending || isCreatingDraft || removeItemsFromCartMutation.isPending}
              className={`w-full mt-6 py-3 px-6 font-medium rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                isProductInCart 
                  ? 'bg-green-600 hover:bg-green-700 text-white' 
                  : 'bg-gray-900 hover:bg-gray-800 text-white'
              }`}
              data-testid="button-add-to-cart"
            >
              {removeItemsFromCartMutation.isPending ? (
                <>
                  <ShoppingCart className="w-5 h-5" />
                  Removing...
                </>
              ) : isProductInCart ? (
                <>
                  <Check className="w-5 h-5" />
                  Added
                </>
              ) : addItemsToDraftMutation.isPending || isCreatingDraft ? (
                <>
                  <ShoppingCart className="w-5 h-5" />
                  Adding...
                </>
              ) : (
                <>
                  <ShoppingCart className="w-5 h-5" />
                  Add to Cart
                </>
              )}
            </button>
          </div>

          {/* RIGHT SIDE - Product Information (60% width) */}
          <div className="w-full lg:w-[60%]">
            {/* Header Section */}
            <div className="mb-6">
              {/* Title - 32px bold */}
              <h1 
                className="text-[32px] font-bold text-gray-900 leading-tight"
                style={{ fontSize: '32px' }}
                data-testid="text-product-title"
              >
                {displayProduct.name}
              </h1>

              {/* Subtitle - 16px medium */}
              <h2 
                className="text-[16px] font-medium text-gray-600 mt-1"
                style={{ fontSize: '16px' }}
                data-testid="text-product-subtitle"
              >
                {displayProduct.sku || 'N/A'}
              </h2>

              {/* Variants - all products with same name, one per UPC */}
              {productVariants.length > 1 && (
                <div className="mt-4" data-testid="variant-selector">
                  <p className="text-xs font-medium uppercase text-gray-500 mb-2">
                    Variants ({productVariants.length})
                  </p>
                  <div className="relative">
                    {variantStripCanScrollLeft && (
                    <button
                      onClick={variantStripScrollLeft}
                      className="absolute left-1 top-1/2 -translate-y-1/2 z-20 w-6 h-6 flex items-center justify-center bg-white shadow-md rounded-full hover:bg-gray-50 transition-all border border-gray-100"
                      aria-label="Scroll left"
                    >
                      <ChevronLeft className="w-3.5 h-3.5 text-gray-600" />
                    </button>
                  )}
                  {variantStripCanScrollRight && (
                    <>
                      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none z-10" />
                      <button
                        onClick={variantStripScrollRight}
                        className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-6 h-6 flex items-center justify-center bg-white shadow-md rounded-full hover:bg-gray-50 transition-all border border-gray-100"
                        aria-label="Scroll right"
                      >
                        <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                      </button>
                    </>
                  )}
                  <div
                    ref={variantStripRef}
                    onScroll={checkVariantStripScroll}
                    className="flex items-center gap-1.5 overflow-x-auto py-2 px-1 touch-pan-x"
                    style={{ scrollbarWidth: 'none' }}
                  >
                    {productVariants.map((variant) => {
                      const isSelected = variant.id === displayProduct.id;
                      const variantLabel = variant.sku || variant.colourway || variant.id;
                      const variantInCart = isVariantInCart(variant);
                      return (
                        <div key={variant.id} className="relative flex-shrink-0">
                          <button
                            onClick={() => !isSelected && navigateToVariant(variant)}
                            className={`w-12 h-12 rounded-lg transition-all overflow-hidden border-2 ${
                              isSelected
                                ? 'border-gray-900 shadow-md'
                                : 'border-transparent hover:border-gray-300'
                            }`}
                            aria-label={variantLabel}
                            title={variantLabel}
                            data-testid={`variant-${variant.id}`}
                          >
                            <img
                              src={variant.image1 || defaultProductImage}
                              alt={variantLabel}
                              className="w-full h-full object-contain bg-gray-50"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = defaultProductImage;
                              }}
                            />
                          </button>
                          <button
                            onClick={(e) => handleAddVariantToCart(variant, e)}
                            className={`absolute -top-0.5 -right-0.5 h-4 flex items-center justify-center rounded-full shadow-sm transition-all duration-300 ease-out ${
                              variantInCart
                                ? "bg-gradient-to-br from-[#FE4438] to-[#FE4438] px-1.5"
                                : "w-4 bg-white border border-gray-200 hover:scale-110 hover:border-[#FE4438]"
                            }`}
                            data-testid={`button-add-to-cart-variant-${variant.id}`}
                          >
                            {variantInCart ? (
                              <Check className="w-2 h-2 text-white" strokeWidth={3} />
                            ) : (
                              <ShoppingCart className="w-2 h-2 text-gray-500" strokeWidth={2.5} />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  </div>
                </div>
              )}

              {/* Sold by Carton Info - Expandable */}
              {(() => {
                // Get carton units - ALWAYS prioritize unitsPerSize from carton config over stored unitsPerCarton
                // NEVER use rawAttributes - unitsPerCarton should come from carton config upload step
                let cartonUnits: number | null = null;
                
                // Priority 1: Recalculate from product's unitsPerSize (from carton config - most accurate)
                if (displayProduct.unitsPerSize && Object.keys(displayProduct.unitsPerSize).length > 0) {
                  cartonUnits = Object.values(displayProduct.unitsPerSize).reduce((sum: number, val: any) => sum + (typeof val === 'number' ? val : parseInt(String(val)) || 0), 0);
                }
                
                // Priority 2: Recalculate from linked size chart's unitsPerSize
                if ((!cartonUnits || cartonUnits === 0) && linkedSizeChart?.unitsPerSize && Object.keys(linkedSizeChart.unitsPerSize).length > 0) {
                  cartonUnits = Object.values(linkedSizeChart.unitsPerSize).reduce((sum: number, val: any) => sum + (typeof val === 'number' ? val : parseInt(String(val)) || 0), 0);
                }
                
                // Priority 3: Use stored unitsPerCarton only if no unitsPerSize available
                if ((!cartonUnits || cartonUnits === 0) && displayProduct.unitsPerCarton && displayProduct.unitsPerCarton > 0) {
                  cartonUnits = displayProduct.unitsPerCarton;
                }
                
                if (!cartonUnits || cartonUnits <= 0) return null;
                
                return (
                  <Collapsible open={cartonSizesOpen} onOpenChange={setCartonSizesOpen}>
                    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg overflow-hidden" data-testid="carton-info">
                      <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-amber-100 transition-colors">
                        <div className="flex items-center gap-2">
                          <Package className="w-5 h-5 text-amber-600" />
                          <span className="font-semibold text-amber-800">Sold by Carton</span>
                          <span className="text-sm text-amber-600 ml-2">
                            ({cartonUnits} units per box)
                          </span>
                        </div>
                        <ChevronDown className={`w-5 h-5 text-amber-600 transition-transform duration-200 ${cartonSizesOpen ? 'rotate-180' : ''}`} />
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent>
                        <div className="px-4 pb-4 border-t border-amber-200">
                          <div className="pt-3 space-y-3">
                            {/* Carton Summary */}
                            <div className="text-sm text-amber-700">
                              <span className="font-medium">Total units per carton:</span> {cartonUnits}
                            </div>
                            
                            {/* Size Grid - Show carton contents with units per size */}
                            {(() => {
                              // Priority 1: Use linked size chart's sizes and unitsPerSize (most reliable for pre-order carton products)
                              // Priority 2: Use product's own unitsPerSize field (set during stock upload with carton config)
                              // Priority 3: Calculate from stock data
                              const productUnitsPerSize = displayProduct.unitsPerSize || {};
                              const hasProductUnitsPerSize = Object.keys(productUnitsPerSize).length > 0 && 
                                Object.values(productUnitsPerSize).some((v: any) => v > 0);
                              
                              const sizeChartSizes = linkedSizeChart?.sizes || [];
                              const sizeChartUnitsPerSize = linkedSizeChart?.unitsPerSize || {};
                              const hasSizeChartData = sizeChartSizes.length > 0;
                              
                              // Get carton count from rawAttributes.stock (original Excel stock value = number of cartons)
                              const cartonCount = (() => {
                                if (!displayProduct?.rawAttributes?.stock) return 0;
                                const stockVal = displayProduct.rawAttributes.stock;
                                const parsed = typeof stockVal === 'string' ? parseInt(stockVal) : stockVal;
                                return isNaN(parsed) ? 0 : parsed;
                              })();
                              
                              // Determine which sizes to display
                              // Priority 1: Size chart (most reliable - comes from uploaded carton config)
                              // Priority 2: Product's own unitsPerSize (from carton config during stock upload)
                              // Priority 3: Calculate unitsPerSize from stock data
                              let rawSizes: { size: string; displaySize: string; units: number }[] = [];
                              
                              if (hasSizeChartData) {
                                // Use linked size chart - this is the most reliable source for pre-order carton products
                                rawSizes = sizeChartSizes.map((size: string) => {
                                  // Try multiple key formats to find units (handle string/number mismatches)
                                  const sizeStr = String(size);
                                  let units = sizeChartUnitsPerSize[sizeStr] || 
                                             sizeChartUnitsPerSize[size] ||
                                             sizeChartUnitsPerSize[parseFloat(sizeStr).toString()] ||
                                             0;
                                  // Ensure units is a number
                                  units = typeof units === 'number' ? units : (parseInt(String(units)) || 0);
                                  return {
                                    size,
                                    displaySize: convertSize(size),
                                    units
                                  };
                                });
                              } else if (hasProductUnitsPerSize) {
                                // Use product's own unitsPerSize field
                                rawSizes = Object.entries(productUnitsPerSize).map(([size, units]) => ({
                                  size,
                                  displaySize: convertSize(size),
                                  units: typeof units === 'number' ? units : 0
                                }));
                              } else {
                                // Fallback: calculate from stock data
                                rawSizes = displayProduct.availableSizes?.map(s => {
                                  const totalStock = typeof s.stock === 'string' ? parseInt(s.stock) : (s.stock || 0);
                                  const unitsPerCarton = cartonCount > 0 ? Math.round(totalStock / cartonCount) : 0;
                                  return {
                                    size: s.size,
                                    displaySize: convertSize(s.size),
                                    units: unitsPerCarton
                                  };
                                }) || [];
                              }
                              
                              // Sort sizes numerically
                              const sizesToDisplay = rawSizes.sort((a: any, b: any) => {
                                const numA = parseFloat(a.size);
                                const numB = parseFloat(b.size);
                                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                                return String(a.size).localeCompare(String(b.size));
                              });
                              
                              const hasUnitData = sizesToDisplay.some((s: any) => s.units > 0);
                              
                              if (sizesToDisplay.length === 0) return null;
                              
                              return (
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-medium text-amber-800 uppercase tracking-wide">
                                      {hasUnitData ? 'Sizes & Units per Carton' : 'Sizes Included'}
                                      {hasSizeChartData && <span className="ml-2 text-green-600">(FROM CARTON CONFIG)</span>}
                                      {!hasSizeChartData && hasProductUnitsPerSize && <span className="ml-2 text-green-600">(from product data)</span>}
                                    </p>
                                    {/* Size standard indicator for carton section */}
                                    {hasSizeConversion && (
                                      <span className="text-xs text-amber-600 font-medium">
                                        ({selectedSizeStandard})
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {sizesToDisplay.map((sizeData: any, idx: number) => (
                                      <div 
                                        key={idx}
                                        className="px-3 py-2 bg-white rounded-md border border-amber-200 shadow-sm text-center min-w-[50px]"
                                        data-testid={`carton-size-${sizeData.size}`}
                                      >
                                        <div className="text-sm font-bold text-gray-900">
                                          {sizeData.displaySize}
                                        </div>
                                        <div className="text-xs text-amber-600 mt-0.5">
                                          {sizeData.units > 0 ? `${sizeData.units} units` : '0 units'}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  {!hasUnitData && !hasSizeChartData && !hasProductUnitsPerSize && (
                                    <p className="text-xs text-amber-600 mt-2 italic">
                                      Per-size unit breakdown not available for this product
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
                            
                            {/* Carton Details section removed - we only use values from carton config, not rawAttributes */}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })()}
            </div>

            {/* Product Spec Sheet - 24px section spacing */}
            <div className="border-t border-gray-200 pt-6" style={{ marginTop: '24px' }}>
              {/* Size Standard Switcher - shown for all products with sizes */}
              {displayProduct?.availableSizes?.length && (availableSizeStandards.EU || availableSizeStandards.US || availableSizeStandards.UK) && (
                <div className="mb-4 pb-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">Size Standard:</span>
                    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1" data-testid="size-standard-switcher">
                      {(['EU', 'US', 'UK'] as const).map((standard) => {
                        const isAvailable = availableSizeStandards[standard];
                        return (
                          <button
                            key={standard}
                            onClick={() => isAvailable && setSelectedSizeStandard(standard)}
                            disabled={!isAvailable}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                              selectedSizeStandard === standard
                                ? 'bg-white text-gray-900 shadow-sm'
                                : isAvailable
                                  ? 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                                  : 'text-gray-300 cursor-not-allowed'
                            }`}
                            data-testid={`size-standard-${standard.toLowerCase()}`}
                          >
                            {standard}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              
              {productFields.map((field, idx) => (
                <div 
                  key={field.isSizes ? `sizes-${displayProduct?.id}` : idx}
                  className={field.isSizes ? "flex flex-col gap-2" : "flex"}
                  style={{ 
                    paddingTop: idx === 0 ? '0' : '5px',
                    paddingBottom: '5px',
                    fontSize: '14px',
                    lineHeight: '21px'
                  }}
                  data-testid={`row-${field.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <span 
                    className={field.isSizes ? "font-medium text-gray-900" : "w-[40%] sm:w-[35%] font-medium text-gray-900 pr-4"}
                    style={{ fontSize: '14px', lineHeight: '21px' }}
                  >
                    {field.label}
                  </span>
                  {field.isSizes && field.sizes ? (
                    <div className="flex flex-wrap gap-1.5">
                      {field.sizes.map((size: string, sizeIdx: number) => (
                        <span 
                          key={sizeIdx}
                          className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-medium border border-gray-200 hover:bg-gray-200 transition-colors"
                        >
                          {size}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span 
                      className="w-[60%] sm:w-[65%] text-gray-600 break-words"
                      style={{ fontSize: '14px', lineHeight: '21px' }}
                    >
                      {field.value}
                    </span>
                  )}
                </div>
              ))}

              {/* Product Description — same row style as the properties above */}
              {displayProduct.description && displayProduct.description.trim() !== "" && displayProduct.description.trim().toLowerCase() !== "pre-order item" && (
                <div
                  className="flex"
                  style={{
                    paddingTop: '5px',
                    paddingBottom: '5px',
                    fontSize: '14px',
                    lineHeight: '21px',
                  }}
                  data-testid="row-description"
                >
                  <span
                    className="w-[40%] sm:w-[35%] font-medium text-gray-900 pr-4"
                    style={{ fontSize: '14px', lineHeight: '21px' }}
                  >
                    Description
                  </span>
                  <span
                    className="w-[60%] sm:w-[65%] text-gray-600 break-words whitespace-pre-line"
                    style={{ fontSize: '14px', lineHeight: '21px' }}
                  >
                    {displayProduct.description}
                  </span>
                </div>
              )}
            </div>

            </div>
        </div>
      </div>
      </div>
    </div>
  );
}
