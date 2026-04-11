import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Layers, Percent, Calendar } from "lucide-react";
import type { FilterState } from "@/lib/types";
import type { Collection } from "@shared/schema";
import { format } from "date-fns";

interface CollectionsFilterProps {
  filters: FilterState;
  onToggleArrayFilter: (key: 'collections', value: string) => void;
}

export function CollectionsFilter({ filters, onToggleArrayFilter }: CollectionsFilterProps) {
  // Get collections from API
  const { data: collectionsData = [] } = useQuery<Collection[]>({
    queryKey: ["/api/collections"],
  });

  // Show only active collections
  const availableCollections = useMemo(() => {
    return collectionsData
      .filter((collection: Collection) => collection.isActive)
      .sort((a: Collection, b: Collection) => b.priority - a.priority);
  }, [collectionsData]);

  const selectedCollections = filters.collections;

  return (
    <div>
      <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
        <Layers className="w-4 h-4" />
        Collections
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {availableCollections.map((collection: Collection) => {
          const isSelected = selectedCollections.includes(collection.name);
          const hasDiscount = parseFloat(collection.discount) > 0;
          const hasDateRange = collection.validFrom || collection.validTo;
          
          return (
            <div
              key={collection.id}
              onClick={() => onToggleArrayFilter('collections', collection.name)}
              className={`
                relative cursor-pointer p-4 rounded-lg border transition-all duration-200 hover:scale-105
                ${isSelected 
                  ? 'border-primary bg-primary/5 shadow-md' 
                  : 'border-border bg-card hover:border-primary/50'
                }
              `}
              data-testid={`collection-filter-${collection.slug}`}
            >
              <div className="flex flex-col items-center space-y-3">
                <div className="w-20 h-14 flex items-center justify-center bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded border border-blue-200 dark:border-blue-800">
                  <Layers className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center w-full">
                  <p className="text-xs font-medium truncate w-full">{collection.name}</p>
                  
                  <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
                    <Badge variant="secondary" className="text-xs">
                      {collection.productIds?.length || 0} items
                    </Badge>
                    
                    {hasDiscount && (
                      <Badge variant="destructive" className="text-xs flex items-center gap-1">
                        <Percent className="w-3 h-3" />
                        {collection.discount}%
                      </Badge>
                    )}
                  </div>
                  
                  {hasDateRange && (
                    <div className="mt-1 flex items-center justify-center text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3 mr-1" />
                      {collection.validFrom && format(new Date(collection.validFrom), 'MM/dd')}
                      {collection.validFrom && collection.validTo && ' - '}
                      {collection.validTo && format(new Date(collection.validTo), 'MM/dd')}
                    </div>
                  )}
                </div>
              </div>
              
              {isSelected && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
              )}
            </div>
          );
        })}
        
        {availableCollections.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-8">
            <Layers className="w-12 h-12 mx-auto mb-2 opacity-20" />
            No collections available
          </div>
        )}
      </div>
    </div>
  );
}
