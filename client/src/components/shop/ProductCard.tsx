import { Plus, ShoppingCart, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Product } from "@shared/schema";

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product, color: string) => void;
}

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const availableSizes = product.availableSizes
    .filter(s => s.stock > 0)
    .map(s => s.size)
    .sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      return numA - numB;
    });

  const formatPrice = (price: string | number) => {
    const num = typeof price === 'string' ? parseFloat(price) : price;
    return `$${num.toFixed(2)}`;
  };

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
    return '#CBD5E1'; // default slate color
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-slate-200 dark:border-slate-700">
      {/* Main Product Image with Add Button */}
      <div className="relative aspect-square group">
        <img 
          src={product.image1} 
          alt={product.name}
          className="w-full h-full object-cover"
        />
        {product.isPreOrder && (
          <div className="absolute top-2 left-2 bg-black text-white text-xs font-bold px-2 py-1 rounded">
            PRE-ORDER
          </div>
        )}
        {product.unitsPerCarton && product.unitsPerCarton > 0 && (
          <div className="absolute top-2 right-2 bg-amber-500 text-white p-1.5 rounded" title="Sold by carton">
            <Package className="w-4 h-4" />
          </div>
        )}
        <button
          onClick={() => onAddToCart(product, product.colourway || 'Default')}
          className="absolute bottom-3 right-3 w-10 h-10 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 shadow-lg"
          data-testid={`button-add-main-${product.id}`}
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Product Info */}
      <div className="p-4">
        <div className="mb-3">
          <h3 className="font-semibold text-sm mb-1 line-clamp-2" data-testid={`text-product-name-${product.id}`}>
            {product.name}
          </h3>
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-medium text-blue-600 dark:text-blue-400">{product.brand}</span>
            <span>•</span>
            <span>{product.category}</span>
          </div>
        </div>

        {/* Price */}
        <div className="mb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-slate-900 dark:text-white">
              {formatPrice(product.wholesalePrice)}
            </span>
            <span className="text-sm text-slate-500 line-through">
              {formatPrice(product.retailPrice)}
            </span>
          </div>
        </div>

        {/* Available Sizes */}
        <div className="mb-3">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Available Sizes:</div>
          <div className="flex flex-wrap gap-1">
            {availableSizes.length > 0 ? (
              availableSizes.slice(0, 8).map(size => (
                <span 
                  key={size}
                  className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-xs rounded"
                >
                  {size}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">No sizes available</span>
            )}
            {availableSizes.length > 8 && (
              <span className="px-2 py-0.5 text-xs text-slate-500">
                +{availableSizes.length - 8} more
              </span>
            )}
          </div>
        </div>

        {/* Color Variant - single colourway */}
        {product.colourway && (
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
              Color
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onAddToCart(product, product.colourway!)}
                className="group/color flex items-center gap-2 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-md hover:border-black dark:hover:border-white hover:shadow-sm transition-all"
                data-testid={`button-add-color-${product.id}-${product.colourway}`}
              >
                <div 
                  className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600"
                  style={{ backgroundColor: getColorHex(product.colourway) }}
                />
                <span className="text-xs font-medium truncate max-w-[80px]">
                  {product.colourway}
                </span>
                <Plus className="w-3 h-3 opacity-0 group-hover/color:opacity-100 transition-opacity -ml-1" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
