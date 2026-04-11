import { useState, useEffect } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { Brand, Collection } from "@shared/schema";

interface FloatingFilterPanelProps {
  onFilterChange: (filters: FilterState) => void;
  initialFilters?: FilterState;
}

export interface FilterState {
  brands: string[];
  colors: string[];
  seasons: string[];
  collections: string[];
  priceMin?: number;
  priceMax?: number;
}

const COLORS = [
  "White", "Black", "Brown", "Tan", "Red", "Nude", "Blue", "Gray", "Navy"
];

const SEASONS = [
  "All Season", "Fall", "Winter", "Summer", "Spring"
];

export function FloatingFilterPanel({ onFilterChange, initialFilters }: FloatingFilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(initialFilters || {
    brands: [],
    colors: [],
    seasons: [],
    collections: [],
  });
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (initialFilters) {
      setFilters(initialFilters);
    }
  }, [initialFilters]);

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

  const { data: collections = [] } = useQuery<Collection[]>({
    queryKey: ["/api/collections"],
  });

  const handleToggleFilter = (category: keyof FilterState, value: string) => {
    setFilters(prev => {
      const categoryArray = prev[category] as string[];
      const newArray = categoryArray.includes(value)
        ? categoryArray.filter(v => v !== value)
        : [...categoryArray, value];
      
      const newFilters = { ...prev, [category]: newArray };
      onFilterChange(newFilters);
      return newFilters;
    });
  };

  const clearFilters = () => {
    const clearedFilters: FilterState = {
      brands: [],
      colors: [],
      seasons: [],
      collections: [],
    };
    setFilters(clearedFilters);
    onFilterChange(clearedFilters);
  };

  const activeFilterCount = 
    filters.brands.length + 
    filters.colors.length + 
    filters.seasons.length + 
    filters.collections.length;

  const filteredBrands = brands.filter(brand => 
    brand.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="relative">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant="outline"
        className="bg-[hsl(var(--sidebar-primary))] hover:bg-[hsl(var(--sidebar-primary))]/90 text-white border-none"
        data-testid="button-toggle-filters"
      >
        <Filter className="w-4 h-4 mr-2" />
        Filters
        {activeFilterCount > 0 && (
          <span className="ml-2 bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] px-2 py-0.5 rounded-full text-xs font-bold">
            {activeFilterCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 max-h-[600px] overflow-hidden flex flex-col">
            <div className="bg-[hsl(var(--sidebar-primary))] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                <h3 className="font-semibold text-lg">Filters</h3>
              </div>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="text-xs underline hover:no-underline"
                    data-testid="button-clear-filters"
                  >
                    Clear All
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="hover:bg-white/10 rounded p-1"
                  data-testid="button-close-filters"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Smart Search */}
              <div>
                <input
                  type="text"
                  placeholder="Search filters..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--sidebar-primary))]"
                  data-testid="input-filter-search"
                />
              </div>

              {/* Brands */}
              {filteredBrands.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 text-[hsl(var(--sidebar-primary))]">Brands</h4>
                  <div className="space-y-2">
                    {filteredBrands.map((brand) => (
                      <div key={brand.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`brand-${brand.id}`}
                          checked={filters.brands.includes(brand.name)}
                          onCheckedChange={() => handleToggleFilter('brands', brand.name)}
                          data-testid={`checkbox-brand-${brand.slug}`}
                        />
                        <Label
                          htmlFor={`brand-${brand.id}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {brand.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Collections */}
              {collections.filter(c => c.isActive).length > 0 && !searchTerm && (
                <div>
                  <h4 className="font-semibold mb-3 text-[hsl(var(--sidebar-primary))]">Collections</h4>
                  <div className="space-y-2">
                    {collections.filter(c => c.isActive).map((collection) => (
                      <div key={collection.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`collection-${collection.id}`}
                          checked={filters.collections.includes(collection.name)}
                          onCheckedChange={() => handleToggleFilter('collections', collection.name)}
                          data-testid={`checkbox-collection-${collection.slug}`}
                        />
                        <Label
                          htmlFor={`collection-${collection.id}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {collection.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Colors */}
              {!searchTerm && (
                <div>
                  <h4 className="font-semibold mb-3 text-[hsl(var(--sidebar-primary))]">Color</h4>
                  <div className="space-y-2">
                    {COLORS.map((color) => (
                      <div key={color} className="flex items-center space-x-2">
                        <Checkbox
                          id={`color-${color}`}
                          checked={filters.colors.includes(color)}
                          onCheckedChange={() => handleToggleFilter('colors', color)}
                          data-testid={`checkbox-color-${color.toLowerCase()}`}
                        />
                        <Label
                          htmlFor={`color-${color}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {color}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Seasons */}
              {!searchTerm && (
                <div>
                  <h4 className="font-semibold mb-3 text-[hsl(var(--sidebar-primary))]">Season</h4>
                  <div className="space-y-2">
                    {SEASONS.map((season) => (
                      <div key={season} className="flex items-center space-x-2">
                        <Checkbox
                          id={`season-${season}`}
                          checked={filters.seasons.includes(season)}
                          onCheckedChange={() => handleToggleFilter('seasons', season)}
                          data-testid={`checkbox-season-${season.toLowerCase().replace(' ', '-')}`}
                        />
                        <Label
                          htmlFor={`season-${season}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {season}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
