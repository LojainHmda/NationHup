import { useState, useCallback } from "react";
import type { Product } from "@shared/schema";

export interface BucketItem {
  id: string; // unique key: productId-color-size
  productId: string;
  productName: string;
  productSku: string;
  brand: string;
  color: string;
  size: string;
  quantity: number;
  price: string;
  product?: Product;
}

export function useBucket() {
  const [bucketItems, setBucketItems] = useState<BucketItem[]>([]);

  const addToBucket = useCallback((item: Omit<BucketItem, 'id'>) => {
    const id = `${item.productId}-${item.color}-${item.size}`;
    
    setBucketItems(prev => {
      const existing = prev.find(i => i.id === id);
      
      if (existing) {
        // Update quantity if item already exists
        return prev.map(i => 
          i.id === id 
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        );
      } else {
        // Add new item
        return [...prev, { ...item, id }];
      }
    });
  }, []);

  const updateBucketQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromBucket(id);
      return;
    }
    
    setBucketItems(prev => 
      prev.map(item => 
        item.id === id ? { ...item, quantity } : item
      )
    );
  }, []);

  const removeFromBucket = useCallback((id: string) => {
    setBucketItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearBucket = useCallback(() => {
    setBucketItems([]);
  }, []);

  const getBucketSummary = useCallback(() => {
    const totalItems = bucketItems.length;
    const totalQuantity = bucketItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalValue = bucketItems.reduce((sum, item) => 
      sum + (item.quantity * parseFloat(item.price)), 0
    );

    return { totalItems, totalQuantity, totalValue };
  }, [bucketItems]);

  return {
    bucketItems,
    addToBucket,
    updateBucketQuantity,
    removeFromBucket,
    clearBucket,
    getBucketSummary,
  };
}
