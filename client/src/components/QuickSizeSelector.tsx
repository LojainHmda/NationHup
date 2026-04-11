import { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@shared/schema';

interface QuickSizeSelectorProps {
  product: Product;
  onAddToCart?: (productId: string, size: string, quantity: number) => void;
  onOpenFullModal?: () => void;
  compact?: boolean;
}

export function QuickSizeSelector({ 
  product, 
  onAddToCart, 
  onOpenFullModal,
  compact = false 
}: QuickSizeSelectorProps) {
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSizeClick = (size: string, stock: number, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (stock <= 0) return;
    
    // Check limitOrder per size before adding (adding 1 unit)
    const avs = (product as any).availableSizes || [];
    const sizeEntry = avs.find((a: { size: string; limitOrder?: number }) => a.size === size);
    const limit = sizeEntry?.limitOrder ?? ((product as any).limitOrder >= 1 ? (product as any).limitOrder : null);
    if (limit != null && 1 > limit) {
      toast({
        variant: "destructive",
        title: "Order Limit Exceeded",
        description: `You cannot order more than ${limit} units of size ${size} for this product.`,
      });
      return;
    }
    
    if (compact && onAddToCart) {
      // In compact mode, immediately add to cart when size is clicked
      onAddToCart(product.id, size, 1);
      toast({
        title: "Added to cart",
        description: `${product.name} - Size ${size}`,
      });
    } else {
      setSelectedSize(size);
    }
  };

  const handleQuickAdd = (event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (!selectedSize) {
      toast({
        title: "Select a size",
        description: "Please select a size before adding to cart",
        variant: "destructive",
      });
      return;
    }

    // Check limitOrder per size before adding (adding 1 unit)
    const avs = (product as any).availableSizes || [];
    const sizeEntry = avs.find((a: { size: string; limitOrder?: number }) => a.size === selectedSize);
    const limit = sizeEntry?.limitOrder ?? ((product as any).limitOrder >= 1 ? (product as any).limitOrder : null);
    if (limit != null && 1 > limit) {
      toast({
        variant: "destructive",
        title: "Order Limit Exceeded",
        description: `You cannot order more than ${limit} units of size ${selectedSize} for this product.`,
      });
      return;
    }

    if (onAddToCart) {
      onAddToCart(product.id, selectedSize, 1);
      toast({
        title: "Added to cart",
        description: `${product.name} - Size ${selectedSize}`,
      });
      setSelectedSize(null);
    }
  };

  const handleMoreOptions = (event: React.MouseEvent) => {
    event.stopPropagation();
    onOpenFullModal?.();
  };

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
        {product.availableSizes.slice(0, 6).map(({ size, stock }) => {
          const isAvailable = stock > 0;
          const isSelected = selectedSize === size;

          return (
            <button
              key={size}
              data-testid={`quick-size-${size.toLowerCase()}`}
              onClick={(e) => handleSizeClick(size, stock, e)}
              disabled={!isAvailable}
              className={`
                px-2 py-1 text-xs font-medium rounded border transition-all
                ${!isAvailable 
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 line-through cursor-not-allowed border-gray-200 dark:border-gray-700' 
                  : isSelected
                  ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                  : 'bg-white dark:bg-slate-800 text-black dark:text-white border-black dark:border-white hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer'
                }
              `}
            >
              {size}
            </button>
          );
        })}
        {product.availableSizes.length > 6 && (
          <button
            onClick={handleMoreOptions}
            className="px-2 py-1 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            +{product.availableSizes.length - 6}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Quick Size Selection:</div>
      <div className="flex flex-wrap gap-1.5">
        {product.availableSizes.map(({ size, stock }) => {
          const isAvailable = stock > 0;
          const isSelected = selectedSize === size;

          return (
            <button
              key={size}
              data-testid={`quick-size-${size.toLowerCase()}`}
              onClick={(e) => handleSizeClick(size, stock, e)}
              disabled={!isAvailable}
              className={`
                relative px-3 py-2 text-sm font-semibold rounded-lg border-2 transition-all
                ${!isAvailable 
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 border-gray-200 dark:border-gray-700 cursor-not-allowed' 
                  : isSelected
                  ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-lg'
                  : 'bg-white dark:bg-slate-800 text-black dark:text-white border-black dark:border-white hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer'
                }
              `}
            >
              {size}
              {!isAvailable && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full h-0.5 bg-gray-400 dark:bg-gray-600 rotate-45" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      
      {selectedSize && (
        <div className="flex gap-2">
          <Button
            onClick={handleQuickAdd}
            size="sm"
            className="flex-1 bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200"
            data-testid="button-quick-add-to-cart"
          >
            <ShoppingCart className="h-3 w-3 mr-2" />
            Add Size {selectedSize}
          </Button>
          <Button
            onClick={handleMoreOptions}
            size="sm"
            variant="outline"
            data-testid="button-more-options"
          >
            More Options
          </Button>
        </div>
      )}
    </div>
  );
}
