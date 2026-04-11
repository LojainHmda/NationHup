import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProductVariantMatrix, ColorVariant } from '@/lib/productVariants';
import { getStockForColorSize } from '@/lib/productVariants';

type MatrixMode = 'compact' | 'modal' | 'grid';

interface VariantMatrixProps {
  matrix: ProductVariantMatrix;
  mode: MatrixMode;
  quantities?: Record<string, number>; // colorId-size -> quantity
  onQuantityChange?: (colorId: string, size: string, quantity: number) => void;
  onAddToCart?: () => void;
  className?: string;
}

export function VariantMatrix({
  matrix,
  mode,
  quantities = {},
  onQuantityChange,
  onAddToCart,
  className = ''
}: VariantMatrixProps) {
  const [expanded, setExpanded] = useState(mode !== 'compact');

  if (mode === 'compact' && !expanded) {
    return (
      <div className={`${className}`}>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
          className="w-full text-xs"
          data-testid="button-expand-colors"
        >
          <ChevronDown className="w-3 h-3 mr-1" />
          Select Colors & Sizes ({matrix.colors.length} colors)
        </Button>
      </div>
    );
  }

  return (
    <div className={`${className}`} onClick={(e) => e.stopPropagation()}>
      {mode === 'compact' && (
        <div className="flex items-center justify-between mb-2 pb-2 border-b">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Select Colors & Sizes
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(false);
            }}
            className="h-6 w-6 p-0"
            data-testid="button-collapse-colors"
          >
            <ChevronUp className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Size Column Headers */}
      <div className="overflow-x-auto">
        <div className="min-w-full">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b">
            <div className={`${mode === 'compact' ? 'w-16' : 'w-24'} flex-shrink-0`}>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Color</span>
            </div>
            <div className="flex gap-1 flex-1">
              {matrix.allSizes.map((size) => (
                <div
                  key={size}
                  className={`${mode === 'compact' ? 'w-12' : 'w-16'} flex-shrink-0 text-center`}
                >
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{size}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Color Rows */}
          <div className="space-y-2">
            {matrix.colors.map((color) => (
              <ColorRow
                key={color.colorId}
                color={color}
                sizes={matrix.allSizes}
                quantities={quantities}
                onQuantityChange={onQuantityChange}
                mode={mode}
              />
            ))}
          </div>
        </div>
      </div>

      {mode === 'compact' && onAddToCart && (
        <div className="mt-3 pt-3 border-t">
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart();
            }}
            className="w-full"
            data-testid="button-quick-add-to-cart"
          >
            Add to Cart
          </Button>
        </div>
      )}
    </div>
  );
}

interface ColorRowProps {
  color: ColorVariant;
  sizes: string[];
  quantities: Record<string, number>;
  onQuantityChange?: (colorId: string, size: string, quantity: number) => void;
  mode: MatrixMode;
}

function ColorRow({ color, sizes, quantities, onQuantityChange, mode }: ColorRowProps) {
  const cellSize = mode === 'compact' ? 'w-12 h-10' : 'w-16 h-12';

  return (
    <div className="flex items-center gap-2">
      {/* Color Thumbnail */}
      <div className={`${mode === 'compact' ? 'w-16' : 'w-24'} flex-shrink-0 flex items-center gap-2`}>
        <div className={`${mode === 'compact' ? 'w-8 h-8' : 'w-12 h-12'} rounded border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0`}>
          <img
            src={color.thumbUrl}
            alt={color.label}
            className="w-full h-full object-cover"
          />
        </div>
        {mode !== 'compact' && (
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
            {color.label}
          </span>
        )}
      </div>

      {/* Size Quantity Cells */}
      <div className="flex gap-1 flex-1">
        {sizes.map((size) => {
          const stock = getStockForColorSize(color, size);
          const cellKey = `${color.colorId}-${size}`;
          const quantity = quantities[cellKey] || 0;
          const isAvailable = stock > 0;

          return (
            <div key={size} className={`${cellSize} flex-shrink-0`}>
              <Input
                type="number"
                min="0"
                max={stock}
                value={quantity || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  const capped = Math.min(Math.max(0, val), stock);
                  onQuantityChange?.(color.colorId, size, capped);
                }}
                disabled={!isAvailable}
                placeholder="0"
                className={`w-full h-full text-center text-xs p-1 ${
                  !isAvailable
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                    : quantity > 0
                    ? 'bg-black dark:bg-white text-white dark:text-black font-bold'
                    : 'bg-white dark:bg-slate-800'
                }`}
                data-testid={`input-quantity-${cellKey}`}
              />
              {mode !== 'compact' && (
                <div className="text-[9px] text-center text-slate-500 mt-0.5">
                  {stock > 0 ? `${stock}` : 'Out'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
