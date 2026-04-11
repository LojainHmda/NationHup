import type { Product } from "@shared/schema";
import type { ShopCartProduct } from "@/components/shop/ShopCartTable";

/** Matches order line / OrderFlowOrder raw item shape */
export type RawOrderLine = {
  productId: string;
  productName: string;
  sku: string;
  brand: string;
  size: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  color?: string;
  unitsPerCarton?: number;
};

/** Build ShopCartProduct[] from flat order lines (same grouping rules as cart draft transform). */
export function rawLinesToShopCartProducts(
  lines: RawOrderLine[],
  products: Product[],
): ShopCartProduct[] {
  if (!lines?.length) return [];
  const grouped = new Map<string, ShopCartProduct>();
  lines.forEach((item) => {
    if (!item.productId) return;
    const key = item.productId;
    const product = products.find((p) => p.id === item.productId);
    const displayColor = product?.colourway || item.color || "Default";
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        sku: item.sku || "",
        name: item.productName || "",
        color: displayColor,
        image1: "",
        price: item.unitPrice,
        sizes: [],
        quantities: {},
        availableSizes: {},
        isPreOrder: false,
        brand: item.brand || product?.brand || "",
        unitsPerCarton: product?.unitsPerCarton || item.unitsPerCarton || 0,
        unitsPerSize: product?.unitsPerSize || {},
        gender: product?.gender || "Other",
        mainCategory: product?.mainCategory || "",
        kidsAgeGroup: product?.kidsAgeGroup || "",
        limitOrder: product?.limitOrder ?? undefined,
      });
    }
    const cartProduct = grouped.get(key)!;
    if (item.size) {
      cartProduct.quantities[item.size] =
        (cartProduct.quantities[item.size] || 0) + item.quantity;
      if (!cartProduct.sizes.includes(item.size)) {
        cartProduct.sizes.push(item.size);
      }
    }

    if (product) {
      cartProduct.image1 = product.image1;
      cartProduct.isPreOrder = product.isPreOrder;
      cartProduct.unitsPerCarton = product.unitsPerCarton || 0;
      cartProduct.unitsPerSize = product.unitsPerSize || {};
      cartProduct.gender = product.gender || "Other";
      cartProduct.limitOrder = product.limitOrder ?? undefined;
      cartProduct.limitOrderPerSize = (
        product.availableSizes as { size: string; limitOrder?: number }[] | undefined
      )
        ? Object.fromEntries(
            (product.availableSizes as { size: string; limitOrder?: number }[])
              .filter((s) => s.limitOrder != null && s.limitOrder >= 1)
              .map((s) => [s.size, s.limitOrder!]),
          )
        : undefined;
      cartProduct.supportedSizes = (product.availableSizes as { size: string }[] | undefined)?.map(
        (s) => s.size,
      );
      const sizeObj = (product.availableSizes as { size: string; stock?: number }[]).find(
        (s) => s.size === item.size,
      );
      if (item.size) {
        cartProduct.availableSizes[item.size] = sizeObj?.stock || 0;
      }
    }
  });
  return Array.from(grouped.values());
}

/** Flatten cart grid back to API raw lines; preserve extra fields from previous lines when possible. */
export function shopCartProductsToRawLines(
  cart: ShopCartProduct[],
  fallbackLines: RawOrderLine[],
): RawOrderLine[] {
  const out: RawOrderLine[] = [];
  for (const p of cart) {
    const realId = p.id.includes("::") ? (p.id.split("::")[0] as string) : p.id;
    for (const [size, qty] of Object.entries(p.quantities)) {
      if (!qty || qty <= 0) continue;
      const prev =
        fallbackLines.find((l) => l.productId === realId && l.size === size) ??
        fallbackLines.find((l) => l.productId === realId);
      const unitPrice = p.price;
      out.push({
        productId: realId,
        productName: p.name,
        sku: p.sku,
        brand: prev?.brand ?? p.brand ?? "",
        size,
        quantity: qty,
        unitPrice,
        totalPrice: unitPrice * qty,
        color: p.color,
        unitsPerCarton: p.unitsPerCarton ?? prev?.unitsPerCarton,
      });
    }
  }
  return out;
}
