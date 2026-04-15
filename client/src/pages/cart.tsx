
import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Order, Product, Brand, User, PaymentMethod, DeliveryMethod } from "@shared/schema";
import { PAYMENT_METHODS, DELIVERY_METHODS } from "@shared/schema";
import type { ShopCartProduct } from "@/components/shop/ShopCartTable";
import { ShopCartTable } from "@/components/shop/ShopCartTable";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2, Send, Search, User as UserIcon, Save } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCartContext } from "@/hooks/useCartContext";
import { getStoredScrollPosition } from "@/hooks/usePageState";
import {
  readShopOrderEditSession,
  clearShopOrderEditSession,
} from "@/lib/shopOrderEditSession";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SizeStandard = 'EU' | 'US' | 'UK';

export default function CartPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const fromOrderHistory = useMemo(
    () => new URLSearchParams(searchString).get("from") === "order-history",
    [searchString]
  );
  const { toast } = useToast();
  const { setOpenCartId, createDraft, drafts, draftsQueryKey, deleteDraft } = useCartContext();
  const { user, isAccountManager, isAdmin } = useAuth();
  const { getCurrencySymbol, userCurrency } = useCurrency();

  // Account Manager submission dialog state
  const [showAMSubmitDialog, setShowAMSubmitDialog] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; username: string; displayName: string | null; email: string | null } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod | "">("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [pendingOrderItems, setPendingOrderItems] = useState<any[]>([]);

  // Search customers query (for AM dialog)
  const { data: searchedCustomers = [], isLoading: isSearchingCustomers } = useQuery<{ id: string; username: string; displayName: string | null; email: string | null }[]>({
    queryKey: ["/api/staff/customers/search", customerSearch],
    queryFn: async () => {
      const res = await fetch(`/api/staff/customers/search?q=${encodeURIComponent(customerSearch)}`);
      if (!res.ok) throw new Error("Failed to search customers");
      return res.json();
    },
    enabled: showAMSubmitDialog && customerSearch.length >= 1,
  });

  const draft = drafts.find((d) => d.id === draftId);

  const shopOrderEdit = useMemo(() => {
    const sess = readShopOrderEditSession();
    if (!sess || !draftId || sess.draftId !== draftId) return null;
    return sess;
  }, [draftId]);

  // Extract unique product IDs from the draft items
  const cartProductIds = useMemo(() => {
    if (!draft?.items) return [];
    return [...new Set(draft.items.map((item) => item.productId))];
  }, [draft?.items]);

  // Fetch only the products referenced in the cart (no filters/limits/collection exclusion)
  const { data: products = [], isLoading: isProductsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products/by-ids", cartProductIds],
    queryFn: async () => {
      if (cartProductIds.length === 0) return [];
      const res = await fetch("/api/products/by-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: cartProductIds }),
      });
      if (!res.ok) throw new Error("Failed to fetch cart products");
      return res.json();
    },
    enabled: cartProductIds.length > 0,
  });

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

  // Local UI state for cart products
  const [localCart, setLocalCart] = useState<ShopCartProduct[]>([]);

  // Size standard switcher state
  const [selectedSizeStandard, setSelectedSizeStandard] = useState<SizeStandard>('EU');

  // Get unique brands from cart products
  const cartBrands = useMemo(() => {
    const brandNames = new Set<string>();
    localCart.forEach(product => {
      if (product.brand) brandNames.add(product.brand);
    });
    return Array.from(brandNames);
  }, [localCart]);

  // Get size standards from the first brand in cart (for simplicity)
  // Note: product.brand contains the brand ID (UUID), not the brand name
  const primaryBrand = useMemo(() => {
    if (cartBrands.length === 0 || brands.length === 0) return null;
    // Match by brand ID first, then fall back to name match
    return brands.find(b => b.id === cartBrands[0]) || 
           brands.find(b => b.name?.toLowerCase() === cartBrands[0]?.toLowerCase()) || 
           null;
  }, [cartBrands, brands]);

  // Normalize size for comparison
  const normalizeSize = useCallback((size: string): string => {
    if (!size) return '';
    let normalized = String(size).trim().toUpperCase();
    normalized = normalized.replace(/^(US|UK|EU|SIZE)\s*/i, '');
    normalized = normalized.replace(/\s*(M|W|MEN|WOMEN)$/i, '');
    normalized = normalized.replace(/(\d+)\s*[/]\s*2/, '$1.5');
    normalized = normalized.replace(/\s+/g, '');
    return normalized;
  }, []);

  // Get primary gender from cart products for size standard matching
  const primaryGender = useMemo(() => {
    if (localCart.length === 0) return null;
    // Count occurrences of each gender
    const genderCounts: Record<string, number> = {};
    localCart.forEach(product => {
      const gender = product.gender || 'Other';
      genderCounts[gender] = (genderCounts[gender] || 0) + 1;
    });
    // Return the most common gender
    let maxCount = 0;
    let primaryGender = null;
    for (const [gender, count] of Object.entries(genderCounts)) {
      if (count > maxCount) {
        maxCount = count;
        primaryGender = gender;
      }
    }
    return primaryGender;
  }, [localCart]);

  // Get size standards matching the cart products' category from brand
  // Must match by actual sizes in cart, not just gender name
  const brandSizeStandards = useMemo(() => {
    if (!primaryBrand?.sizeStandards) return null;
    const standards = primaryBrand.sizeStandards as Record<string, { EU?: string[]; US?: string[]; UK?: string[] }>;
    const categories = Object.keys(standards);
    if (categories.length === 0) return null;
    
    // Collect all sizes from cart for matching
    const cartSizes: string[] = [];
    localCart.forEach(product => {
      product.sizes.forEach(size => cartSizes.push(normalizeSize(size)));
    });
    
    // Find the category that best matches the cart sizes
    let bestCategory: string | null = null;
    let bestMatchCount = 0;
    
    for (const category of categories) {
      const catStandards = standards[category];
      if (!catStandards) continue;
      
      // Check all three standards (EU, US, UK) for matches
      let categoryMatchCount = 0;
      for (const standard of ['EU', 'US', 'UK'] as const) {
        const standardSizes = catStandards[standard] || [];
        const normalizedSizes = standardSizes.filter(s => s !== '-').map(s => normalizeSize(s));
        const matches = cartSizes.filter(size => normalizedSizes.includes(size)).length;
        if (matches > categoryMatchCount) {
          categoryMatchCount = matches;
        }
      }
      
      if (categoryMatchCount > bestMatchCount) {
        bestMatchCount = categoryMatchCount;
        bestCategory = category;
      }
    }
    
    if (bestCategory && standards[bestCategory]) {
      console.log('[BrandSizeStandards] Matched category:', bestCategory, 'with', bestMatchCount, 'size matches');
      return standards[bestCategory];
    }
    
    // Fallback to first available category's standards
    return standards[categories[0]] || null;
  }, [primaryBrand, localCart, normalizeSize]);

  // Detect which standard the cart sizes are in
  const detectedBaseStandard = useMemo((): SizeStandard | null => {
    if (!brandSizeStandards || localCart.length === 0) return null;
    
    // Collect all sizes from cart
    const cartSizes: string[] = [];
    localCart.forEach(product => {
      product.sizes.forEach(size => cartSizes.push(normalizeSize(size)));
    });
    if (cartSizes.length === 0) return null;
    
    const standards: SizeStandard[] = ['EU', 'US', 'UK'];
    let bestMatch: { standard: SizeStandard; matches: number } | null = null;
    
    for (const standard of standards) {
      const standardSizes = brandSizeStandards[standard] || [];
      if (standardSizes.length === 0) continue;
      // Filter out "-" placeholder values when matching
      const normalizedStandardSizes = standardSizes
        .filter(s => s !== '-')
        .map(s => normalizeSize(s));
      const matches = cartSizes.filter(size => normalizedStandardSizes.includes(size)).length;
      if (matches > 0 && (!bestMatch || matches > bestMatch.matches)) {
        bestMatch = { standard, matches };
      }
    }
    
    if (bestMatch && bestMatch.matches >= Math.floor(cartSizes.length * 0.3)) {
      return bestMatch.standard;
    }
    return null;
  }, [brandSizeStandards, localCart, normalizeSize]);

  // Check which standards are available for conversion
  const availableSizeStandards = useMemo(() => {
    if (!brandSizeStandards || !detectedBaseStandard) {
      return { EU: false, US: false, UK: false };
    }
    const baseLen = (brandSizeStandards[detectedBaseStandard] || []).length;
    if (baseLen === 0) return { EU: false, US: false, UK: false };
    
    // Allow conversion if both arrays have sizes (use index-based matching)
    const euLen = (brandSizeStandards.EU || []).length;
    const usLen = (brandSizeStandards.US || []).length;
    const ukLen = (brandSizeStandards.UK || []).length;
    
    return {
      EU: euLen > 0,
      US: usLen > 0,
      UK: ukLen > 0
    };
  }, [brandSizeStandards, detectedBaseStandard]);

  // Check if size conversion is available
  const hasSizeConversion = useMemo(() => {
    if (!detectedBaseStandard) return false;
    const otherStandards = (['EU', 'US', 'UK'] as SizeStandard[]).filter(s => s !== detectedBaseStandard);
    return otherStandards.some(s => availableSizeStandards[s]);
  }, [detectedBaseStandard, availableSizeStandards]);

  // Convert size function
  const convertSize = useCallback((originalSize: string): string => {
    console.log('[ConvertSize] Called with:', originalSize, 'selectedStandard:', selectedSizeStandard, 'detectedBase:', detectedBaseStandard);
    console.log('[ConvertSize] brandSizeStandards:', brandSizeStandards);
    if (!brandSizeStandards || !detectedBaseStandard) {
      console.log('[ConvertSize] No brandSizeStandards or detectedBaseStandard, returning original');
      return originalSize;
    }
    if (selectedSizeStandard === detectedBaseStandard) {
      console.log('[ConvertSize] Same standard, returning original');
      return originalSize;
    }
    if (!availableSizeStandards[selectedSizeStandard]) {
      console.log('[ConvertSize] Standard not available, returning original');
      return originalSize;
    }
    
    const baseSizes = brandSizeStandards[detectedBaseStandard] || [];
    const targetSizes = brandSizeStandards[selectedSizeStandard] || [];
    const normalizedOriginal = normalizeSize(originalSize);
    const index = baseSizes.findIndex(s => normalizeSize(s) === normalizedOriginal);
    
    console.log('[ConvertSize] baseSizes:', baseSizes, 'targetSizes:', targetSizes, 'index:', index);
    
    if (index === -1 || !targetSizes[index] || targetSizes[index] === '-') {
      console.log('[ConvertSize] No valid target, returning original');
      return originalSize;
    }
    console.log('[ConvertSize] Converting', originalSize, 'to', targetSizes[index]);
    return targetSizes[index];
  }, [brandSizeStandards, selectedSizeStandard, detectedBaseStandard, availableSizeStandards, normalizeSize]);

  // Sync selectedSizeStandard with detected base on first detection
  useEffect(() => {
    if (detectedBaseStandard && selectedSizeStandard !== detectedBaseStandard) {
      setSelectedSizeStandard(detectedBaseStandard);
    }
  }, [detectedBaseStandard]);

  // Transform draft to cart model
  const transformDraftToCart = useCallback((draft: Order, products: Product[]): ShopCartProduct[] => {
    if (!draft || !draft.items) return [];
    const grouped = new Map<string, ShopCartProduct>();
    draft.items.forEach((item) => {
      const key = item.productId;
      const product = products.find((p) => p.id === item.productId);
      const displayColor = product?.colourway || 'Default';
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          sku: item.sku || "",
          name: item.productName || "",
          color: displayColor,
          image1: "",
          price: item.unitPrice,
          sizes: [],
          quantities: {},
          availableSizes: {},
          isPreOrder: false,
          brand: item.brand || product?.brand || "",
          unitsPerCarton: product?.unitsPerCarton || 0,
          unitsPerSize: product?.unitsPerSize || {},
          gender: product?.gender || 'Other',
          mainCategory: product?.mainCategory || '',
          kidsAgeGroup: product?.kidsAgeGroup || '',
          limitOrder: product?.limitOrder ?? undefined,
        });
      }
      const cartProduct = grouped.get(key)!;
      cartProduct.sizes.push(item.size);
      cartProduct.quantities[item.size] = item.quantity;

      if (product) {
        cartProduct.image1 = product.image1;
        cartProduct.isPreOrder = product.isPreOrder;
        cartProduct.unitsPerCarton = product.unitsPerCarton || 0;
        cartProduct.unitsPerSize = product.unitsPerSize || {};
        cartProduct.gender = product.gender || 'Other';
        cartProduct.limitOrder = product.limitOrder ?? undefined;
        cartProduct.limitOrderPerSize = (product.availableSizes as { size: string; limitOrder?: number }[] | undefined)
          ? Object.fromEntries(
              (product.availableSizes as { size: string; limitOrder?: number }[])
                .filter((s) => s.limitOrder != null && s.limitOrder >= 1)
                .map((s) => [s.size, s.limitOrder!])
            )
          : undefined;
        cartProduct.supportedSizes = (product.availableSizes as { size: string }[] | undefined)?.map((s) => s.size);
        const sizeObj = (product.availableSizes as { size: string; stock?: number }[]).find(
          (s) => s.size === item.size,
        );
        cartProduct.availableSizes[item.size] = sizeObj?.stock || 0;
      }
    });
    return Array.from(grouped.values());
  }, []);

  // Update local cart when draft or products change (but only on initial load, not from mutations)
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(undefined);
  
  // Reset initialization when draftId changes (user navigated to different cart)
  useEffect(() => {
    if (draftId !== currentDraftId) {
      setIsInitialized(false);
      setCurrentDraftId(draftId);
    }
  }, [draftId, currentDraftId]);
  
  useEffect(() => {
    if (!draft || isInitialized) return;
    // Empty cart: no product IDs → products query is disabled; still initialize local cart.
    // Non-empty: wait until the by-ids fetch finishes (even if it returns fewer/no rows).
    const needsProductFetch = cartProductIds.length > 0;
    if (needsProductFetch && isProductsLoading) return;
    setLocalCart(transformDraftToCart(draft, products));
    setIsInitialized(true);
  }, [
    draft,
    products,
    transformDraftToCart,
    isInitialized,
    cartProductIds.length,
    isProductsLoading,
  ]);

  // Clear cart mutation
  const clearCartMutation = useMutation({
    mutationFn: async (draftId: string) => {
      const res = await apiRequest(`/api/orders/${draftId}/clear`, "POST");
      return res.json() as Promise<Order>;
    },
    onSuccess: (updatedDraft) => {
      // Update cache directly instead of invalidating
      queryClient.setQueryData<Order[]>(draftsQueryKey, (oldDrafts) => {
        if (!oldDrafts) return oldDrafts;
        return oldDrafts.map(d => d.id === updatedDraft.id ? updatedDraft : d);
      });
      toast({
        title: "Cart Cleared",
        description: "All products have been removed from cart",
      });
    },
    onError: (_, draftId) => {
      // Rollback optimistic update
      if (draft) {
        setLocalCart(transformDraftToCart(draft, products));
      }
      toast({
        title: "Error",
        description: "Failed to clear cart",
        variant: "destructive",
      });
    },
  });

  // Submit cart mutation - sends current cart items to ensure latest values are saved
  const submitCartMutation = useMutation({
    mutationFn: async ({ draftId, items, targetUserId, paymentMethod, deliveryMethod, discountPercent }: { 
      draftId: string; 
      items: any[]; 
      targetUserId?: string;
      paymentMethod?: string;
      deliveryMethod?: string;
      discountPercent?: string;
    }) => {
      const res = await apiRequest(`/api/orders/${draftId}/submit`, "POST", { 
        items,
        targetUserId,
        paymentMethod,
        deliveryMethod,
        discountPercent: discountPercent ? parseFloat(discountPercent) : undefined
      });
      return res.json() as Promise<Order>;
    },
    onSuccess: (submittedOrder) => {
      // Update the order in drafts cache with its new status (now 'pending')
      queryClient.setQueryData<Order[]>(draftsQueryKey, (oldDrafts) => {
        if (!oldDrafts) return oldDrafts;
        return oldDrafts.map(d => d.id === submittedOrder.id ? submittedOrder : d);
      });
      // Clear the open cart so products are unselected in shop page
      setOpenCartId(null);
      // Invalidate orders caches so Order History updates immediately
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      
      // Check if there are any remaining draft carts (excluding pending/submitted)
      const remainingDrafts = drafts.filter(d => d.id !== submittedOrder.id && d.status === 'draft');
      if (remainingDrafts.length === 0) {
        // Create a new default cart if no draft carts remain (default to stock)
        createDraft("Basic Cart", "stock");
      }
      
      toast({
        title: "Cart Submitted",
        description: "Your order has been submitted for admin approval.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit cart for approval",
        variant: "destructive",
      });
    },
  });

  const updateSubmittedOrderMutation = useMutation({
    mutationFn: async ({
      sourceOrderId,
      items,
    }: {
      sourceOrderId: string;
      draftId: string;
      items: any[];
    }) => {
      const res = await apiRequest(`/api/orders/${sourceOrderId}/items`, "PATCH", { items });
      return res.json() as Promise<Order>;
    },
    onSuccess: async (updatedOrder, variables) => {
      clearShopOrderEditSession();
      deleteDraft(variables.draftId);

      queryClient.setQueryData<Order[]>(["/api/admin/orders"], (old) => {
        if (!old?.length) return old;
        const idx = old.findIndex((o) => o.id === updatedOrder.id);
        if (idx < 0) return old;
        const next = [...old];
        const prev = next[idx] as any;
        const patch = updatedOrder as any;
        const merged = { ...prev, ...patch };
        if (patch.workflowStage == null && prev.workflowStage != null) {
          merged.workflowStage = prev.workflowStage;
        }
        if (patch.workflow_stage == null && prev.workflow_stage != null) {
          merged.workflow_stage = prev.workflow_stage;
        }
        next[idx] = merged;
        return next;
      });

      await queryClient.invalidateQueries({ queryKey: draftsQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Order updated",
        description: "Changes were saved to the submitted order.",
      });
      const r = user?.role;
      if (r === "sales") navigate("/sales-dashboard");
      else if (r === "finance") navigate("/finance-dashboard");
      else if (r === "admin") navigate("/admin/orders");
      else navigate("/account-manager");
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error?.message || "Could not update the order.",
        variant: "destructive",
      });
    },
  });

  // Bulk quantity change mutation
  const bulkQuantityChangeMutation = useMutation({
    mutationFn: async ({ draftId, updates }: { draftId: string; updates: any[] }) => {
      const res = await apiRequest(`/api/orders/${draftId}/items/bulk`, "PATCH", {
        updates,
      });
      return res.json() as Promise<Order>;
    },
    onSuccess: (updatedDraft) => {
      // Update cache directly instead of invalidating
      queryClient.setQueryData<Order[]>(draftsQueryKey, (oldDrafts) => {
        if (!oldDrafts) return oldDrafts;
        return oldDrafts.map(d => d.id === updatedDraft.id ? updatedDraft : d);
      });
      // Don't sync localCart here - optimistic update is already applied
      // Syncing causes flashing when multiple mutations run in parallel
    },
    onError: () => {
      // Rollback optimistic update
      if (draft) {
        setLocalCart(transformDraftToCart(draft, products));
      }
      toast({
        title: "Error",
        description: "Failed to update quantities",
        variant: "destructive",
      });
    },
  });

  // Single quantity change mutation
  const quantityChangeMutation = useMutation({
    mutationFn: async ({ draftId, itemIndex, item }: { 
      draftId: string; 
      itemIndex: number; 
      item: any;
    }) => {
      const res = await apiRequest(`/api/orders/${draftId}/items/${itemIndex}`, "PATCH", item);
      return res.json() as Promise<Order>;
    },
    onSuccess: (updatedDraft) => {
      // Update cache directly instead of invalidating
      queryClient.setQueryData<Order[]>(draftsQueryKey, (oldDrafts) => {
        if (!oldDrafts) return oldDrafts;
        return oldDrafts.map(d => d.id === updatedDraft.id ? updatedDraft : d);
      });
      // Don't sync localCart here - optimistic update is already applied
    },
    onError: () => {
      // Rollback optimistic update
      if (draft) {
        setLocalCart(transformDraftToCart(draft, products));
      }
      toast({
        title: "Error",
        description: "Failed to update quantity",
        variant: "destructive",
      });
    },
  });

  // Add new item mutation (supports single or multiple items)
  const addItemMutation = useMutation({
    mutationFn: async ({ draftId, items }: { draftId: string; items: any[] }) => {
      const res = await apiRequest(`/api/orders/${draftId}/items`, "POST", {
        items,
      });
      return res.json() as Promise<Order>;
    },
    onSuccess: (updatedDraft) => {
      // Update cache directly instead of invalidating
      queryClient.setQueryData<Order[]>(draftsQueryKey, (oldDrafts) => {
        if (!oldDrafts) return oldDrafts;
        return oldDrafts.map(d => d.id === updatedDraft.id ? updatedDraft : d);
      });
      // Don't sync localCart here - optimistic update is already applied
      // Syncing causes flashing when multiple mutations run in parallel
    },
    onError: () => {
      // Rollback optimistic update
      if (draft) {
        setLocalCart(transformDraftToCart(draft, products));
      }
      toast({
        title: "Error",
        description: "Failed to add size to cart",
        variant: "destructive",
      });
    },
  });

  // Remove product mutation
  const removeProductMutation = useMutation({
    mutationFn: async ({ draftId, productId }: { 
      draftId: string; 
      productId: string; 
    }) => {
      const res = await apiRequest(
        `/api/orders/${draftId}/products/${productId}`,
        "DELETE",
      );
      return res.json() as Promise<Order>;
    },
    onSuccess: (updatedDraft) => {
      // Update cache directly instead of invalidating
      queryClient.setQueryData<Order[]>(draftsQueryKey, (oldDrafts) => {
        if (!oldDrafts) return oldDrafts;
        return oldDrafts.map(d => d.id === updatedDraft.id ? updatedDraft : d);
      });
      // For remove, sync localCart since it's a destructive operation
      setLocalCart(transformDraftToCart(updatedDraft, products));
      toast({ title: "Removed", description: "Product removed from cart" });
    },
    onError: () => {
      // Rollback optimistic update
      if (draft) {
        setLocalCart(transformDraftToCart(draft, products));
      }
      toast({
        title: "Error",
        description: "Failed to remove product",
        variant: "destructive",
      });
    },
  });

  const handleBulkQuantityChange = useCallback(
    async (updates: Array<{ productId: string; size: string; quantity: number }>) => {
      if (!draft || updates.length === 0) return;

      // Apply optimistic update to local cart (clone nested objects to avoid shared refs)
      const newLocalCart = localCart.map(p => ({
        ...p,
        quantities: { ...p.quantities }
      }));
      updates.forEach(({ productId, size, quantity }) => {
        const cartProduct = newLocalCart.find(p => p.id === productId);
        if (cartProduct) {
          cartProduct.quantities[size] = quantity;
        }
      });
      setLocalCart(newLocalCart);

      // Separate updates into existing items (for bulk PATCH) and new items (for add)
      const bulkUpdates: Array<{ itemIndex: number; updates: { quantity: number; totalPrice: number } }> = [];
      const newItems: Array<any> = [];

      // Use current draft to categorize updates
      let currentDraft = draft;

      updates.forEach(({ productId, size, quantity }) => {
        const realProductId = productId.includes("::") ? productId.split("::")[0] : productId;
        const itemIndex = currentDraft.items?.findIndex(
          (item) =>
            item.productId === realProductId &&
            item.size === size,
        );

        if (itemIndex !== undefined && itemIndex !== -1) {
          // Existing item - add to bulk updates
          const item = currentDraft.items[itemIndex];
          const totalPrice = item.unitPrice * quantity;
          bulkUpdates.push({
            itemIndex,
            updates: { quantity, totalPrice },
          });
        } else if (quantity > 0) {
          // New item - need to add it
          // Find any existing item for this product to get price info
          const existingItem = currentDraft.items?.find(
            (item) => item.productId === realProductId,
          );
          if (existingItem) {
            const totalPrice = existingItem.unitPrice * quantity;
            newItems.push({
              ...existingItem,
              size,
              quantity,
              totalPrice,
            });
          }
        }
      });

      try {
        // First add new items and wait for completion to get updated draft
        if (newItems.length > 0) {
          currentDraft = await addItemMutation.mutateAsync({
            draftId: draft.id,
            items: newItems,
          });
        }

        // Now send bulk updates using fresh item indices from updated draft
        if (bulkUpdates.length > 0) {
          // Recalculate indices based on current draft state
          const freshBulkUpdates = updates
            .filter(({ productId, size }) => {
              const realProductId = productId.includes("::") ? productId.split("::")[0] : productId;
              // Only include items that existed in original draft (not new items)
              return draft.items?.some(
                (item) => item.productId === realProductId && item.size === size
              );
            })
            .map(({ productId, size, quantity }) => {
              const realProductId = productId.includes("::") ? productId.split("::")[0] : productId;
              const itemIndex = currentDraft.items?.findIndex(
                (item) => item.productId === realProductId && item.size === size,
              );
              if (itemIndex === undefined || itemIndex === -1) return null;
              const item = currentDraft.items[itemIndex];
              const totalPrice = item.unitPrice * quantity;
              return {
                itemIndex,
                updates: { quantity, totalPrice },
              };
            })
            .filter(Boolean) as Array<{ itemIndex: number; updates: { quantity: number; totalPrice: number } }>;

          if (freshBulkUpdates.length > 0) {
            await bulkQuantityChangeMutation.mutateAsync({
              draftId: draft.id,
              updates: freshBulkUpdates,
            });
          }
        }
      } catch (error) {
        // Rollback on error
        if (draft) {
          setLocalCart(transformDraftToCart(draft, products));
        }
        toast({
          title: "Error",
          description: "Failed to save changes",
          variant: "destructive",
        });
      }
    },
    [draft, localCart, bulkQuantityChangeMutation, addItemMutation, products, toast, transformDraftToCart],
  );

  const handleQuantityChange = useCallback(
    (productId: string, size: string, quantity: number) => {
      if (!draft) return;
      const realProductId = productId.includes("::") ? productId.split("::")[0] : productId;
      const itemIndex = draft.items?.findIndex(
        (item) =>
          item.productId === realProductId &&
          item.size === size,
      );

      // Apply optimistic update to local cart
      const newLocalCart = [...localCart];
      const cartProduct = newLocalCart.find(p => p.id === productId);
      if (cartProduct) {
        cartProduct.quantities[size] = quantity;
        setLocalCart(newLocalCart);
      }

      if (itemIndex === undefined || itemIndex === -1) {
        if (quantity === 0) return;
        const existingItem = draft.items?.find(
          (item) => item.productId === realProductId,
        );
        if (!existingItem) return;
        const totalPrice = existingItem.unitPrice * quantity;

        const newItem = {
          ...existingItem,
          size,
          quantity,
          totalPrice,
        };

        addItemMutation.mutate({
          draftId: draft.id,
          items: [newItem],
        });
        return;
      }

      const item = draft.items[itemIndex];
      const totalPrice = item.unitPrice * quantity;

      quantityChangeMutation.mutate({
        draftId: draft.id,
        itemIndex,
        item: {
          ...item,
          quantity,
          totalPrice,
        },
      });
    },
    [draft, localCart, quantityChangeMutation, addItemMutation],
  );

  const handleRemoveProduct = useCallback(
    (productId: string) => {
      if (!draft) return;
      const actualProductId = productId.includes("::") ? productId.split("::")[0] : productId;

      // Apply optimistic update to local cart
      setLocalCart(prev => prev.filter(p => p.id !== productId));

      removeProductMutation.mutate({
        draftId: draft.id,
        productId: actualProductId,
      });
    },
    [draft, removeProductMutation],
  );

  const handleToggleSelect = useCallback(
    (productId: string, selected: boolean) => {
      console.log("Toggle select:", productId, selected);
    },
    [],
  );

  // Get base sizes from cart products
  const baseSizes = useMemo(() => {
    const sizeSet = new Set<string>();
    localCart.forEach((product) => {
      product.sizes.forEach((size) => {
        sizeSet.add(size);
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
  }, [localCart]);

  // Create size columns with base and display sizes
  const sizeColumns = useMemo(() => {
    return baseSizes.map(baseSize => ({
      baseSize,
      displaySize: convertSize(baseSize)
    }));
  }, [baseSizes, convertSize]);

  // For backwards compatibility, allSizes uses base sizes
  const allSizes = baseSizes;

  const { totalItems, totalPrice } = useMemo(() => {
    let items = 0;
    let price = 0;
    localCart.forEach((product) => {
      Object.values(product.quantities).forEach((q) => {
        items += q;
        price += product.price * q;
      });
    });
    return { totalItems: items, totalPrice: price };
  }, [localCart]);

  const hasProducts = localCart.length > 0;
  const cartName = draft?.nickname;
  const isSubmitted = draft?.status === 'pending';

  // Get display category for a product - uses mainCategory, kidsAgeGroup, and gender
  const getDisplayCategory = useCallback((product: ShopCartProduct): string => {
    const main = product.mainCategory?.toUpperCase().trim() || '';
    const ageGroup = product.kidsAgeGroup?.toUpperCase().trim() || '';
    const g = product.gender?.toUpperCase().trim() || '';
    
    // Prioritize kids age group - Unisex Junior, Kids Junior etc. must not show as Adult Unisex
    if (ageGroup === 'LARGE' || ageGroup === 'KIDS - LARGE') return 'Kids - Large';
    if (ageGroup === 'JUNIOR' || ageGroup === 'KIDS - JUNIOR') return 'Kids - Junior';
    if (ageGroup === 'NEW BORN' || ageGroup === 'NEWBORN' || ageGroup === 'KIDS - NEWBORN') return 'Kids - Newborn';
    // Shared schema / shop filters: standalone "KIDS" layer, "Infant" (not matched above)
    if (ageGroup === 'KIDS') return 'Kids - Junior';
    if (ageGroup === 'INFANT') return 'Kids - Newborn';
    // Gender containing Junior/Large/Newborn indicates Kids (e.g. "Unisex Junior")
    if (g.includes('JUNIOR')) return 'Kids - Junior';
    if (g.includes('LARGE') && g.includes('KIDS')) return 'Kids - Large';
    if (g.includes('NEWBORN') || g.includes('NEW BORN')) return 'Kids - Newborn';
    
    // Main categories: Men, Women, Adult Unisex (include Male/Female from shop filters)
    if (main === 'MEN' || main === 'MALE') return 'Men';
    if (main === 'WOMEN' || main === 'FEMALE') return 'Women';
    if (main === 'ADULT UNISEX') return 'Adult Unisex';
    
    // Kids (mainCategory) with age groups
    if (main === 'KIDS') {
      return 'Kids - Junior'; // Default to Junior for kids without specific age group
    }
    
    // Fallback: try to infer from gender field (only map to Adult Unisex when clearly adult)
    if (g === 'MEN' || g === 'MALE' || g === 'MENS') return 'Men';
    if (g === 'WOMEN' || g === 'FEMALE' || g === 'WOMENS' || g === 'LADIES') return 'Women';
    if (g === 'ADULT UNISEX' || (g === 'UNISEX' && !g.includes('JUNIOR'))) return 'Adult Unisex';
    if (g.includes('KIDS') || g.includes('CHILD')) return 'Kids - Junior';
    
    return 'Other';
  }, []);

  // Group products by category (Men, Women, Adult Unisex, Kids-Large, Kids-Junior, Kids-Newborn)
  const productsByGender = useMemo(() => {
    const categoryOrder = ['Men', 'Women', 'Adult Unisex', 'Kids - Large', 'Kids - Junior', 'Kids - Newborn'];
    const grouped = new Map<string, ShopCartProduct[]>();
    
    localCart.forEach(product => {
      const category = getDisplayCategory(product);
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(product);
    });
    
    // Sort by predefined category order
    const sortedEntries = Array.from(grouped.entries())
      .filter(([category]) => categoryOrder.includes(category) || grouped.get(category)!.length > 0)
      .sort((a, b) => {
        const indexA = categoryOrder.indexOf(a[0]);
        const indexB = categoryOrder.indexOf(b[0]);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
      });
    
    return sortedEntries;
  }, [localCart, getDisplayCategory]);

  // Track invalid product rows for highlighting
  const [invalidProductIds, setInvalidProductIds] = useState<Set<string>>(new Set());

  const handleBackToShop = () => {
    if (fromOrderHistory) {
      navigate("/order-history");
      return;
    }
    // Determine target section from cart type (Stock or Pre-order)
    const targetPath = draft?.orderType === "pre-order" ? "/shop/pre-order" : "/shop/stock";
    const savedPosition = getStoredScrollPosition(targetPath);

    if (savedPosition) {
      // User was previously in this shop section — restore their scroll position
      sessionStorage.setItem("pending_scroll_restore", JSON.stringify({
        path: targetPath,
        scrollX: savedPosition.scrollX,
        scrollY: savedPosition.scrollY,
      }));
    }
    navigate(targetPath);
  };
  const handleEmptyCart = () => {
    if (draft) {
      // Apply optimistic update to local cart
      setLocalCart([]);
      clearCartMutation.mutate(draft.id);
    }
  };
  // Helper to build order items from local cart
  const buildOrderItems = () => {
    const orderItems: any[] = [];
    localCart.forEach((product) => {
      const [realProductId, color] = product.id.includes('::') 
        ? product.id.split('::') 
        : [product.id, product.color];
      
      Object.entries(product.quantities).forEach(([size, quantity]) => {
        if (quantity > 0) {
          const unitPrice = product.price || 0;
          orderItems.push({
            productId: realProductId,
            productName: product.name,
            brand: product.brand,
            sku: product.sku,
            color: color,
            size: size,
            quantity: quantity,
            unitPrice: unitPrice,
            totalPrice: unitPrice * quantity,
            imageUrl: product.image1,
          });
        }
      });
    });
    return orderItems;
  };

  const handleSubmitCart = () => {
    if (draft) {
      // Validate each product row has total quantity > 1
      const invalidProducts: string[] = [];
      localCart.forEach((product) => {
        const totalQuantity = Object.values(product.quantities).reduce((sum, q) => sum + q, 0);
        if (totalQuantity < 1) {
          invalidProducts.push(product.id);
        }
      });

      if (invalidProducts.length > 0) {
        setInvalidProductIds(new Set(invalidProducts));
        toast({
          title: "Cannot Submit Cart",
          description: `${invalidProducts.length} product(s) have no quantities. Please add at least 1 item per product.`,
          variant: "destructive",
        });
        // Clear highlight after 3 seconds
        setTimeout(() => setInvalidProductIds(new Set()), 3000);
        return;
      }

      setInvalidProductIds(new Set());
      
      const orderItems = buildOrderItems();
      
      // If Account Manager or Admin, show the submission dialog
      if (isAccountManager || isAdmin) {
        setPendingOrderItems(orderItems);
        setShowAMSubmitDialog(true);
        // Reset dialog state
        setSelectedCustomer(null);
        setCustomerSearch("");
        setPaymentMethod("");
        setDeliveryMethod("");
        setDiscountPercent("");
        return;
      }
      
      // Regular customer submission
      submitCartMutation.mutate({ draftId: draft.id, items: orderItems });
    }
  };

  const handleUpdateSubmittedOrder = () => {
    if (!draft || !shopOrderEdit) return;
    const invalidProducts: string[] = [];
    localCart.forEach((product) => {
      const totalQuantity = Object.values(product.quantities).reduce((sum, q) => sum + q, 0);
      if (totalQuantity < 1) {
        invalidProducts.push(product.id);
      }
    });

    if (invalidProducts.length > 0) {
      setInvalidProductIds(new Set(invalidProducts));
      toast({
        title: "Cannot update order",
        description: `${invalidProducts.length} product(s) have no quantities. Add at least 1 item per product.`,
        variant: "destructive",
      });
      setTimeout(() => setInvalidProductIds(new Set()), 3000);
      return;
    }

    setInvalidProductIds(new Set());
    updateSubmittedOrderMutation.mutate({
      sourceOrderId: shopOrderEdit.sourceOrderId,
      draftId: shopOrderEdit.draftId,
      items: buildOrderItems(),
    });
  };

  // Handle Account Manager order confirmation
  const handleAMOrderConfirm = () => {
    if (!draft || !selectedCustomer || !paymentMethod || !deliveryMethod) {
      toast({
        title: "Missing Information",
        description: "Please select a customer, payment method, and delivery method.",
        variant: "destructive",
      });
      return;
    }
    
    submitCartMutation.mutate({
      draftId: draft.id,
      items: pendingOrderItems,
      targetUserId: selectedCustomer.id,
      paymentMethod: paymentMethod,
      deliveryMethod: deliveryMethod,
      discountPercent: discountPercent,
    });
    
    setShowAMSubmitDialog(false);
  };

  if (!draft) {
    return (
      <div className="p-4 space-y-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToShop}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />{" "}
            {fromOrderHistory ? "Back to Order History" : "Back to Shop"}
          </Button>
        </div>
        <div className="p-6 border border-dashed border-gray-300 rounded-md text-center text-muted-foreground">
          Cart not found or has been deleted.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between p-4 pb-2">
        <Button
          size="sm"
          onClick={handleBackToShop}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />{" "}
          {fromOrderHistory ? "Back to Order History" : "Back to Shop"}
        </Button>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground font-mono" data-testid="text-cart-id">
            Cart ID: {draft.id.slice(0, 8)}
          </span>
          {isSubmitted && (
            <span className="px-3 py-1 text-sm font-semibold text-white rounded bg-blue-600" data-testid="badge-submitted">
              New Order
            </span>
          )}
          {!isSubmitted && !hasProducts && (
            <span className="text-sm text-muted-foreground">Inactive Cart</span>
          )}
          {!isSubmitted && hasProducts && (
            <>
              <Button
                size="sm"
                onClick={handleEmptyCart}
                className="flex items-center gap-1"
                disabled={clearCartMutation.isPending}
                data-testid="button-empty-cart"
              >
                <Trash2 className="w-4 h-4" /> Empty Cart
              </Button>
              {shopOrderEdit ? (
                <Button
                  size="sm"
                  onClick={handleUpdateSubmittedOrder}
                  className="flex items-center gap-1 bg-[#f97a1f] hover:bg-[#e06a10]"
                  disabled={updateSubmittedOrderMutation.isPending}
                  data-testid="button-update-order"
                >
                  <Save className="w-4 h-4" />
                  {updateSubmittedOrderMutation.isPending ? "Updating..." : "Update the order"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSubmitCart}
                  className="flex items-center gap-1"
                  disabled={submitCartMutation.isPending}
                  data-testid="button-submit-cart"
                >
                  <Send className="w-4 h-4" />
                  {submitCartMutation.isPending ? "Submitting..." : "Submit Cart"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between px-4 pb-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span className="text-muted-foreground text-sm uppercase">
            MY CART
          </span>
          {cartName}
        </h1>
        <div className="flex items-center gap-4">
          {/* Size Standard Switcher - Always visible */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Size:</span>
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" data-testid="cart-size-standard-switcher">
              {(['EU', 'US', 'UK'] as const).map((standard) => {
                const isAvailable = hasSizeConversion ? availableSizeStandards[standard] : true;
                return (
                  <button
                    key={standard}
                    onClick={() => setSelectedSizeStandard(standard)}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition-all ${
                      selectedSizeStandard === standard
                        ? 'bg-white text-gray-900 shadow-sm'
                        : isAvailable
                          ? 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                          : 'text-gray-400 hover:text-gray-600'
                    }`}
                    data-testid={`cart-size-standard-${standard.toLowerCase()}`}
                  >
                    {standard}
                  </button>
                );
              })}
            </div>
          </div>
          {!hasProducts && (
            <span className="text-xs text-muted-foreground">
              No products in this cart
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto px-4 space-y-6">
        {isProductsLoading || !isInitialized ? (
          <div className="p-6 text-center text-muted-foreground">
            Loading cart...
          </div>
        ) : hasProducts ? (
          productsByGender.map(([gender, genderProducts]) => {
            const categorySizes = [...new Set(genderProducts.flatMap(p => p.sizes))]
              .sort((a, b) => {
                const numA = parseFloat(a);
                const numB = parseFloat(b);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return a.localeCompare(b);
              });
            
            return (
              <div key={gender} className="mb-6">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-gray-200">
                  <h2 className="text-lg font-bold text-gray-800">{gender}</h2>
                  <span className="text-sm text-gray-500">({genderProducts.length} product{genderProducts.length !== 1 ? 's' : ''})</span>
                </div>
                <ShopCartTable
                  key={`cart-table-${gender}-${selectedSizeStandard}`}
                  products={genderProducts}
                  allSizes={categorySizes}
                  onQuantityChange={handleQuantityChange}
                  onBulkQuantityChange={handleBulkQuantityChange}
                  onRemoveProduct={handleRemoveProduct}
                  onToggleSelect={handleToggleSelect}
                  readOnly={isSubmitted}
                  highlightedRows={invalidProductIds}
                  convertSize={convertSize}
                  selectedSizeStandard={selectedSizeStandard}
                />
              </div>
            );
          })
        ) : (
          <div className="p-6 border border-dashed border-gray-300 rounded-md text-center text-muted-foreground">
            Your cart is empty. Add some products from shop.
          </div>
        )}
      </div>
      <footer className="flex justify-center items-center p-4 border-t-2 border-black bg-[#DDE3E2] gap-4 mt-auto">
        <div className="text-sm font-semibold">
          Total Items: <span>{totalItems}</span>
        </div>
        <div className="text-sm font-semibold">
          Total Price: <span>{getCurrencySymbol(userCurrency)}{totalPrice.toFixed(2)}</span>
        </div>
        {(user as any)?.taxRate != null && (
          <div className="text-sm font-semibold">
            Inc. VAT ({parseFloat((user as any).taxRate)}%): <span>{getCurrencySymbol(userCurrency)}{(totalPrice * (1 + parseFloat((user as any).taxRate) / 100)).toFixed(2)}</span>
          </div>
        )}
      </footer>

      {/* Account Manager Order Submission Dialog */}
      <Dialog open={showAMSubmitDialog} onOpenChange={setShowAMSubmitDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserIcon size={18} />
              Create Order for Customer
            </DialogTitle>
            <DialogDescription>
              Select a customer and fill in order details to create an order on their behalf.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Customer Search */}
            <div className="space-y-2">
              <Label htmlFor="customer-search" className="text-sm font-medium">
                Select Customer <span className="text-red-500">*</span>
              </Label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                      {(selectedCustomer.displayName || selectedCustomer.username).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{selectedCustomer.displayName || selectedCustomer.username}</div>
                      <div className="text-xs text-gray-500">{selectedCustomer.email || 'No email'}</div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCustomer(null)}
                    className="text-gray-500 hover:text-red-500"
                    data-testid="button-clear-customer"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <Input
                      id="customer-search"
                      placeholder="Search by name or email..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="pl-9"
                      data-testid="input-customer-search"
                    />
                  </div>
                  {customerSearch.length >= 1 && (
                    <div className="max-h-40 overflow-y-auto border rounded-lg bg-white">
                      {isSearchingCustomers ? (
                        <div className="p-3 text-center text-sm text-gray-500">Searching...</div>
                      ) : searchedCustomers.length === 0 ? (
                        <div className="p-3 text-center text-sm text-gray-500">No customers found</div>
                      ) : (
                        searchedCustomers.map((customer) => (
                          <button
                            key={customer.id}
                            className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 text-left transition-colors"
                            onClick={() => {
                              setSelectedCustomer(customer);
                              setCustomerSearch("");
                            }}
                            data-testid={`button-select-customer-${customer.id}`}
                          >
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium">
                              {(customer.displayName || customer.username).charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-sm">{customer.displayName || customer.username}</div>
                              <div className="text-xs text-gray-500">{customer.email || 'No email'}</div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label htmlFor="payment-method" className="text-sm font-medium">
                Payment Method <span className="text-red-500">*</span>
              </Label>
              <Select value={paymentMethod} onValueChange={(val) => setPaymentMethod(val as PaymentMethod)}>
                <SelectTrigger id="payment-method" data-testid="select-payment-method">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cheques">Cheques</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Delivery Method */}
            <div className="space-y-2">
              <Label htmlFor="delivery-method" className="text-sm font-medium">
                Delivery Method <span className="text-red-500">*</span>
              </Label>
              <Select value={deliveryMethod} onValueChange={(val) => setDeliveryMethod(val as DeliveryMethod)}>
                <SelectTrigger id="delivery-method" data-testid="select-delivery-method">
                  <SelectValue placeholder="Select delivery method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pickup_from_warehouse">Pickup from Warehouse</SelectItem>
                  <SelectItem value="delivery_to_store">Delivery to Store</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Discount Percentage (Optional) */}
            <div className="space-y-2">
              <Label htmlFor="discount-percent" className="text-sm font-medium">
                Discount % <span className="text-gray-400">(Optional)</span>
              </Label>
              <Input
                id="discount-percent"
                type="number"
                min="0"
                max="100"
                step="0.1"
                placeholder="e.g., 10"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                data-testid="input-discount-percent"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => setShowAMSubmitDialog(false)}
              data-testid="button-cancel-am-order"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAMOrderConfirm}
              disabled={!selectedCustomer || !paymentMethod || !deliveryMethod || submitCartMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-confirm-am-order"
            >
              {submitCartMutation.isPending ? "Creating..." : "Create Order"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}