import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { ShoppingCart, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { savePageStateBeforeNavigation } from "@/hooks/usePageState";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Product } from "@shared/schema";
import defaultProductImage from "@assets/image_1764103914777.png";

export interface ProductGroup {
  name: string;
  variants: Product[];
}

interface ShopProductCardProps {
  productGroup: ProductGroup;
  cartProductKeys?: Set<string>;
  onAddToCart?: (product: Product, color: string) => void;
  disabled?: boolean;
}

export function ShopProductCard({
  productGroup,
  cartProductKeys = new Set(),
  onAddToCart,
  disabled = false,
}: ShopProductCardProps) {
  const { variants } = productGroup;
  const { convertPrice, getCurrencySymbol, userCurrency } = useCurrency();
  
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const checkScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, []);

  useEffect(() => {
    checkScrollPosition();
    window.addEventListener('resize', checkScrollPosition);
    return () => window.removeEventListener('resize', checkScrollPosition);
  }, [checkScrollPosition, variants.length]);
  
  useEffect(() => {
    if (selectedVariantIndex >= variants.length) {
      setSelectedVariantIndex(0);
    }
  }, [variants.length, selectedVariantIndex]);
  
  const scrollLeft = () => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollBy({ left: -100, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollBy({ left: 100, behavior: 'smooth' });
    }
  };
  
  const selectedVariant = variants[Math.min(selectedVariantIndex, variants.length - 1)] || variants[0];

  const navigateToProduct = () => {
    const currentPath = window.location.pathname + window.location.search;
    const scrollY = window.scrollY;
    console.log('[SCROLL SAVE] Saving scroll position:', { currentPath, scrollY });
    savePageStateBeforeNavigation(currentPath);
    
    const productData: Product = {
      id: selectedVariant.id,
      name: selectedVariant.name,
      sku: selectedVariant.sku,
      barcode: selectedVariant.barcode,
      category: selectedVariant.category,
      brand: selectedVariant.brand,
      gender: selectedVariant.gender,
      description: selectedVariant.description,
      wholesalePrice: selectedVariant.wholesalePrice,
      retailPrice: selectedVariant.retailPrice,
      imageUrl: selectedVariant.imageUrl,
      image1: selectedVariant.image1,
      image2: selectedVariant.image2,
      image3: selectedVariant.image3,
      image4: selectedVariant.image4,
      availableSizes: selectedVariant.availableSizes || [],
      inStock: selectedVariant.inStock,
      stockLevel: selectedVariant.stockLevel,
      collections: selectedVariant.collections || [],
      stockMatrix: selectedVariant.stockMatrix,
      minOrder: selectedVariant.minOrder,
      countryOfOrigin: selectedVariant.countryOfOrigin,
      division: selectedVariant.division,
      isPreOrder: selectedVariant.isPreOrder,
      keyCategory: selectedVariant.keyCategory,
      colourway: selectedVariant.colourway,
      ageGroup: selectedVariant.ageGroup,
      corporateMarketingLine: selectedVariant.corporateMarketingLine,
      productLine: selectedVariant.productLine,
      productType: selectedVariant.productType,
      sportsCategory: selectedVariant.sportsCategory,
      moq: selectedVariant.moq,
      conditions: selectedVariant.conditions,
      materialComposition: selectedVariant.materialComposition,
      discount: selectedVariant.discount,
      rawAttributes: selectedVariant.rawAttributes || {},
      unitsPerCarton: selectedVariant.unitsPerCarton,
      mainCategory: selectedVariant.mainCategory,
      kidsGender: selectedVariant.kidsGender,
      kidsAgeGroup: selectedVariant.kidsAgeGroup,
      cost: selectedVariant.cost,
      primaryColor: selectedVariant.primaryColor,
    };
    window.history.pushState({ product: productData, fromPage: currentPath }, "", `/product/${selectedVariant.id}`);
    window.dispatchEvent(new PopStateEvent("popstate", { state: { product: productData, fromPage: currentPath } }));
  };

  const handleAddToCart = (variant: Product, color: string) => {
    if (onAddToCart) {
      onAddToCart(variant, color);
    }
  };

  const getVariantColor = (variant: Product): string => {
    if (variant.colourway) {
      return variant.colourway;
    }
    return "Default";
  };

  const variantColors = useMemo(() => {
    return variants.map((variant, index) => ({
      variant,
      index,
      color: getVariantColor(variant),
    }));
  }, [variants]);

  const isVariantInCart = (variant: Product, color: string) => {
    const sku = variant.sku || '';
    return cartProductKeys.has(`${sku}-${color}`);
  };

  // Shop card requirement: show integer prices only (no decimals)
  const formatIntegerPrice = (price: number, fromCurrency: string = "USD") => {
    const convertedPrice = convertPrice(price, fromCurrency);
    const rounded = Math.round(convertedPrice);
    return `${getCurrencySymbol(userCurrency)}${rounded.toLocaleString("en-US")}`;
  };

  return (
    <div className="group bg-white rounded-2xl relative overflow-hidden border border-black/30 shadow-sm hover:shadow-xl hover:border-black/50 transition-all duration-300 hover:-translate-y-1">
      {selectedVariant.isPreOrder && (
        <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-10">
          <span className="inline-flex items-center px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-white shadow-lg" style={{ backgroundColor: '#FD4338' }}>
            Pre-Order
          </span>
        </div>
      )}
      
      <div className="relative">
        <div 
          className="aspect-square bg-gradient-to-br from-gray-50 to-white cursor-pointer flex items-center justify-center p-3 sm:p-6"
          onClick={navigateToProduct}
          data-testid={`link-product-${selectedVariant.id}`}
        >
          <img
            src={selectedVariant.image1 || defaultProductImage}
            alt={selectedVariant.name}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              (e.target as HTMLImageElement).src = defaultProductImage;
            }}
          />
        </div>

        {(() => {
          const color = getVariantColor(selectedVariant);
          const inCart = isVariantInCart(selectedVariant, color);
          
          return (
            <button
              onClick={() => handleAddToCart(selectedVariant, color)}
              disabled={disabled}
              className={`absolute top-2 right-2 sm:top-4 sm:right-4 h-8 sm:h-10 flex items-center justify-center gap-1 sm:gap-2 transition-all duration-300 ease-out disabled:opacity-50 disabled:cursor-not-allowed rounded-full px-2.5 sm:px-4 shadow-lg ${
                inCart 
                  ? "bg-gradient-to-r from-[#FE4438] to-[#FE4438] text-white shadow-[#FE4438]/30" 
                  : "bg-white/90 backdrop-blur-sm hover:bg-white text-gray-700 hover:text-[#FE4438] border border-gray-200"
              }`}
              data-testid={`button-add-to-cart-main-${selectedVariant.id}`}
            >
              {inCart ? (
                <Check className="w-3 h-3 sm:w-4 sm:h-4" strokeWidth={2.5} />
              ) : (
                <ShoppingCart className="w-3 h-3 sm:w-4 sm:h-4" strokeWidth={2} />
              )}
              <span 
                className={`text-[10px] sm:text-xs font-semibold whitespace-nowrap overflow-hidden transition-all duration-300 ${
                  inCart ? "max-w-20 opacity-100" : "max-w-0 opacity-0"
                }`}
              >
                Added
              </span>
            </button>
          );
        })()}
      </div>

      <div className="relative px-2 sm:px-4 pt-2">
        {canScrollLeft && (
          <button
            onClick={scrollLeft}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-20 w-6 h-6 flex items-center justify-center bg-white shadow-md rounded-full hover:bg-gray-50 transition-all border border-gray-100"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-gray-600" />
          </button>
        )}
        {canScrollRight && (
          <>
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none z-10" />
            <button
              onClick={scrollRight}
              className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-6 h-6 flex items-center justify-center bg-white shadow-md rounded-full hover:bg-gray-50 transition-all border border-gray-100"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
            </button>
          </>
        )}
        <div 
          ref={scrollContainerRef}
          onScroll={checkScrollPosition}
          className="flex items-center gap-1.5 overflow-x-auto py-2 px-1 touch-pan-x" 
          style={{ scrollbarWidth: 'none' }}
        >
          {variants.map((variant: Product, index: number) => {
            const color = getVariantColor(variant);
            const variantLabel = variant.sku || color;
            const isSelected = index === selectedVariantIndex;
            const variantInCart = isVariantInCart(variant, color);
            
            return (
              <div 
                key={variant.id} 
                className="relative flex-shrink-0"
              >
                <button
                  onClick={() => setSelectedVariantIndex(index)}
                  className={`w-9 h-9 sm:w-12 sm:h-12 rounded-lg transition-all overflow-hidden border-2 ${
                    isSelected 
                      ? 'border-gray-900 shadow-md' 
                      : 'border-transparent hover:border-gray-300'
                  }`}
                  aria-label={variantLabel}
                  title={variantLabel}
                  data-testid={`variant-${variant.id}`}
                >
                  <img
                    src={variant.image1 || defaultProductImage}
                    alt={variantLabel}
                    className="w-full h-full object-contain bg-gray-50"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = defaultProductImage;
                    }}
                  />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddToCart(variant, color);
                  }}
                  disabled={disabled}
                  className={`absolute -top-0.5 -right-0.5 h-4 flex items-center justify-center rounded-full shadow-sm transition-all duration-300 ease-out disabled:opacity-50 ${
                    variantInCart 
                      ? "bg-gradient-to-br from-[#FE4438] to-[#FE4438] px-1.5" 
                      : "w-4 bg-white border border-gray-200 hover:scale-110 hover:border-[#FE4438]"
                  }`}
                  data-testid={`button-add-to-cart-variant-${variant.id}`}
                >
                  {variantInCart ? (
                    <Check className="w-2 h-2 text-white" strokeWidth={3} />
                  ) : (
                    <ShoppingCart className="w-2 h-2 text-gray-500" strokeWidth={2.5} />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative px-2 sm:px-4 pb-12 sm:pb-14 pt-2 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-gray-400 text-xs font-medium tracking-wide uppercase">
            {selectedVariant.sku}
          </p>
          {selectedVariant.brand && (
            <p className="text-xs font-medium text-gray-500">
              {selectedVariant.brand}
            </p>
          )}
        </div>
        <h3 
          className="text-xs sm:text-[15px] font-semibold text-gray-900 line-clamp-2 leading-snug cursor-pointer hover:text-[#FE4438] transition-colors"
          onClick={navigateToProduct}
        >
          {selectedVariant.name}
        </h3>
        <p className="pt-1 text-[10px] sm:text-xs text-gray-500 leading-none">
          {selectedVariant.gender}
        </p>
        <div className="absolute bottom-2 sm:bottom-3 right-2 sm:right-4 text-right space-y-0">
          <p className="text-[10px] sm:text-xs text-gray-400 font-medium leading-none">
            Wholesale Price: <span className="text-black text-sm sm:text-base font-bold">{formatIntegerPrice(Number(selectedVariant.wholesalePrice), selectedVariant.baseCurrency || "USD")}</span>
          </p>
          <p className="text-[10px] sm:text-xs text-gray-400 font-medium leading-none">
            Retail Price: <span className="text-black text-sm sm:text-base font-bold">{formatIntegerPrice(Number(selectedVariant.retailPrice), selectedVariant.baseCurrency || "USD")}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
