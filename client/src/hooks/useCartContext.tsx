import { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { Order } from "@shared/schema";

type CartType = "pre-order" | "stock";

/** When `activateInShopCart` is false, the new draft is not selected in the shop cart sidebar (e.g. account manager “create customer cart”). */
export type CreateDraftOptions = {
  activateInShopCart?: boolean;
};

interface CartContextType {
  drafts: Order[];
  isDraftsLoading: boolean;
  activeDraftId: string | null;
  setActiveDraftId: (id: string | null) => void;
  openCartId: string | null;
  setOpenCartId: (id: string | null) => void;
  openCart: Order | undefined;
  activeDraft: Order | undefined;
  createDraft: (
    cartName?: string,
    cartType?: CartType,
    forCustomerUserId?: string,
    options?: CreateDraftOptions,
  ) => void;
  createDraftAsync: (
    cartName?: string,
    cartType?: CartType,
    forCustomerUserId?: string,
    options?: CreateDraftOptions,
  ) => Promise<Order>;
  deleteDraft: (draftId: string) => void;
  renameDraft: (draftId: string, newName: string) => void;
  isCreatingDraft: boolean;
  /** Query key for drafts cache - use when updating/invalidating drafts from outside context */
  draftsQueryKey: readonly ['/api/orders/drafts', string];
}

const CartContext = createContext<CartContextType | null>(null);

/** Query key for drafts - includes userId so each user has isolated cache (prevents showing another user's carts) */
export const draftsQueryKey = (userId?: string | null) =>
  ['/api/orders/drafts', userId ?? 'guest'] as const;

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const draftsKey = draftsQueryKey(user?.id);
  const prevUserIdRef = useRef<string | null>(null);
  
  const [activeDraftId, setActiveDraftIdState] = useState<string | null>(() => {
    return sessionStorage.getItem('shop-active-draft-id');
  });

  const [openCartId, setOpenCartIdState] = useState<string | null>(() => {
    return sessionStorage.getItem('shop-open-cart-id');
  });

  // Clear cart IDs when user changes (login/logout/switch) so new users don't inherit previous user's cart refs
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    const prevUserId = prevUserIdRef.current;
    if (prevUserId !== null && prevUserId !== currentUserId) {
      // User switched or logged out - clear persisted cart IDs
      prevUserIdRef.current = currentUserId;
      sessionStorage.removeItem('shop-active-draft-id');
      sessionStorage.removeItem('shop-open-cart-id');
      sessionStorage.removeItem('shop-order-edit');
      setActiveDraftIdState(null);
      setOpenCartIdState(null);
    } else {
      prevUserIdRef.current = currentUserId;
    }
  }, [user?.id]);

  const setActiveDraftId = useCallback((id: string | null) => {
    setActiveDraftIdState(id);
    if (id) {
      sessionStorage.setItem('shop-active-draft-id', id);
    } else {
      sessionStorage.removeItem('shop-active-draft-id');
    }
  }, []);

  const setOpenCartId = useCallback((id: string | null) => {
    setOpenCartIdState(id);
    if (id) {
      sessionStorage.setItem('shop-open-cart-id', id);
    } else {
      sessionStorage.removeItem('shop-open-cart-id');
    }
  }, []);

  const { data: rawDrafts = [], isLoading: isDraftsLoading } = useQuery<Order[]>({
    queryKey: draftsKey,
    enabled: !!user,
  });

  const drafts = useMemo(() => {
    return [...rawDrafts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [rawDrafts]);

  // Clear stale cart IDs that don't belong to current user's drafts (e.g. from session switch)
  useEffect(() => {
    if (isDraftsLoading) return;
    const draftIds = new Set(drafts.map(d => d.id));
    let needsClear = false;
    if (activeDraftId && !draftIds.has(activeDraftId)) {
      setActiveDraftIdState(null);
      sessionStorage.removeItem('shop-active-draft-id');
      needsClear = true;
    }
    if (openCartId && !draftIds.has(openCartId)) {
      setOpenCartIdState(null);
      sessionStorage.removeItem('shop-open-cart-id');
      needsClear = true;
    }
  }, [drafts, activeDraftId, openCartId, isDraftsLoading]);

  const openCart = drafts.find(d => d.id === openCartId);
  const activeDraft = drafts.find(d => d.id === activeDraftId);

  const createDraftMutation = useMutation({
    mutationFn: async ({
      cartName,
      cartType,
      forCustomerUserId,
    }: {
      cartName?: string;
      cartType?: CartType;
      forCustomerUserId?: string;
      activateInShopCart?: boolean;
    }) => {
      const draftCount = drafts.length + 1;
      const name = cartName || `Shop Cart ${draftCount}`;
      const orderType = cartType === 'pre-order' ? 'pre-order' : 'regular';
      
      console.log('Creating draft cart:', { cartName: name, cartType, orderType });
      
      const res = await apiRequest('/api/orders', 'POST', {
        orderName: name,
        nickname: name,
        status: 'draft',
        items: [],
        subtotal: '0',
        total: '0',
        discount: '0',
        orderType,
        ...(forCustomerUserId ? { forCustomerUserId } : {}),
      });
      
      const createdOrder = await res.json() as Order;
      console.log('Created order response:', {
        id: createdOrder.id,
        orderType: createdOrder.orderType,
        nickname: createdOrder.nickname
      });
      
      return createdOrder;
    },
    onSuccess: (newDraft, variables) => {
      if (variables.activateInShopCart !== false) {
        queryClient.setQueryData<Order[]>(draftsKey, (old) =>
          old ? [newDraft, ...old] : [newDraft]
        );
        setActiveDraftId(newDraft.id);
        setOpenCartId(newDraft.id);
      }
      queryClient.invalidateQueries({ queryKey: draftsKey });
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (draftId: string) => {
      const res = await fetch(`/api/orders/${draftId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        let reason = "Something went wrong. Please try again.";
        try {
          const body = await res.json();
          reason = body.reason || body.message || reason;
        } catch { /* non-JSON response */ }
        throw new Error(reason);
      }
      return draftId;
    },
    onMutate: async (draftId: string) => {
      await queryClient.cancelQueries({ queryKey: draftsKey });
      const previousDrafts = queryClient.getQueryData<Order[]>(draftsKey);
      queryClient.setQueryData<Order[]>(draftsKey, (old) =>
        old ? old.filter(d => d.id !== draftId) : []
      );
      if (activeDraftId === draftId) {
        setActiveDraftId(null);
      }
      if (openCartId === draftId) {
        setOpenCartId(null);
      }
      return { previousDrafts };
    },
    onError: (err, _draftId, context) => {
      if (context?.previousDrafts) {
        queryClient.setQueryData(draftsKey, context.previousDrafts);
      }
      const reason = getApiErrorMessage(err);
      toast({
        title: "Couldn't delete cart",
        description: (
          <>
            <span className="text-xs font-semibold uppercase tracking-wide text-destructive-foreground/90">
              Reason
            </span>
            <span className="mt-1.5 block text-sm font-medium leading-snug text-destructive-foreground">
              {reason}
            </span>
          </>
        ),
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: draftsKey });
    },
  });

  const renameDraftMutation = useMutation({
    mutationFn: async ({ draftId, newName }: { draftId: string; newName: string }) => {
      const res = await apiRequest(`/api/orders/${draftId}`, 'PATCH', {
        nickname: newName,
        orderName: newName,
      });
      const updated = (await res.json()) as Order;
      return updated;
    },
    onMutate: async ({ draftId, newName }) => {
      await queryClient.cancelQueries({ queryKey: draftsKey });
      const previousDrafts = queryClient.getQueryData<Order[]>(draftsKey);
      queryClient.setQueryData<Order[]>(draftsKey, (old) =>
        old ? old.map(d => d.id === draftId ? { ...d, nickname: newName, orderName: newName } : d) : []
      );
      return { previousDrafts };
    },
    // Merge server's authoritative row so we never depend on a refetch that could
    // race with other cache updates and briefly show the old name.
    onSuccess: (updated) => {
      queryClient.setQueryData<Order[]>(draftsKey, (old) =>
        old ? old.map(d => d.id === updated.id ? { ...d, ...updated } : d) : [updated]
      );
    },
    onError: (err, _variables, context) => {
      if (context?.previousDrafts) {
        queryClient.setQueryData(draftsKey, context.previousDrafts);
      }
      toast({
        title: "Couldn't rename cart",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const value: CartContextType = {
    drafts,
    isDraftsLoading,
    activeDraftId,
    setActiveDraftId,
    openCartId,
    setOpenCartId,
    openCart,
    activeDraft,
    createDraft: (
      cartName?: string,
      cartType?: CartType,
      forCustomerUserId?: string,
      options?: CreateDraftOptions,
    ) =>
      createDraftMutation.mutate({
        cartName,
        cartType,
        forCustomerUserId,
        activateInShopCart: options?.activateInShopCart,
      }),
    createDraftAsync: (
      cartName?: string,
      cartType?: CartType,
      forCustomerUserId?: string,
      options?: CreateDraftOptions,
    ) =>
      createDraftMutation.mutateAsync({
        cartName,
        cartType,
        forCustomerUserId,
        activateInShopCart: options?.activateInShopCart,
      }),
    deleteDraft: (draftId: string) => deleteDraftMutation.mutate(draftId),
    renameDraft: (draftId: string, newName: string) => renameDraftMutation.mutate({ draftId, newName }),
    isCreatingDraft: createDraftMutation.isPending,
    draftsQueryKey: draftsKey,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

export function useCartContext() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCartContext must be used within a CartProvider');
  }
  return context;
}
