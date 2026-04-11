import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Package, Image, ArrowLeft, ShoppingBag, Trash2, Boxes } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Product } from "@shared/schema";

interface PreOrderCollection {
  id: string;
  name: string;
  brandName: string;
  imageUrl?: string;
  productCount?: number;
  isActive: boolean;
  collectionType?: string;
  createdAt: string;
}

export default function StockPreOrderPage() {
  const [collectionTypeTab, setCollectionTypeTab] = useState<'preorder' | 'stock'>('preorder');
  const [selectedCollection, setSelectedCollection] = useState<PreOrderCollection | null>(null);

  const { data: collections = [], isLoading } = useQuery<PreOrderCollection[]>({
    queryKey: ['/api/preorder/collections', collectionTypeTab],
    queryFn: async () => {
      const response = await fetch(`/api/preorder/collections?type=${collectionTypeTab}`);
      if (!response.ok) throw new Error('Failed to fetch collections');
      return response.json();
    },
  });

  const { data: collectionProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: [`/api/preorder/collections/${encodeURIComponent(selectedCollection?.name || '')}/products`],
    enabled: !!selectedCollection,
  });

  // Consolidate products by name + colourway, merging their sizes
  const consolidatedProducts = useMemo(() => {
    if (!collectionProducts.length) return [];
    
    const groups = new Map<string, Product & { availableSizes: { size: string; stock: number }[] }>();
    
    for (const p of collectionProducts) {
      const key = `${p.name}::${p.colourway || 'Default'}`;
      
      if (!groups.has(key)) {
        groups.set(key, {
          ...p,
          availableSizes: [...(p.availableSizes || [])]
        });
      } else {
        const existing = groups.get(key)!;
        const existingSizeSet = new Set(existing.availableSizes.map(s => s.size));
        
        for (const sizeObj of (p.availableSizes || [])) {
          if (!existingSizeSet.has(sizeObj.size)) {
            existing.availableSizes.push(sizeObj);
            existingSizeSet.add(sizeObj.size);
          } else {
            const existingSize = existing.availableSizes.find(s => s.size === sizeObj.size);
            if (existingSize) {
              existingSize.stock = (existingSize.stock || 0) + (sizeObj.stock || 0);
            }
          }
        }
      }
    }
    
    return Array.from(groups.values()).map(product => ({
      ...product,
      availableSizes: product.availableSizes.sort((a, b) => {
        const numA = parseFloat(a.size);
        const numB = parseFloat(b.size);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.size.localeCompare(b.size);
      })
    }));
  }, [collectionProducts]);

  const toggleStatusMutation = useMutation({
    mutationFn: async (collectionName: string) => {
      const response = await apiRequest(
        `/api/preorder/collections/${encodeURIComponent(collectionName)}/toggle`,
        'POST'
      );
      return response.json();
    },
    onMutate: async (collectionName: string) => {
      await queryClient.cancelQueries({ queryKey: ['/api/preorder/collections', collectionTypeTab] });
      const previousCollections = queryClient.getQueryData<PreOrderCollection[]>(['/api/preorder/collections', collectionTypeTab]);
      
      queryClient.setQueryData<PreOrderCollection[]>(['/api/preorder/collections', collectionTypeTab], (old) => {
        if (!old) return old;
        return old.map(c => 
          c.name === collectionName ? { ...c, isActive: !c.isActive } : c
        );
      });
      
      return { previousCollections };
    },
    onError: (err, collectionName, context) => {
      if (context?.previousCollections) {
        queryClient.setQueryData(['/api/preorder/collections', collectionTypeTab], context.previousCollections);
      }
    },
    onSettled: () => {
      // Invalidate all product queries to ensure shop page shows updated data
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products/count'] });
    }
  });

  const deleteCollectionMutation = useMutation({
    mutationFn: async (collectionName: string) => {
      const response = await apiRequest(
        `/api/preorder/collections/${encodeURIComponent(collectionName)}`,
        'DELETE'
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/preorder/collections', collectionTypeTab] });
      // Invalidate all product queries to ensure shop page and All Products page show updated data
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['allProducts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products/count'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products/all/count'] });
    }
  });

  const handleCollectionClick = (collection: PreOrderCollection) => {
    setSelectedCollection(collection);
  };

  const handleBackToCollections = () => {
    setSelectedCollection(null);
  };

  const handleCollectionTypeChange = (value: string) => {
    setCollectionTypeTab(value as 'preorder' | 'stock');
    setSelectedCollection(null);
  };

  return (
    <>
      <div className="p-4 md:p-5">
          <div className="mb-3">
            <h1 className="text-xl font-bold leading-tight">Collections</h1>
            <p className="text-muted-foreground text-sm mt-0.5 leading-snug">
              Manage pre-order and stock collections
            </p>
          </div>

          <Tabs value={collectionTypeTab} onValueChange={handleCollectionTypeChange} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2 h-9 p-0.5">
              <TabsTrigger value="preorder" data-testid="tab-preorder-collections" className="text-xs py-1.5 px-2 gap-1.5">
                <Package className="w-3.5 h-3.5 shrink-0" />
                Pre-Order Collections
              </TabsTrigger>
              <TabsTrigger value="stock" data-testid="tab-stock-collections" className="text-xs py-1.5 px-2 gap-1.5">
                <Boxes className="w-3.5 h-3.5 shrink-0" />
                Stock Collections
              </TabsTrigger>
            </TabsList>

            <TabsContent value="preorder" className="mt-2">
              {renderCollectionsList()}
            </TabsContent>

            <TabsContent value="stock" className="mt-2">
              {renderCollectionsList()}
            </TabsContent>
          </Tabs>
        </div>
    </>
  );

  function renderCollectionsList() {
    if (selectedCollection) {
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              className="h-8 text-xs"
              onClick={handleBackToCollections}
              data-testid="button-back-to-collections"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Back to Collections
            </Button>
            <div className="min-w-0">
              <h2 className="text-base font-bold leading-tight truncate">{selectedCollection.name}</h2>
              <p className="text-muted-foreground text-xs mt-0.5">
                {selectedCollection.brandName} • {selectedCollection.productCount || 0} products
              </p>
            </div>
          </div>

          {productsLoading ? (
            <Card>
              <CardContent className="py-8 px-4 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto mb-2"></div>
                <p className="text-muted-foreground text-sm">Loading products...</p>
              </CardContent>
            </Card>
          ) : consolidatedProducts.length === 0 ? (
            <Card>
              <CardContent className="py-8 px-4 text-center">
                <ShoppingBag className="w-12 h-12 mx-auto mb-2 text-muted-foreground opacity-50" />
                <h3 className="text-sm font-semibold mb-1">No Products Yet</h3>
                <p className="text-muted-foreground text-xs">
                  This collection doesn't have any products yet
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs leading-tight">
                  <thead className="bg-[#fbf8f7] border-b">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Image</th>
                      <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                      <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">SKU</th>
                      <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Colourway</th>
                      <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Category</th>
                      <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Gender</th>
                      <th className="px-2 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Wholesale</th>
                      <th className="px-2 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Retail</th>
                      <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sizes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidatedProducts.map((product) => (
                      <tr 
                        key={product.id} 
                        className="border-b hover:bg-[#fbf8f7] transition-colors"
                        data-testid={`product-row-${product.id}`}
                      >
                        <td className="px-2 py-1">
                          <div className="w-9 h-9 bg-muted rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                            {product.image1 ? (
                              <img
                                src={product.image1}
                                alt={product.name}
                                className="max-w-full max-h-full object-contain"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Image className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1">
                          <span className="font-medium">{product.name}</span>
                        </td>
                        <td className="px-2 py-1">
                          <span className="text-muted-foreground font-mono tabular-nums">{product.sku}</span>
                        </td>
                        <td className="px-2 py-1">
                          <span>{product.colourway || '-'}</span>
                        </td>
                        <td className="px-2 py-1">
                          <span>{product.category || '-'}</span>
                        </td>
                        <td className="px-2 py-1">
                          <span>{product.gender || '-'}</span>
                        </td>
                        <td className="px-2 py-1 text-right">
                          <span className="font-medium tabular-nums">
                            ${Number(product.wholesalePrice || 0).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          <span>
                            ${Number(product.retailPrice || 0).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-2 py-1">
                          <span>
                            {(() => {
                              // For carton products, show sizes from unitsPerSize (from carton config)
                              if (product.unitsPerSize && Object.keys(product.unitsPerSize).length > 0) {
                                return Object.keys(product.unitsPerSize).sort((a, b) => {
                                  const numA = parseFloat(a);
                                  const numB = parseFloat(b);
                                  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                                  return a.localeCompare(b);
                                }).join(', ');
                              }
                              // Fallback to availableSizes for regular products
                              return product.availableSizes?.map(s => s.size).join(', ') || '-';
                            })()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      );
    }

    if (isLoading) {
      return (
        <Card>
          <CardContent className="py-8 px-4 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto mb-2"></div>
            <p className="text-muted-foreground text-sm">Loading collections...</p>
          </CardContent>
        </Card>
      );
    }

    if (collections.length === 0) {
      return (
        <Card>
          <CardContent className="py-8 px-4 text-center">
            <Package className="w-12 h-12 mx-auto mb-2 text-muted-foreground opacity-50" />
            <h3 className="text-sm font-semibold mb-1">No {collectionTypeTab === 'preorder' ? 'Pre-Order' : 'Stock'} Collections Yet</h3>
            <p className="text-muted-foreground text-xs leading-snug">
              Create your first {collectionTypeTab === 'preorder' ? 'pre-order' : 'stock'} collection to get started
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        {collections.map((collection) => (
          <Card 
            key={collection.id} 
            className="hover:shadow-md transition-shadow cursor-pointer hover:bg-[#fbf8f7] py-0"
            onClick={() => handleCollectionClick(collection)}
            data-testid={`collection-card-${collection.id}`}
          >
            <div className="flex items-center gap-3 p-3">
              {collection.imageUrl ? (
                <div className="w-12 h-12 bg-muted rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center">
                  <img
                    src={collection.imageUrl}
                    alt={collection.name}
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center flex-shrink-0">
                  <Image className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate leading-tight">{collection.name}</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span className="truncate">{collection.brandName}</span>
                  <span>•</span>
                  <span className="shrink-0">{collection.productCount || 0} products</span>
                </div>
              </div>
              <div 
                className="flex items-center gap-2 sm:gap-3 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs whitespace-nowrap ${collection.isActive ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {collection.isActive ? "Active" : "Inactive"}
                  </span>
                  <Switch
                    checked={collection.isActive}
                    onCheckedChange={() => toggleStatusMutation.mutate(collection.name)}
                    disabled={toggleStatusMutation.isPending}
                    data-testid={`switch-collection-${collection.id}`}
                    className="scale-90 origin-right"
                  />
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                      data-testid={`delete-collection-${collection.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="gap-3 p-4">
                    <AlertDialogHeader className="space-y-1">
                      <AlertDialogTitle className="text-base">Remove Collection?</AlertDialogTitle>
                      <AlertDialogDescription className="text-xs leading-snug">
                        This will remove the "{collection.name}" collection. The {collection.productCount || 0} products will be preserved and remain visible in All Products.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2 sm:gap-2">
                      <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700 h-8 text-xs"
                        onClick={() => deleteCollectionMutation.mutate(collection.name)}
                        disabled={deleteCollectionMutation.isPending}
                      >
                        {deleteCollectionMutation.isPending ? "Removing..." : "Remove Collection"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }
}
