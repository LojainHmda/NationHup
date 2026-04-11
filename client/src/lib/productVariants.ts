import type { Product } from '@shared/schema';

export interface ColorVariant {
  colorId: string;
  label: string;
  thumbUrl: string;
  sizes: Array<{
    size: string;
    stock: number;
  }>;
}

export interface ProductVariantMatrix {
  productId: string;
  productName: string;
  brand: string;
  price: string;
  colors: ColorVariant[];
  allSizes: string[];
}

export function mapProductVariants(product: Product): ProductVariantMatrix {
  const colorValue = product.colourway || 'Default';
  const colors: ColorVariant[] = [{
    colorId: colorValue.toLowerCase().replace(/\s+/g, '-'),
    label: colorValue,
    thumbUrl: product.image1,
    sizes: product.availableSizes.map(s => ({
      size: s.size,
      stock: s.stock
    }))
  }];

  const allSizes = product.availableSizes.map(s => s.size);

  return {
    productId: product.id,
    productName: product.name,
    brand: product.brand,
    price: product.wholesalePrice,
    colors,
    allSizes
  };
}

// Generate a color swatch placeholder for colors without specific images
function generateColorPlaceholder(colorName: string): string {
  const colorMap: Record<string, string> = {
    'black': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23000000"/%3E%3C/svg%3E',
    'white': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23FFFFFF" stroke="%23CCCCCC"/%3E%3C/svg%3E',
    'red': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23DC2626"/%3E%3C/svg%3E',
    'blue': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%232563EB"/%3E%3C/svg%3E',
    'brown': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23654321"/%3E%3C/svg%3E',
    'navy': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23000080"/%3E%3C/svg%3E',
    'grey': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23808080"/%3E%3C/svg%3E',
    'gray': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23808080"/%3E%3C/svg%3E',
    'green': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%2316A34A"/%3E%3C/svg%3E',
    'yellow': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23EAB308"/%3E%3C/svg%3E',
    'pink': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23EC4899"/%3E%3C/svg%3E',
    'rose': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23F43F5E"/%3E%3C/svg%3E',
  };
  
  const normalizedColor = colorName.toLowerCase();
  return colorMap[normalizedColor] || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23999999"/%3E%3C/svg%3E';
}

export function getStockForColorSize(variant: ColorVariant, size: string): number {
  const sizeData = variant.sizes.find(s => s.size === size);
  return sizeData?.stock ?? 0;
}

export function formatCellKey(colorId: string, size: string): string {
  return `${colorId}-${size}`;
}

export function parseCellKey(cellKey: string): { colorId: string; size: string } {
  const [colorId, size] = cellKey.split('-');
  return { colorId, size };
}
