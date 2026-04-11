import { useLocation } from "wouter";
import { useProductMode } from "./useProductMode";

type ShopMode = 'all' | 'stock' | 'preorder';

const MODE_TO_PATH: Record<ShopMode, string> = {
  stock: '/shop/stock',
  preorder: '/shop/pre-order',
  all: '/shop',
};

/**
 * Hook for navigating to shop with the correct product mode.
 * Use in home, TopNavbar, footer links, etc.
 */
export function useShopNavigation() {
  const [location, navigate] = useLocation();
  const { setProductMode } = useProductMode();

  const navigateToShop = (mode: ShopMode) => {
    setProductMode(mode);
    const targetPath = MODE_TO_PATH[mode];
    if (location !== targetPath) {
      navigate(targetPath);
    }
  };

  return { navigateToShop };
}
