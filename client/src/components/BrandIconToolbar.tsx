import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, X, Star, Zap, Award, Heart, TrendingUp } from "lucide-react";
import { SiNike, SiAdidas, SiJordan, SiPuma, SiNewbalance } from "react-icons/si";
import { FaRunning, FaDumbbell, FaBasketballBall } from "react-icons/fa";
import { GiConverseShoe, GiShinyEntrance } from "react-icons/gi";
import type { Product } from "@shared/schema";
import type { FilterState } from "@/lib/types";

interface BrandIconToolbarProps {
  filters: FilterState;
  onToggleArrayFilter: (key: "categories" | "brands" | "sizes" | "colors" | "models", value: string) => void;
}

interface BrandInfo {
  name: string;
  icon: React.ReactNode;
  color: string;
  accent: string;
  description: string;
  trending?: boolean;
  popular?: boolean;
  featured?: boolean;
}

export function BrandIconToolbar({ filters, onToggleArrayFilter }: BrandIconToolbarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  
  // Derive selected brands directly from filters instead of local state
  const selectedBrands = useMemo(() => new Set(filters.brands), [filters.brands]);

  // Get brands from API
  const { data: brandsData = [] } = useQuery({
    queryKey: ["/api/brands"],
  });

  // Build query parameters from filters (excluding brands to get counts for all brands)
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.categories.length > 0) params.set('category', filters.categories.join(','));
    if (filters.minPrice) params.set('minPrice', filters.minPrice.toString());
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice.toString());
    if (filters.sizes.length > 0) params.set('sizes', filters.sizes.join(','));
    if (filters.search) params.set('search', filters.search);
    return params.toString();
  }, [filters.categories, filters.minPrice, filters.maxPrice, filters.sizes, filters.search]);

  const { data: filteredProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", queryParams],
  });

  // Brand icon mapping for known brands
  const getBrandIcon = (brandName: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      "Nike": <SiNike className="w-6 h-6" />,
      "Adidas": <SiAdidas className="w-6 h-6" />,
      "Jordan": <SiJordan className="w-6 h-6" />,
      "Puma": <SiPuma className="w-6 h-6" />,
      "New Balance": <SiNewbalance className="w-6 h-6" />,
      "Converse": <GiConverseShoe className="w-6 h-6" />,
      "Vans": <FaDumbbell className="w-6 h-6" />,
      "Johnston & Murphy": <GiShinyEntrance className="w-6 h-6" />,
    };
    return iconMap[brandName] || <Star className="w-6 h-6" />;
  };

  // Brand color mapping for known brands
  const getBrandColor = (brandName: string) => {
    const colorMap: Record<string, { color: string; accent: string; }> = {
      "Nike": { color: "from-black via-gray-800 to-black", accent: "border-gray-300 hover:border-black" },
      "Adidas": { color: "from-blue-600 via-blue-700 to-blue-800", accent: "border-blue-200 hover:border-blue-500" },
      "Jordan": { color: "from-red-600 via-red-700 to-red-800", accent: "border-red-200 hover:border-red-500" },
      "Puma": { color: "from-amber-500 via-red-600 to-amber-700", accent: "border-amber-200 hover:border-amber-500" },
      "New Balance": { color: "from-gray-600 via-gray-700 to-gray-800", accent: "border-gray-200 hover:border-gray-500" },
      "Converse": { color: "from-purple-600 via-purple-700 to-purple-800", accent: "border-purple-200 hover:border-purple-500" },
      "Vans": { color: "from-green-600 via-green-700 to-green-800", accent: "border-green-200 hover:border-green-500" },
      "Johnston & Murphy": { color: "from-indigo-600 via-indigo-700 to-indigo-800", accent: "border-indigo-200 hover:border-indigo-500" },
    };
    return colorMap[brandName] || { color: "from-gray-500 via-gray-600 to-gray-700", accent: "border-gray-200 hover:border-gray-400" };
  };

  // Transform API brands into BrandInfo format (show all active brands)
  const brandInfo: BrandInfo[] = useMemo(() => {
    return brandsData.filter((brand: any) => brand.isActive).map((brand: any) => ({
      name: brand.name,
      icon: getBrandIcon(brand.name),
      color: getBrandColor(brand.name).color,
      accent: getBrandColor(brand.name).accent,
      description: brand.description || "Premium Brand",
      trending: brand.priority >= 8,
      popular: brand.priority >= 7,
      featured: brand.priority >= 9
    }));
  }, [brandsData]);

  // Get product count for each brand based on current filters (excluding brand filter)
  const brandCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredProducts.forEach(product => {
      counts[product.brand] = (counts[product.brand] || 0) + 1;
    });
    return counts;
  }, [filteredProducts]);

  // Filter brands based on search
  const filteredBrands = useMemo(() => {
    if (!searchQuery.trim()) return brandInfo;
    return brandInfo.filter(brand => 
      brand.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      brand.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [brandInfo, searchQuery]);

  // Handle brand selection
  const handleBrandToggle = useCallback((brandName: string) => {
    onToggleArrayFilter('brands', brandName);
  }, [onToggleArrayFilter]);

  const clearAllSelections = useCallback(() => {
    selectedBrands.forEach(brand => {
      onToggleArrayFilter('brands', brand);
    });
  }, [selectedBrands, onToggleArrayFilter]);

  const getStatusIcon = (brand: BrandInfo) => {
    if (brand.trending) return <TrendingUp className="w-4 h-4 text-red-500" />;
    if (brand.popular) return <Heart className="w-4 h-4 text-pink-500" />;
    if (brand.featured) return <Star className="w-4 h-4 text-yellow-500" />;
    return null;
  };

  return (
    <Card className="mb-6 bg-gradient-to-br from-white via-blue-50 to-purple-50 dark:from-gray-900 dark:via-blue-950 dark:to-purple-950 border-2 border-dashed border-blue-200 dark:border-blue-800">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Zap className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Brand Selection Toolbar
            </h3>
            <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
              <Star className="w-3 h-3 mr-1" />
              Creative Mode
            </Badge>
          </div>
          
          {selectedBrands.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllSelections}
              className="text-red-600 border-red-200 hover:bg-red-50"
              data-testid="button-clear-brands"
            >
              <X className="w-4 h-4 mr-1" />
              Clear All ({selectedBrands.size})
            </Button>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search brands... (Nike, Adidas, etc.)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white/70 backdrop-blur-sm border-blue-200 focus:border-blue-400"
            data-testid="input-search-brands"
          />
        </div>

        {/* Brand Icon Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {filteredBrands.map((brand) => {
            const isSelected = selectedBrands.has(brand.name);
            const productCount = brandCounts[brand.name] || 0;
            const statusIcon = getStatusIcon(brand);

            return (
              <Card
                key={brand.name}
                className={`
                  relative cursor-pointer transition-all duration-200 
                  hover:scale-105 hover:shadow-lg group
                  ${isSelected 
                    ? `bg-gradient-to-br ${brand.color} text-white shadow-lg border-2 ${brand.accent.replace('hover:', '')}` 
                    : `bg-white/80 backdrop-blur-sm border-2 ${brand.accent} hover:shadow-md`
                  }
                `}
                onClick={() => handleBrandToggle(brand.name)}
                data-testid={`card-brand-${brand.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <CardContent className="p-3 text-center">
                  {/* Status indicator */}
                  {statusIcon && (
                    <div className="absolute top-1 right-1">
                      {statusIcon}
                    </div>
                  )}

                  {/* Brand Icon */}
                  <div className={`
                    flex items-center justify-center mb-2 p-2 rounded-full
                    ${isSelected 
                      ? 'bg-white/20 backdrop-blur-sm' 
                      : `bg-gradient-to-br ${brand.color} text-white group-hover:scale-110`
                    }
                    transition-all duration-200
                  `}>
                    {brand.icon}
                  </div>

                  {/* Brand Name */}
                  <div className={`font-semibold text-xs mb-1 ${isSelected ? 'text-white' : 'text-gray-800'}`}>
                    {brand.name}
                  </div>

                  {/* Description */}
                  <div className={`text-xs mb-2 ${isSelected ? 'text-white/80' : 'text-gray-600'}`}>
                    {brand.description}
                  </div>

                  {/* Product Count */}
                  <Badge
                    variant={isSelected ? "secondary" : "outline"}
                    className={`
                      text-xs px-2 py-0.5
                      ${isSelected 
                        ? 'bg-white/20 text-white border-white/30' 
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                      }
                    `}
                  >
                    {productCount} products
                  </Badge>

                  {/* Selection Indicator */}
                  {isSelected && (
                    <div className="absolute -top-1 -right-1">
                      <div className="bg-green-500 text-white rounded-full p-1">
                        <Award className="w-3 h-3" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filteredBrands.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No brands found matching "{searchQuery}"</p>
          </div>
        )}

        {/* Selection Summary */}
        {selectedBrands.size > 0 && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  {selectedBrands.size} brand{selectedBrands.size > 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {Array.from(selectedBrands).map(brand => (
                  <Badge
                    key={brand}
                    variant="secondary"
                    className="text-xs bg-blue-100 text-blue-800 border-blue-200"
                  >
                    {brand}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}