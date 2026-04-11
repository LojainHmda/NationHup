import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

type ProductMode = 'all' | 'stock' | 'preorder';

interface OrderPermissions {
  allowPreOrders: boolean;
}

interface ProductModeContextType {
  productMode: ProductMode;
  setProductMode: (mode: ProductMode) => void;
  permissions: OrderPermissions;
  availableModes: ProductMode[];
  isLoadingPermissions: boolean;
}

const ProductModeContext = createContext<ProductModeContextType | undefined>(undefined);

const STORAGE_KEY = 'shoehub_product_mode';

function getStoredMode(): ProductMode {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'stock' || stored === 'preorder' || stored === 'all') {
      return stored;
    }
  }
  return 'stock'; // Default to stock
}

export function ProductModeProvider({ children }: { children: ReactNode }) {
  const [productMode, setProductModeState] = useState<ProductMode>(getStoredMode);
  const isInitialized = useRef(false);

  // Fetch user data including permissions
  const { data: user, isLoading: isLoadingUser } = useQuery<{
    id: string;
    role: string;
    allowPreOrders?: boolean;
  } | null>({
    queryKey: ['/api/auth/user'],
    staleTime: 60000,
  });

  // Loading state - default to restrictive (stock only) while loading for customers
  const isLoadingPermissions = isLoadingUser;

  // Determine permissions - all customers can order from stock, pre-orders are controlled
  const permissions: OrderPermissions = {
    allowPreOrders: user ? (user.role !== 'customer' || user.allowPreOrders !== false) : false,
  };

  // Calculate available modes based on permissions - stock is always allowed
  const availableModes: ProductMode[] = ['stock'];
  if (permissions.allowPreOrders) {
    availableModes.push('preorder');
    availableModes.push('all');
  }

  // Auto-correct mode if current mode is not permitted
  useEffect(() => {
    if (availableModes.length > 0 && !availableModes.includes(productMode)) {
      const newMode = availableModes[0];
      console.log('[ProductMode] Auto-correcting mode from', productMode, 'to', newMode);
      setProductModeState(newMode);
    }
  }, [permissions.allowPreOrders, productMode, availableModes]);

  useEffect(() => {
    if (!isInitialized.current) {
      const stored = getStoredMode();
      if (stored !== productMode) {
        setProductModeState(stored);
      }
      isInitialized.current = true;
    }
  }, []);

  useEffect(() => {
    if (isInitialized.current) {
      localStorage.setItem(STORAGE_KEY, productMode);
      console.log('[ProductMode] Saved to localStorage:', productMode);
    }
  }, [productMode]);

  const setProductMode = (mode: ProductMode) => {
    // Only allow setting if the mode is permitted
    if (availableModes.includes(mode) || availableModes.length === 0) {
      console.log('[ProductMode] Setting mode:', mode);
      setProductModeState(mode);
    } else {
      console.log('[ProductMode] Mode', mode, 'not permitted for this user');
    }
  };

  return (
    <ProductModeContext.Provider value={{ productMode, setProductMode, permissions, availableModes, isLoadingPermissions }}>
      {children}
    </ProductModeContext.Provider>
  );
}

export function useProductMode() {
  const context = useContext(ProductModeContext);
  if (context === undefined) {
    throw new Error('useProductMode must be used within a ProductModeProvider');
  }
  return context;
}
