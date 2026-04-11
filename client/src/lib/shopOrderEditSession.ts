export const SHOP_ORDER_EDIT_SESSION_KEY = 'shop-order-edit';

export type ShopOrderEditSession = {
  sourceOrderId: string;
  draftId: string;
};

export function readShopOrderEditSession(): ShopOrderEditSession | null {
  try {
    const raw = sessionStorage.getItem(SHOP_ORDER_EDIT_SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<ShopOrderEditSession>;
    if (typeof o.sourceOrderId === 'string' && typeof o.draftId === 'string') {
      return { sourceOrderId: o.sourceOrderId, draftId: o.draftId };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function clearShopOrderEditSession(): void {
  sessionStorage.removeItem(SHOP_ORDER_EDIT_SESSION_KEY);
}
