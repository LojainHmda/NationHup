import { useMemo, useCallback, useState, useEffect } from "react";
import type { Brand, Product } from "@shared/schema";
import type { ShopCartProduct } from "@/components/shop/ShopCartTable";
import {
  rawLinesToShopCartProducts,
  shopCartProductsToRawLines,
  type RawOrderLine,
} from "@/lib/rawOrderLinesShopCart";

type SizeStandard = "EU" | "US" | "UK";

export function useOrderEditShopCartModel(
  lines: RawOrderLine[],
  setLines: React.Dispatch<React.SetStateAction<RawOrderLine[]>>,
  products: Product[],
  brands: Brand[],
  enabled: boolean,
) {
  const [selectedSizeStandard, setSelectedSizeStandard] = useState<SizeStandard>("EU");

  const editCart = useMemo(
    () => (enabled ? rawLinesToShopCartProducts(lines, products) : []),
    [lines, products, enabled],
  );

  const applyCartFromLines = useCallback(
    (prevLines: RawOrderLine[], newCart: ShopCartProduct[]) =>
      shopCartProductsToRawLines(newCart, prevLines),
    [],
  );

  const cartBrands = useMemo(() => {
    const brandNames = new Set<string>();
    editCart.forEach((product) => {
      if (product.brand) brandNames.add(product.brand);
    });
    return Array.from(brandNames);
  }, [editCart]);

  const primaryBrand = useMemo(() => {
    if (cartBrands.length === 0 || brands.length === 0) return null;
    return (
      brands.find((b) => b.id === cartBrands[0]) ||
      brands.find((b) => b.name?.toLowerCase() === cartBrands[0]?.toLowerCase()) ||
      null
    );
  }, [cartBrands, brands]);

  const normalizeSize = useCallback((size: string): string => {
    if (!size) return "";
    let normalized = String(size).trim().toUpperCase();
    normalized = normalized.replace(/^(US|UK|EU|SIZE)\s*/i, "");
    normalized = normalized.replace(/\s*(M|W|MEN|WOMEN)$/i, "");
    normalized = normalized.replace(/(\d+)\s*[/]\s*2/, "$1.5");
    normalized = normalized.replace(/\s+/g, "");
    return normalized;
  }, []);

  const brandSizeStandards = useMemo(() => {
    if (!primaryBrand?.sizeStandards) return null;
    const standards = primaryBrand.sizeStandards as Record<
      string,
      { EU?: string[]; US?: string[]; UK?: string[] }
    >;
    const categories = Object.keys(standards);
    if (categories.length === 0) return null;

    const cartSizes: string[] = [];
    editCart.forEach((product) => {
      product.sizes.forEach((size) => cartSizes.push(normalizeSize(size)));
    });

    let bestCategory: string | null = null;
    let bestMatchCount = 0;

    for (const category of categories) {
      const catStandards = standards[category];
      if (!catStandards) continue;
      let categoryMatchCount = 0;
      for (const standard of ["EU", "US", "UK"] as const) {
        const standardSizes = catStandards[standard] || [];
        const normalizedSizes = standardSizes.filter((s) => s !== "-").map((s) => normalizeSize(s));
        const matches = cartSizes.filter((size) => normalizedSizes.includes(size)).length;
        if (matches > categoryMatchCount) {
          categoryMatchCount = matches;
        }
      }
      if (categoryMatchCount > bestMatchCount) {
        bestMatchCount = categoryMatchCount;
        bestCategory = category;
      }
    }

    if (bestCategory && standards[bestCategory]) {
      return standards[bestCategory];
    }
    return standards[categories[0]] || null;
  }, [primaryBrand, editCart, normalizeSize]);

  const detectedBaseStandard = useMemo((): SizeStandard | null => {
    if (!brandSizeStandards || editCart.length === 0) return null;
    const cartSizes: string[] = [];
    editCart.forEach((product) => {
      product.sizes.forEach((size) => cartSizes.push(normalizeSize(size)));
    });
    if (cartSizes.length === 0) return null;

    const stds: SizeStandard[] = ["EU", "US", "UK"];
    let bestMatch: { standard: SizeStandard; matches: number } | null = null;

    for (const standard of stds) {
      const standardSizes = brandSizeStandards[standard] || [];
      if (standardSizes.length === 0) continue;
      const normalizedStandardSizes = standardSizes
        .filter((s) => s !== "-")
        .map((s) => normalizeSize(s));
      const matches = cartSizes.filter((size) => normalizedStandardSizes.includes(size)).length;
      if (matches > 0 && (!bestMatch || matches > bestMatch.matches)) {
        bestMatch = { standard, matches };
      }
    }

    if (bestMatch && bestMatch.matches >= Math.floor(cartSizes.length * 0.3)) {
      return bestMatch.standard;
    }
    return null;
  }, [brandSizeStandards, editCart, normalizeSize]);

  const availableSizeStandards = useMemo(() => {
    if (!brandSizeStandards || !detectedBaseStandard) {
      return { EU: false, US: false, UK: false };
    }
    const baseLen = (brandSizeStandards[detectedBaseStandard] || []).length;
    if (baseLen === 0) return { EU: false, US: false, UK: false };
    const euLen = (brandSizeStandards.EU || []).length;
    const usLen = (brandSizeStandards.US || []).length;
    const ukLen = (brandSizeStandards.UK || []).length;
    return {
      EU: euLen > 0,
      US: usLen > 0,
      UK: ukLen > 0,
    };
  }, [brandSizeStandards, detectedBaseStandard]);

  const hasSizeConversion = useMemo(() => {
    if (!detectedBaseStandard) return false;
    const otherStandards = (["EU", "US", "UK"] as SizeStandard[]).filter(
      (s) => s !== detectedBaseStandard,
    );
    return otherStandards.some((s) => availableSizeStandards[s]);
  }, [detectedBaseStandard, availableSizeStandards]);

  const convertSize = useCallback(
    (originalSize: string): string => {
      if (!brandSizeStandards || !detectedBaseStandard) {
        return originalSize;
      }
      if (selectedSizeStandard === detectedBaseStandard) {
        return originalSize;
      }
      if (!availableSizeStandards[selectedSizeStandard]) {
        return originalSize;
      }
      const baseSizes = brandSizeStandards[detectedBaseStandard] || [];
      const targetSizes = brandSizeStandards[selectedSizeStandard] || [];
      const normalizedOriginal = normalizeSize(originalSize);
      const index = baseSizes.findIndex((s) => normalizeSize(s) === normalizedOriginal);
      if (index === -1 || !targetSizes[index] || targetSizes[index] === "-") {
        return originalSize;
      }
      return targetSizes[index];
    },
    [
      brandSizeStandards,
      selectedSizeStandard,
      detectedBaseStandard,
      availableSizeStandards,
      normalizeSize,
    ],
  );

  useEffect(() => {
    if (detectedBaseStandard && selectedSizeStandard !== detectedBaseStandard) {
      setSelectedSizeStandard(detectedBaseStandard);
    }
  }, [detectedBaseStandard]);

  const getDisplayCategory = useCallback((product: ShopCartProduct): string => {
    const main = product.mainCategory?.toUpperCase().trim() || "";
    const ageGroup = product.kidsAgeGroup?.toUpperCase().trim() || "";
    const g = product.gender?.toUpperCase().trim() || "";

    if (ageGroup === "LARGE" || ageGroup === "KIDS - LARGE") return "Kids - Large";
    if (ageGroup === "JUNIOR" || ageGroup === "KIDS - JUNIOR") return "Kids - Junior";
    if (
      ageGroup === "NEW BORN" ||
      ageGroup === "NEWBORN" ||
      ageGroup === "KIDS - NEWBORN"
    ) {
      return "Kids - Newborn";
    }
    if (g.includes("JUNIOR")) return "Kids - Junior";
    if (g.includes("LARGE") && g.includes("KIDS")) return "Kids - Large";
    if (g.includes("NEWBORN") || g.includes("NEW BORN")) return "Kids - Newborn";

    if (main === "MEN") return "Men";
    if (main === "WOMEN") return "Women";
    if (main === "ADULT UNISEX") return "Adult Unisex";
    if (main === "KIDS") return "Kids - Junior";

    if (g === "MEN" || g === "MALE" || g === "MENS") return "Men";
    if (g === "WOMEN" || g === "FEMALE" || g === "WOMENS" || g === "LADIES") return "Women";
    if (g === "ADULT UNISEX" || (g === "UNISEX" && !g.includes("JUNIOR"))) return "Adult Unisex";
    if (g.includes("KIDS") || g.includes("CHILD")) return "Kids - Junior";

    return "Other";
  }, []);

  const productsByGender = useMemo(() => {
    const categoryOrder = [
      "Men",
      "Women",
      "Adult Unisex",
      "Kids - Large",
      "Kids - Junior",
      "Kids - Newborn",
    ];
    const grouped = new Map<string, ShopCartProduct[]>();

    editCart.forEach((product) => {
      const category = getDisplayCategory(product);
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(product);
    });

    return Array.from(grouped.entries())
      .filter(([category]) => categoryOrder.includes(category) || (grouped.get(category)?.length ?? 0) > 0)
      .sort((a, b) => {
        const indexA = categoryOrder.indexOf(a[0]);
        const indexB = categoryOrder.indexOf(b[0]);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
      });
  }, [editCart, getDisplayCategory]);

  const baseSizes = useMemo(() => {
    const sizeSet = new Set<string>();
    editCart.forEach((product) => {
      product.sizes.forEach((size) => sizeSet.add(size));
    });
    return Array.from(sizeSet).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
  }, [editCart]);

  const allSizes = baseSizes;

  const { totalItems, totalPrice } = useMemo(() => {
    let items = 0;
    let price = 0;
    editCart.forEach((product) => {
      Object.values(product.quantities).forEach((q) => {
        items += q;
        price += product.price * q;
      });
    });
    return { totalItems: items, totalPrice: price };
  }, [editCart]);

  const handleQuantityChange = useCallback(
    (productId: string, size: string, quantity: number) => {
      setLines((prev) => {
        const cart = rawLinesToShopCartProducts(prev, products);
        const newCart = cart
          .map((p) => {
            if (p.id !== productId) return { ...p, quantities: { ...p.quantities } };
            const nextQ = { ...p.quantities };
            if (quantity <= 0) delete nextQ[size];
            else nextQ[size] = quantity;
            return { ...p, quantities: nextQ, sizes: Object.keys(nextQ) };
          })
          .filter((p) => Object.keys(p.quantities).some((k) => (p.quantities[k] ?? 0) > 0));
        return applyCartFromLines(prev, newCart);
      });
    },
    [products, setLines, applyCartFromLines],
  );

  const handleBulkQuantityChange = useCallback(
    (updates: Array<{ productId: string; size: string; quantity: number }>) => {
      if (updates.length === 0) return;
      setLines((prev) => {
        let newCart = rawLinesToShopCartProducts(prev, products).map((p) => ({
          ...p,
          quantities: { ...p.quantities },
        }));
        updates.forEach(({ productId, size, quantity }) => {
          const p = newCart.find((x) => x.id === productId);
          if (!p) return;
          if (quantity <= 0) delete p.quantities[size];
          else p.quantities[size] = quantity;
          p.sizes = Object.keys(p.quantities);
        });
        newCart = newCart.filter((p) => Object.values(p.quantities).some((q) => q > 0));
        return applyCartFromLines(prev, newCart);
      });
    },
    [products, setLines, applyCartFromLines],
  );

  const handleRemoveProduct = useCallback(
    (productId: string) => {
      setLines((prev) => {
        const newCart = rawLinesToShopCartProducts(prev, products).filter((p) => p.id !== productId);
        return applyCartFromLines(prev, newCart);
      });
    },
    [products, setLines, applyCartFromLines],
  );

  const handleToggleSelect = useCallback((_productId: string, _selected: boolean) => {}, []);

  const isLoadingProducts = enabled && lines.length > 0 && products.length === 0;

  return {
    selectedSizeStandard,
    setSelectedSizeStandard,
    productsByGender,
    allSizes,
    hasSizeConversion,
    availableSizeStandards,
    convertSize,
    handleQuantityChange,
    handleBulkQuantityChange,
    handleRemoveProduct,
    handleToggleSelect,
    totalItems,
    totalPrice,
    isLoadingProducts,
    hasProducts: editCart.length > 0,
  };
}
