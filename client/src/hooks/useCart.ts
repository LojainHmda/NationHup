import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CartItem, Product } from "@shared/schema";
import type { CartSelection, OrderSummary } from "@/lib/types";

interface CartItemWithProduct extends CartItem {
  product?: Product;
}

interface CartConflictError extends Error {
  cartType?: string;
  productType?: string;
  productName?: string;
}

export function useCart() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sessionId] = useState(() => "anonymous"); // In real app, this would come from auth

  const { data: cartItems = [], isLoading } = useQuery<CartItemWithProduct[]>({
    queryKey: ["/api/cart"],
  });

  const addToCartMutation = useMutation({
    mutationFn: async (data: { productId: string; batchName: string; selections: CartSelection[] }) => {
      console.log('🚀 Mutation firing with data:', data);
      const response = await apiRequest("/api/cart", "POST", data);
      console.log('✅ API response received:', response.status);
      
      // Handle 409 Conflict (source type mismatch)
      if (response.status === 409) {
        const errorData = await response.json();
        const error = new Error(errorData.message) as CartConflictError;
        error.cartType = errorData.cartType;
        error.productType = errorData.productType;
        error.productName = errorData.productName;
        throw error;
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add to cart');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      console.log('✅ Mutation successful, data:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error: CartConflictError) => {
      console.error('❌ Mutation failed:', error);
      
      // Show user-friendly toast for cart/product type conflicts
      if (error.cartType && error.productType) {
        const cartLabel = error.cartType === 'pre-order' ? 'Pre-Order' : 'Stock';
        const productLabel = error.productType === 'pre-order' ? 'Pre-Order' : 'Stock';
        toast({
          variant: "destructive",
          title: "Action not allowed",
          description: `This product is ${productLabel} and can't be added to a ${cartLabel} cart. Please switch to a ${productLabel} cart to continue.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Unable to Add Item",
          description: error.message || "There was an error adding this item to your cart. Please try again.",
        });
      }
    },
  });

  const updateCartItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CartItem> }) => {
      const response = await apiRequest(`/api/cart/${id}`, "PATCH", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
  });

  const removeCartItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest(`/api/cart/${id}`, "DELETE");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
  });

  const removeSelectionsFromCartMutation = useMutation({
    mutationFn: async ({ cartItemId, selections }: { cartItemId: string; selections: Array<{ size: string }> }) => {
      const response = await apiRequest(`/api/cart/${cartItemId}/remove-selections`, "PATCH", {
        selectionsToRemove: selections
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
  });

  const clearCartMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/cart", "DELETE");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const response = await apiRequest("/api/orders", "POST", orderData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
  });

  const addToCart = useCallback((productId: string, batchName: string, selections: CartSelection[]) => {
    console.log('🛒 addToCart called:', { productId, batchName, selections });
    addToCartMutation.mutate({ productId, batchName, selections });
  }, [addToCartMutation]);

  const updateCartItem = useCallback((id: string, data: Partial<CartItem>) => {
    updateCartItemMutation.mutate({ id, data });
  }, [updateCartItemMutation]);

  const removeCartItem = useCallback((id: string) => {
    removeCartItemMutation.mutate(id);
  }, [removeCartItemMutation]);

  const removeSelectionsFromCart = useCallback((cartItemId: string, selections: Array<{ size: string }>) => {
    return removeSelectionsFromCartMutation.mutateAsync({ cartItemId, selections });
  }, [removeSelectionsFromCartMutation]);

  const clearCart = useCallback(() => {
    clearCartMutation.mutate();
  }, [clearCartMutation]);

  const createOrder = useCallback((orderData: any) => {
    createOrderMutation.mutate(orderData);
  }, [createOrderMutation]);

  const getOrderSummary = useCallback((): OrderSummary => {
    const subtotal = cartItems.reduce((sum, item) => {
      if (!item.product) return sum;
      const itemTotal = item.selections.reduce((itemSum, selection) => {
        return itemSum + (selection.quantity * parseFloat(item.product!.wholesalePrice));
      }, 0);
      return sum + itemTotal;
    }, 0);

    const totalPairs = cartItems.reduce((sum, item) => {
      return sum + item.selections.reduce((selSum, selection) => selSum + selection.quantity, 0);
    }, 0);

    // Calculate bulk discount (15% for orders over $2000)
    const discount = subtotal >= 2000 ? subtotal * 0.15 : 0;
    const total = subtotal - discount;

    return { subtotal, discount, total, totalPairs };
  }, [cartItems]);

  const getBatchedItems = useCallback(() => {
    const batches = new Map<string, CartItemWithProduct[]>();
    
    cartItems.forEach(item => {
      const batchName = item.batchName;
      if (!batches.has(batchName)) {
        batches.set(batchName, []);
      }
      batches.get(batchName)!.push(item);
    });

    return Array.from(batches.entries()).map(([name, items]) => ({
      name,
      items
    }));
  }, [cartItems]);

  return {
    cartItems,
    isLoading,
    addToCart,
    updateCartItem,
    removeCartItem,
    removeSelectionsFromCart,
    clearCart,
    createOrder,
    getOrderSummary,
    getBatchedItems,
    isAddingToCart: addToCartMutation.isPending,
    isUpdating: updateCartItemMutation.isPending,
    isRemoving: removeCartItemMutation.isPending,
    isClearing: clearCartMutation.isPending,
    isCreatingOrder: createOrderMutation.isPending,
  };
}
