import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import {
  Zap,
  Users,
  Calendar,
  User,
  MapPin,
  Palette,
  DollarSign,
  Ruler,
} from "lucide-react";
import type { FilterState } from "@/lib/types";
import type { Category, Product, Brand } from "@shared/schema";
import { FILTER_OPTIONS, FILTER_LABELS, SIZE_STANDARDS, type SizeStandard } from "@/lib/filterConstants";

interface FilterSidebarProps {
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: any) => void;
  onToggleArrayFilter: (
    key:
      | "categories"
      | "brands"
      | "collections"
      | "sizes"
      | "colors"
      | "models"
      | "styles"
      | "ageRanges"
      | "occasions"
      | "genders"
      | "supplierLocations"
      | "mainCategories"
      | "kidsGenders"
      | "kidsAgeGroups"
      | "divisions",
    value: string,
  ) => void;
  onRemoveFilter: (key: keyof FilterState, value?: string) => void;
  activeFilters: { key: keyof FilterState; value: string; label: string }[];
  isHorizontal?: boolean;
  productType?: "preorder" | "stock" | null;
  sizeStandard?: SizeStandard;
}

export function FilterSidebar({
  filters,
  onFilterChange,
  onToggleArrayFilter,
  isHorizontal = false,
  productType,
  sizeStandard = "EU",
}: FilterSidebarProps) {
  // Get categories from API
  const { data: categoriesData = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  // Get brands from API to access their size charts
  const { data: brandsData = [] } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

  // Map Gender + Age Group selections to brand size chart category keys
  // Brand size charts use: Adult Female, Adult Male, Unisex, Kids Female, Kids Male, Kids Unisex, Infant
  // Filters use: mainCategories (Male, Female, Unisex) and kidsAgeGroups (Adult, Junior, Kids, Infant)
  const getRelevantCategories = useCallback(() => {
    const genders = filters.mainCategories || [];
    const ageGroups = filters.kidsAgeGroups || [];
    
    // If no filters selected, return null (show all categories)
    if (genders.length === 0 && ageGroups.length === 0) {
      return null;
    }
    
    const categories = new Set<string>();
    
    // Determine which age group types are selected
    const hasAdult = ageGroups.length === 0 || ageGroups.includes('Adult');
    const hasKids = ageGroups.some(ag => ['Junior', 'Kids'].includes(ag));
    const hasInfant = ageGroups.includes('Infant');
    
    // Map combinations to brand size chart category keys (must match product-detail.tsx keys)
    // Also include legacy keys (Men, Women, Kids) for backward compatibility with existing brands
    genders.forEach(gender => {
      if (hasAdult || ageGroups.length === 0) {
        if (gender === 'Male') {
          categories.add('Adult Male');
          categories.add('Unisex');
          categories.add('Men');
        }
        if (gender === 'Female') {
          categories.add('Adult Female');
          categories.add('Unisex');
          categories.add('Women');
        }
        if (gender === 'Unisex') {
          categories.add('Unisex');
          categories.add('Adult Male');
          categories.add('Adult Female');
          categories.add('Men');
          categories.add('Women');
        }
      }
      if (hasKids) {
        categories.add('Kids Female');
        categories.add('Kids Male');
        categories.add('Kids Unisex');
        categories.add('Kids');
      }
      if (hasInfant) {
        categories.add('Infant');
      }
    });
    
    // If only age groups selected (no gender)
    if (genders.length === 0 && ageGroups.length > 0) {
      if (hasAdult) {
        categories.add('Adult Male');
        categories.add('Adult Female');
        categories.add('Unisex');
        categories.add('Men');
        categories.add('Women');
      }
      if (hasKids) {
        categories.add('Kids Female');
        categories.add('Kids Male');
        categories.add('Kids Unisex');
        categories.add('Kids');
      }
      if (hasInfant) {
        categories.add('Infant');
      }
    }
    
    return categories.size > 0 ? categories : null;
  }, [filters.mainCategories, filters.kidsAgeGroups]);

  // Brand-aware sizes: show only sizes for selected brand, gender, age group, and size standard
  const sizes = useMemo(() => {
    const relevantCategories = getRelevantCategories();
    
    // If no brand selected, show all sizes for the selected standard
    if (filters.brands.length === 0) {
      return SIZE_STANDARDS[sizeStandard] || SIZE_STANDARDS.EU;
    }
    
    // Find the selected brand(s) and get their sizes
    const selectedBrands = brandsData.filter(b => filters.brands.includes(b.name));
    if (selectedBrands.length === 0) {
      return SIZE_STANDARDS[sizeStandard] || SIZE_STANDARDS.EU;
    }
    
    // Collect sizes from selected brands' for the selected standard only
    const allSizes = new Set<string>();
    selectedBrands.forEach(brand => {
      if (brand.sizeStandards) {
        Object.entries(brand.sizeStandards).forEach(([categoryKey, standards]) => {
          // Filter by relevant categories if gender/age group is selected
          if (relevantCategories && !relevantCategories.has(categoryKey)) {
            return; // Skip this category
          }
          
          const standardKey = sizeStandard as keyof typeof standards;
          if (standards[standardKey]) {
            (standards[standardKey] as string[]).forEach(s => {
              // Skip placeholder sizes like '-'
              if (s && s !== '-') {
                allSizes.add(s);
              }
            });
          }
        });
      }
    });
    
    // If no sizes found for the brand, fall back to default sizes
    if (allSizes.size === 0) {
      return SIZE_STANDARDS[sizeStandard] || SIZE_STANDARDS.EU;
    }
    
    // Sort sizes numerically if possible, otherwise alphabetically
    return Array.from(allSizes).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
  }, [filters.brands, filters.mainCategories, filters.kidsAgeGroups, brandsData, sizeStandard, getRelevantCategories]);

  // Get all products to calculate category counts (excluding current category filter)
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.brands.length > 0)
      params.set("brand", filters.brands.join(","));
    if (filters.minPrice) params.set("minPrice", filters.minPrice.toString());
    if (filters.maxPrice) params.set("maxPrice", filters.maxPrice.toString());
    if (filters.sizes.length > 0) params.set("sizes", filters.sizes.join(","));
    if (filters.search) params.set("search", filters.search);
    if (filters.styles && filters.styles.length > 0)
      params.set("styles", filters.styles.join(","));
    if (filters.ageRanges && filters.ageRanges.length > 0)
      params.set("ageRanges", filters.ageRanges.join(","));
    if (filters.occasions && filters.occasions.length > 0)
      params.set("occasions", filters.occasions.join(","));
    if (filters.genders && filters.genders.length > 0)
      params.set("genders", filters.genders.join(","));
    if (filters.colors && filters.colors.length > 0)
      params.set("colors", filters.colors.join(","));
    if (filters.supplierLocations && filters.supplierLocations.length > 0)
      params.set("supplierLocations", filters.supplierLocations.join(","));
    // Three-layer category system filters
    if (filters.mainCategories && filters.mainCategories.length > 0)
      params.set("mainCategories", filters.mainCategories.join(","));
    if (filters.kidsGenders && filters.kidsGenders.length > 0)
      params.set("kidsGenders", filters.kidsGenders.join(","));
    if (filters.kidsAgeGroups && filters.kidsAgeGroups.length > 0)
      params.set("kidsAgeGroups", filters.kidsAgeGroups.join(","));
    if (productType === "preorder") params.set("isPreOrder", "true");
    if (productType === "stock") params.set("isPreOrder", "false");
    return params.toString();
  }, [
    filters.brands,
    filters.minPrice,
    filters.maxPrice,
    filters.sizes,
    filters.search,
    filters.styles,
    filters.ageRanges,
    filters.occasions,
    filters.genders,
    filters.colors,
    filters.supplierLocations,
    filters.mainCategories,
    filters.kidsGenders,
    filters.kidsAgeGroups,
    productType,
  ]);

  // Gender and Age Group are now independent filters (no conditional visibility)

  const { data: filteredProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", queryParams],
  });

  // Calculate category counts from filtered products
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredProducts.forEach((product) => {
      counts[product.category] = (counts[product.category] || 0) + 1;
    });
    return counts;
  }, [filteredProducts]);

  // Show all active categories (even if they have no products yet)
  const availableCategories = useMemo(() => {
    return categoriesData
      .filter((category: Category) => category.isActive)
      .sort((a: Category, b: Category) => b.priority - a.priority);
  }, [categoriesData]);

  if (isHorizontal) {
    return (
      <Accordion
        type="multiple"
        defaultValue={["main-filters", "other-filters"]}
        className="w-full space-y-4"
      >
        {/* Main Filters Section */}
        <AccordionItem value="main-filters" className="border-none">
          <AccordionTrigger className="text-lg font-semibold text-gray-800 dark:text-gray-200 hover:no-underline py-2 bg-slate-100 dark:bg-slate-700 px-4 rounded-lg">
            Main Filters
          </AccordionTrigger>
          <AccordionContent className="animate-in fade-in-50 slide-in-from-top-2 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4 p-3">
              {/* Categories */}
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 py-1.5">
                  Categories
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {availableCategories.map((category: Category) => {
                    const isSelected = filters.categories.includes(
                      category.name,
                    );
                    return (
                      <div
                        key={category.id}
                        onClick={() =>
                          onToggleArrayFilter("categories", category.name)
                        }
                        className={`
                        flex items-center space-x-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-all duration-200
                        ${
                          isSelected
                            ? "bg-yellow-400/20 border border-yellow-400/40 text-yellow-700 dark:text-yellow-400"
                            : "bg-white/60 dark:bg-gray-800/60 hover:bg-white/80 dark:hover:bg-gray-700/80 border border-gray-200/50 dark:border-gray-600/50"
                        }
                      `}
                        data-testid={`category-filter-${category.slug}`}
                      >
                        {category.iconUrl && (
                          <img
                            src={category.iconUrl}
                            alt={category.name}
                            className="w-5 h-5 object-contain"
                          />
                        )}
                        <span
                          className={`text-base ${isSelected ? "font-medium" : ""}`}
                        >
                          {category.name}
                        </span>
                        <Badge
                          variant={isSelected ? "default" : "secondary"}
                          className={`text-sm h-6 px-2 ${isSelected ? "bg-blue-900 text-yellow-400" : ""}`}
                        >
                          {categoryCounts[category.name] || 0}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Main Category Filter (Layer 1) */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 py-1 flex items-center">
                  <User className="w-4 h-4 mr-1.5 text-purple-600 dark:text-purple-400" />
                  Gender
                </h3>
                <div className="flex flex-wrap gap-1">
                  {FILTER_OPTIONS.mainCategories.map((category) => (
                    <Button
                      key={category}
                      data-testid={`button-main-category-${category.toLowerCase().replace(/ /g, "-")}`}
                      onClick={() =>
                        onToggleArrayFilter("mainCategories", category)
                      }
                      variant={
                        filters.mainCategories?.includes(category)
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      className={`text-xs h-7 px-2.5 transition-all duration-200 ${
                        filters.mainCategories?.includes(category)
                          ? "bg-yellow-400 text-blue-900 hover:bg-yellow-500"
                          : "bg-white/60 dark:bg-gray-800/60 hover:bg-white/80 dark:hover:bg-gray-700/80"
                      }`}
                    >
                      {category}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Age Group Filter - Always visible */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 py-1 flex items-center">
                  <Calendar className="w-4 h-4 mr-1.5 text-red-600 dark:text-red-400" />
                  Age Group
                </h3>
                <div className="flex flex-wrap gap-1">
                  {FILTER_OPTIONS.kidsAgeGroups.map((ageGroup) => (
                    <Button
                      key={ageGroup}
                      data-testid={`button-age-group-${ageGroup.toLowerCase().replace(/ /g, "-")}`}
                      onClick={() =>
                        onToggleArrayFilter("kidsAgeGroups", ageGroup)
                      }
                      variant={
                        filters.kidsAgeGroups?.includes(ageGroup)
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      className={`text-xs h-7 px-2.5 transition-all duration-200 ${
                        filters.kidsAgeGroups?.includes(ageGroup)
                          ? "bg-red-400 text-white hover:bg-red-500"
                          : "bg-white/60 dark:bg-gray-800/60 hover:bg-white/80 dark:hover:bg-gray-700/80"
                      }`}
                    >
                      {ageGroup}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Occasion Filter */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 py-1 flex items-center">
                  <Calendar className="w-4 h-4 mr-1.5 text-green-600 dark:text-green-400" />
                  Occasion
                </h3>
                <div className="flex flex-wrap gap-1">
                  {FILTER_OPTIONS.occasions.map((occasion) => (
                    <Button
                      key={occasion}
                      data-testid={`button-occasion-filter-${occasion.toLowerCase()}`}
                      onClick={() => onToggleArrayFilter("occasions", occasion)}
                      variant={
                        filters.occasions?.includes(occasion)
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      className={`text-xs h-7 px-2.5 transition-all duration-200 ${
                        filters.occasions?.includes(occasion)
                          ? "bg-yellow-400 text-blue-900 hover:bg-yellow-500"
                          : "bg-white/60 dark:bg-gray-800/60 hover:bg-white/80 dark:hover:bg-gray-700/80"
                      }`}
                    >
                      {occasion}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Colors Filter */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 py-1 flex items-center">
                  <Palette className="w-4 h-4 mr-1.5 text-pink-600 dark:text-pink-400" />
                  Colors
                </h3>
                <div className="flex flex-wrap gap-1">
                  {FILTER_OPTIONS.colors.map((color) => (
                    <Button
                      key={color}
                      data-testid={`button-color-filter-${color.toLowerCase().replace("-", "")}`}
                      onClick={() => onToggleArrayFilter("colors", color)}
                      variant={
                        filters.colors?.includes(color) ? "default" : "outline"
                      }
                      size="sm"
                      className={`text-xs h-7 px-2.5 transition-all duration-200 ${
                        filters.colors?.includes(color)
                          ? "bg-yellow-400 text-blue-900 hover:bg-yellow-500"
                          : "bg-white/60 dark:bg-gray-800/60 hover:bg-white/80 dark:hover:bg-gray-700/80"
                      }`}
                    >
                      {color}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Other Filters Section */}
        <AccordionItem value="other-filters" className="border-none">
          <AccordionTrigger className="text-lg font-semibold text-gray-800 dark:text-gray-200 hover:no-underline py-2 bg-slate-100 dark:bg-slate-700 px-4 rounded-lg">
            Other Filters
          </AccordionTrigger>
          <AccordionContent className="animate-in fade-in-50 slide-in-from-top-2 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4 p-3">
              {/* Price Range */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 py-1 flex items-center">
                  <DollarSign className="w-4 h-4 mr-1.5 text-emerald-600 dark:text-emerald-400" />
                  Price Range
                </h3>
                <div className="flex space-x-2">
                  <Input
                    data-testid="input-min-price"
                    type="number"
                    placeholder="Min ($)"
                    value={filters.minPrice || ""}
                    onChange={(e) =>
                      onFilterChange(
                        "minPrice",
                        e.target.value ? parseFloat(e.target.value) : undefined,
                      )
                    }
                    className="flex-1 text-base"
                  />
                  <Input
                    data-testid="input-max-price"
                    type="number"
                    placeholder="Max ($)"
                    value={filters.maxPrice || ""}
                    onChange={(e) =>
                      onFilterChange(
                        "maxPrice",
                        e.target.value ? parseFloat(e.target.value) : undefined,
                      )
                    }
                    className="flex-1 text-base"
                  />
                </div>
              </div>

              {/* Quick Size Selection */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 py-1 flex items-center">
                  <Ruler className="w-4 h-4 mr-1.5 text-blue-600 dark:text-blue-400" />
                  Sizes
                </h3>
                <div className="grid grid-cols-4 gap-1">
                  {sizes.map((size) => (
                    <Button
                      key={size}
                      data-testid={`button-size-filter-${size}`}
                      variant={
                        filters.sizes.includes(size) ? "default" : "outline"
                      }
                      size="sm"
                      className={`text-xs h-7 transition-all duration-200 ${
                        filters.sizes.includes(size)
                          ? "bg-yellow-400 text-blue-900 hover:bg-yellow-500"
                          : "bg-white/60 dark:bg-gray-800/60 hover:bg-white/80 dark:hover:bg-gray-700/80"
                      }`}
                      onClick={() => onToggleArrayFilter("sizes", size)}
                    >
                      {size}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  }

  // Helper to check if a filter section has active selections
  const hasActiveFilter = (filterKey: string): boolean => {
    switch (filterKey) {
      case 'divisions':
        return (filters.divisions?.length ?? 0) > 0;
      case 'price':
        return !!(filters.minPrice || filters.maxPrice);
      case 'sizes':
        return filters.sizes.length > 0;
      case 'mainCategories':
        return (filters.mainCategories?.length ?? 0) > 0;
      case 'kidsAgeGroups':
        return (filters.kidsAgeGroups?.length ?? 0) > 0;
      case 'occasions':
        return (filters.occasions?.length ?? 0) > 0;
      case 'colors':
        return (filters.colors?.length ?? 0) > 0;
      default:
        return false;
    }
  };

  // Vertical (sidebar) layout with accordion (single open at a time)
  return (
    <Accordion type="single" collapsible className="w-full">
      {/* Gender Filter (Layer 1) - FIRST */}
      <AccordionItem 
        value="mainCategories" 
        className={`border-b transition-colors duration-200 ${hasActiveFilter('mainCategories') ? 'bg-[#FE4438]/10 border-l-2 border-l-[#FE4438]' : ''}`}
      >
        <AccordionTrigger className="flex-1 justify-between transition-all [&[data-state=open]>svg]:rotate-180 uppercase py-5 text-black dark:text-white hover:no-underline flex items-center text-[12px] text-left font-normal px-2">
          Gender
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.mainCategories.map((category) => (
              <Button
                key={category}
                data-testid={`button-main-category-${category.toLowerCase().replace(/ /g, "-")}`}
                variant={
                  filters.mainCategories?.includes(category)
                    ? "default"
                    : "outline"
                }
                size="sm"
                className={`text-xs h-8 px-3 transition-all duration-150 ${
                  filters.mainCategories?.includes(category)
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
                    : "hover:bg-accent"
                }`}
                onClick={() => onToggleArrayFilter("mainCategories", category)}
              >
                {category}
              </Button>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Age Group Filter - SECOND */}
      <AccordionItem
        value="kidsAgeGroups"
        className={`border-b transition-colors duration-200 ${hasActiveFilter('kidsAgeGroups') ? 'bg-[#FE4438]/10 border-l-2 border-l-[#FE4438]' : ''}`}
      >
        <AccordionTrigger className="flex-1 justify-between transition-all [&[data-state=open]>svg]:rotate-180 uppercase py-5 text-black dark:text-white hover:no-underline flex items-center text-[12px] text-left font-normal px-2">
          Age Group
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.kidsAgeGroups.map((ageGroup) => (
              <Button
                key={ageGroup}
                data-testid={`button-age-group-${ageGroup.toLowerCase().replace(/ /g, "-")}`}
                variant={
                  filters.kidsAgeGroups?.includes(ageGroup)
                    ? "default"
                    : "outline"
                }
                size="sm"
                className={`text-xs h-8 px-3 transition-all duration-150 ${
                  filters.kidsAgeGroups?.includes(ageGroup)
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "hover:bg-accent"
                }`}
                onClick={() => onToggleArrayFilter("kidsAgeGroups", ageGroup)}
              >
                {ageGroup}
              </Button>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Division Filter - THIRD */}
      <AccordionItem 
        value="divisions" 
        className={`border-b transition-colors duration-200 ${hasActiveFilter('divisions') ? 'bg-[#FE4438]/10 border-l-2 border-l-[#FE4438]' : ''}`}
      >
        <AccordionTrigger className="flex-1 justify-between transition-all [&[data-state=open]>svg]:rotate-180 uppercase py-3 text-black dark:text-white hover:no-underline flex items-center text-[13px] text-left font-normal px-2">
          Division
        </AccordionTrigger>
        <AccordionContent className="pb-4 px-2">
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.divisions.map((division) => (
              <Button
                key={division}
                data-testid={`button-division-${division.toLowerCase()}`}
                variant={
                  filters.divisions?.includes(division) ? "default" : "outline"
                }
                size="sm"
                className={`text-xs h-8 px-3 transition-all duration-150 ${
                  filters.divisions?.includes(division)
                    ? "bg-gradient-to-r from-[#FE4438] to-[#FE4438] text-white hover:from-[#FE4438] hover:to-[#FE4438]"
                    : "hover:bg-accent"
                }`}
                onClick={() => onToggleArrayFilter("divisions", division)}
              >
                {division}
              </Button>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Size Filter */}
      <AccordionItem 
        value="sizes" 
        className={`border-b transition-colors duration-200 ${hasActiveFilter('sizes') ? 'bg-[#FE4438]/10 border-l-2 border-l-[#FE4438]' : ''}`}
      >
        <AccordionTrigger className="flex-1 justify-between transition-all [&[data-state=open]>svg]:rotate-180 uppercase py-5 text-black dark:text-white hover:no-underline flex items-center text-[12px] text-left font-normal px-2">
          Quick Size Filter
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="grid grid-cols-4 gap-2">
            {sizes.map((size) => (
              <Button
                key={size}
                data-testid={`button-size-filter-${size}`}
                variant={filters.sizes.includes(size) ? "default" : "outline"}
                size="sm"
                className={`text-xs h-8 transition-all duration-150 ${
                  filters.sizes.includes(size)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-accent"
                }`}
                onClick={() => onToggleArrayFilter("sizes", size)}
              >
                {size}
              </Button>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Occasion Filter */}
      <AccordionItem 
        value="occasions" 
        className={`border-b transition-colors duration-200 ${hasActiveFilter('occasions') ? 'bg-[#FE4438]/10 border-l-2 border-l-[#FE4438]' : ''}`}
      >
        <AccordionTrigger className="flex-1 justify-between transition-all [&[data-state=open]>svg]:rotate-180 uppercase py-5 text-black dark:text-white hover:no-underline flex items-center text-[12px] text-left font-normal px-2">
          Occasion
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.occasions.map((occasion) => (
              <Button
                key={occasion}
                data-testid={`button-occasion-filter-${occasion.toLowerCase()}`}
                variant={
                  filters.occasions?.includes(occasion) ? "default" : "outline"
                }
                size="sm"
                className={`text-xs h-8 px-3 transition-all duration-150 ${
                  filters.occasions?.includes(occasion)
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
                    : "hover:bg-accent"
                }`}
                onClick={() => onToggleArrayFilter("occasions", occasion)}
              >
                {occasion}
              </Button>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Colors Filter */}
      <AccordionItem 
        value="colors" 
        className={`border-b transition-colors duration-200 ${hasActiveFilter('colors') ? 'bg-[#FE4438]/10 border-l-2 border-l-[#FE4438]' : ''}`}
      >
        <AccordionTrigger className="flex-1 justify-between transition-all [&[data-state=open]>svg]:rotate-180 uppercase py-5 text-black dark:text-white hover:no-underline flex items-center text-[12px] text-left font-normal px-2">
          Colors
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.colors.map((color) => (
              <Button
                key={color}
                data-testid={`button-color-filter-${color.toLowerCase().replace("-", "")}`}
                variant={
                  filters.colors?.includes(color) ? "default" : "outline"
                }
                size="sm"
                className={`text-xs h-8 px-3 transition-all duration-150 ${
                  filters.colors?.includes(color)
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
                    : "hover:bg-accent"
                }`}
                onClick={() => onToggleArrayFilter("colors", color)}
              >
                {color}
              </Button>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Price Range - LAST */}
      <AccordionItem 
        value="price" 
        className={`border-b transition-colors duration-200 ${hasActiveFilter('price') ? 'bg-[#FE4438]/10 border-l-2 border-l-[#FE4438]' : ''}`}
      >
        <AccordionTrigger className="flex-1 justify-between transition-all [&[data-state=open]>svg]:rotate-180 uppercase py-5 text-black dark:text-white hover:no-underline flex items-center text-[12px] text-left font-normal px-2">
          Wholesale Price Range
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="space-y-3">
            <div className="flex space-x-2">
              <Input
                data-testid="input-min-price"
                type="number"
                placeholder="Min"
                value={filters.minPrice || ""}
                onChange={(e) =>
                  onFilterChange(
                    "minPrice",
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
                className="flex-1 text-sm"
              />
              <Input
                data-testid="input-max-price"
                type="number"
                placeholder="Max"
                value={filters.maxPrice || ""}
                onChange={(e) =>
                  onFilterChange(
                    "maxPrice",
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
                className="flex-1 text-sm"
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>$0</span>
              <span>$500+</span>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
