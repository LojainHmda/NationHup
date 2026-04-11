import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { FilterState } from "@/lib/types";
import type { Brand, Product } from "@shared/schema";

interface BrandLogoFilterProps {
  filters: FilterState;
  onToggleArrayFilter: (key: 'brands', value: string) => void;
  variant?: 'simple' | 'cards';
  productType?: 'preorder' | 'stock' | null;
}


export function BrandLogoFilter({ filters, onToggleArrayFilter, variant = 'simple', productType }: BrandLogoFilterProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  
  const { data: brandsData = [] } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

  const isPreOrderParam = productType === 'preorder' ? 'true' : productType === 'stock' ? 'false' : undefined;
  
  const { data: brandCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/products/brand-counts", isPreOrderParam],
    queryFn: async () => {
      const url = isPreOrderParam 
        ? `/api/products/brand-counts?isPreOrder=${isPreOrderParam}`
        : '/api/products/brand-counts';
      const res = await fetch(url);
      return res.json();
    },
  });

  const availableBrands = useMemo(() => {
    return brandsData
      .filter((brand: Brand) => brand.isActive)
      .sort((a: Brand, b: Brand) => b.priority - a.priority);
  }, [brandsData]);
  
  const checkScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const hasOverflow = container.scrollWidth > container.clientWidth;
    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(hasOverflow && container.scrollLeft < container.scrollWidth - container.clientWidth - 10);
  }, []);

  useEffect(() => {
    const timer = setTimeout(checkScroll, 50);
    const timer2 = setTimeout(checkScroll, 200);
    const timer3 = setTimeout(checkScroll, 500);
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      return () => {
        clearTimeout(timer);
        clearTimeout(timer2);
        clearTimeout(timer3);
        container.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
    return () => {
      clearTimeout(timer);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [availableBrands, checkScroll]);

  const scrollLeft = () => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollBy({ left: -400, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollBy({ left: 400, behavior: 'smooth' });
    }
  };

  if (variant === 'simple') {
    return (
      <div className="relative w-full">
        {canScrollLeft && (
          <button
            onClick={scrollLeft}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center bg-white rounded-full shadow-lg border border-gray-100 text-gray-600 hover:text-[#FE4438] hover:border-[#FE4438]/30 transition-all duration-300"
            data-testid="brand-carousel-left"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <div
          ref={scrollContainerRef}
          className="flex overflow-x-auto gap-4 px-12 py-2"
          style={{ scrollBehavior: "smooth", scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {availableBrands.map((brand: Brand) => {
            const productCount = brandCounts[brand.name] || 0;
            
            return (
              <div
                key={brand.id}
                onClick={() => onToggleArrayFilter('brands', brand.name)}
                className={`group relative flex-shrink-0 w-[160px] p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer hover:shadow-md ${
                  filters.brands.includes(brand.name)
                    ? 'bg-[#FE4438]/10 border-[#FE4438] ring-2 ring-[#FE4438]/30'
                    : 'bg-white border-gray-100 hover:border-[#FE4438]/50'
                }`}
                data-testid={`brand-logo-${brand.slug}`}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 flex items-center justify-center">
                    {brand.logoUrl ? (
                      <img 
                        src={brand.logoUrl} 
                        alt={`${brand.name} logo`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold bg-gray-100 text-gray-600">
                        {brand.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  
                  <div className="text-center">
                    <span className="text-sm font-semibold text-gray-700">
                      {brand.name}
                    </span>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {productCount} {productCount === 1 ? 'product' : 'products'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {canScrollRight && (
          <button
            onClick={scrollRight}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center bg-white rounded-full shadow-lg border border-gray-100 text-gray-600 hover:text-[#FE4438] hover:border-[#FE4438]/30 transition-all duration-300"
            data-testid="brand-carousel-right"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden">
      <div className="relative group">
        {canScrollLeft && (
          <Button
            variant="outline"
            size="icon"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white shadow-lg rounded-full w-10 h-10 hover:bg-gray-50 border-gray-100"
            onClick={scrollLeft}
            data-testid="brand-carousel-left"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}

        <div 
          ref={scrollContainerRef}
          className="flex overflow-x-auto gap-4 pb-2 px-1"
          style={{ 
            scrollBehavior: 'smooth',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {availableBrands.map((brand: Brand) => {
            const productCount = brandCounts[brand.name] || 0;
            
            return (
              <div
                key={brand.id}
                onClick={() => onToggleArrayFilter('brands', brand.name)}
                className={`group relative p-5 rounded-2xl border-2 transition-all duration-300 flex-shrink-0 cursor-pointer hover:shadow-md ${
                  filters.brands.includes(brand.name)
                    ? 'bg-[#FE4438]/10 border-[#FE4438] ring-2 ring-[#FE4438]/30'
                    : 'bg-white border-gray-100 hover:border-[#FE4438]/50'
                }`}
                style={{ width: 'calc((100% - 72px) / 5)', minWidth: '180px', maxWidth: '220px' }}
                data-testid={`brand-logo-${brand.slug}`}
              >
                <div className="flex flex-col items-center space-y-3">
                  <div className="w-20 h-14 flex items-center justify-center">
                    {brand.logoUrl ? (
                      <img 
                        src={brand.logoUrl} 
                        alt={`${brand.name} logo`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold bg-gray-100 text-gray-600">
                        {brand.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  
                  <div className="text-center w-full">
                    <p className="text-sm font-semibold truncate text-gray-800">
                      {brand.name}
                    </p>
                    {productCount > 0 && (
                      <Badge className="text-xs mt-2 bg-gray-100 text-gray-600">
                        {productCount} {productCount === 1 ? 'item' : 'items'}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {canScrollRight && (
          <Button
            variant="outline"
            size="icon"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white shadow-lg rounded-full w-10 h-10 hover:bg-gray-50 border-gray-100"
            onClick={scrollRight}
            data-testid="brand-carousel-right"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  );
}
