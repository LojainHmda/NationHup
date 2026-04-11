import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, X, ArrowRight, Grid3X3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Product } from "@shared/schema";
import type { FilterState } from "@/lib/types";

interface FlowPath {
  id: string;
  category: string;
  brand: string;
  style: string;
  sizeQuantities: { [size: string]: number };
  color: string;
  product?: Product;
}

interface BulkOrderDecisionTreeProps {
  filters: FilterState;
  onAddToGrid: (product: Product, color: string, size: string, quantity: number) => void;
}

export function BulkOrderDecisionTree({ filters, onAddToGrid }: BulkOrderDecisionTreeProps) {
  const [paths, setPaths] = useState<FlowPath[]>([]);
  const [sizeGridOpen, setSizeGridOpen] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number, y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  // Get all products
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Add new path
  const addPath = () => {
    const newPath: FlowPath = {
      id: `path-${Date.now()}`,
      category: '',
      brand: '',
      style: '',
      sizeQuantities: {},
      color: ''
    };
    setPaths(prev => [...prev, newPath]);
  };

  // Remove path
  const removePath = (pathId: string) => {
    setPaths(prev => prev.filter(p => p.id !== pathId));
  };

  // Update path
  const updatePath = (pathId: string, field: keyof FlowPath, value: any) => {
    setPaths(prev => prev.map(path => {
      if (path.id !== pathId) return path;
      
      const updatedPath = { ...path };
      
      // Handle function values (for complex updates like sizes)
      if (typeof value === 'function') {
        updatedPath[field] = value(path[field]);
      } else {
        updatedPath[field] = value;
      }
      
      // Reset dependent fields when parent changes
      if (field === 'category') {
        updatedPath.brand = '';
        updatedPath.style = '';
        updatedPath.sizeQuantities = {};
        updatedPath.product = undefined;
        updatedPath.color = '';
      } else if (field === 'brand') {
        updatedPath.style = '';
        updatedPath.sizeQuantities = {};
        updatedPath.product = undefined;
        updatedPath.color = '';
      } else if (field === 'style') {
        updatedPath.sizeQuantities = {};
        const product = allProducts.find(p => p.sku === value);
        updatedPath.product = product;
        updatedPath.color = product?.colourway || '';
      }
      
      return updatedPath;
    }));
  };

  // Memoized categories
  const categories = useMemo(() => {
    if (!allProducts?.length) return [];
    return Array.from(new Set(allProducts.map(p => p.category))).sort();
  }, [allProducts?.length]);

  // Memoized brand getter
  const getBrands = useCallback((category: string) => {
    if (!category || !allProducts?.length) return [];
    return Array.from(new Set(allProducts.filter(p => p.category === category).map(p => p.brand))).sort();
  }, [allProducts?.length]);

  // Memoized styles getter
  const getStyles = useCallback((category: string, brand: string) => {
    if (!category || !brand || !allProducts?.length) return [];
    return allProducts.filter(p => p.category === category && p.brand === brand);
  }, [allProducts?.length]);

  // Memoized colors getter (now returns single colourway as array for compatibility)
  const getColors = useCallback((product?: Product) => {
    if (!product) return [];
    return product.colourway ? [product.colourway] : [];
  }, []);

  // Memoized sizes getter
  const getSizes = useCallback((product?: Product) => {
    if (!product) return [];
    return product.availableSizes.map(s => s.size).sort((a, b) => parseFloat(a) - parseFloat(b));
  }, []);

  // Add to grid
  const handleAddToGrid = (path: FlowPath) => {
    if (path.product && Object.keys(path.sizeQuantities).length > 0 && path.color) {
      Object.entries(path.sizeQuantities).forEach(([size, quantity]) => {
        if (quantity > 0) {
          onAddToGrid(path.product!, path.color, size, quantity);
        }
      });
      const totalItems = Object.values(path.sizeQuantities).reduce((sum, qty) => sum + qty, 0);
      toast({
        title: "Added to Grid",
        description: `${path.product.name} - ${totalItems} items across ${Object.keys(path.sizeQuantities).length} sizes`,
      });
    }
  };

  // Update size quantity
  const updateSizeQuantity = (pathId: string, size: string, quantity: number) => {
    updatePath(pathId, 'sizeQuantities', (prevSizeQtys: { [size: string]: number }) => {
      const newSizeQtys = { ...prevSizeQtys };
      if (quantity > 0) {
        newSizeQtys[size] = quantity;
      } else {
        delete newSizeQtys[size];
      }
      return newSizeQtys;
    });
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Order Designer</span>
          <div className="flex items-center space-x-2">
            <Button size="sm" onClick={addPath}>
              <Plus className="h-4 w-4 mr-1" />
              Add Path
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPaths([])}>
              Clear All
            </Button>
          </div>
        </CardTitle>
        
      </CardHeader>
      <CardContent>
        {paths.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="mb-2">No paths created yet</div>
            <Button onClick={addPath}>
              <Plus className="h-4 w-4 mr-1" />
              Create First Path
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {paths.map((path, index) => (
              <div key={path.id} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">Path {index + 1}</h4>
                  <Button variant="ghost" size="sm" onClick={() => removePath(path.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                {/* All Decision Steps on Same Row Level */}
                <div className="flex flex-wrap items-center gap-3">
                  
                  {/* Category */}
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-medium text-blue-600">Category:</span>
                    {!path.category ? (
                      <Select 
                        value={path.category} 
                        onValueChange={(value) => updatePath(path.id, 'category', value)}
                      >
                        <SelectTrigger className="h-7 text-xs min-w-32">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map(category => (
                            <SelectItem key={category} value={category}>{category}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center space-x-1">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                          {path.category}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updatePath(path.id, 'category', '')}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Brand */}
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-medium text-green-600">Brand:</span>
                    {!path.brand ? (
                      <Select 
                        value={path.brand} 
                        onValueChange={(value) => updatePath(path.id, 'brand', value)}
                        disabled={!path.category}
                      >
                        <SelectTrigger className="h-7 text-xs min-w-28">
                          <SelectValue placeholder={path.category ? "Select..." : "Select category first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {getBrands(path.category).map(brand => (
                            <SelectItem key={brand} value={brand}>
                              <div className="flex items-center space-x-2">
                                <div className="w-4 h-4 bg-gray-200 rounded text-xs flex items-center justify-center">
                                  {brand.charAt(0)}
                                </div>
                                <span>{brand}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center space-x-1">
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium flex items-center space-x-1">
                          <div className="w-3 h-3 bg-green-600 rounded text-xs flex items-center justify-center text-white font-bold">
                            {path.brand.charAt(0)}
                          </div>
                          <span>{path.brand}</span>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updatePath(path.id, 'brand', '')}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Style */}
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-medium text-purple-600">Style:</span>
                    {!path.style ? (
                      <Select 
                        value={path.style} 
                        onValueChange={(value) => updatePath(path.id, 'style', value)}
                        disabled={!path.brand}
                      >
                        <SelectTrigger className="h-7 text-xs min-w-32">
                          <SelectValue placeholder={path.brand ? "Select..." : "Select brand first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {getStyles(path.category, path.brand).map(style => (
                            <SelectItem key={style.sku} value={style.sku}>
                              {style.name} ({style.sku})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center space-x-1">
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium">
                          {path.product?.name} ({path.style})
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updatePath(path.id, 'style', '')}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Color */}
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-medium text-pink-600">Color:</span>
                    {!path.color ? (
                      <Select 
                        value={path.color} 
                        onValueChange={(value) => updatePath(path.id, 'color', value)}
                        disabled={!path.product}
                      >
                        <SelectTrigger className="h-7 text-xs min-w-28">
                          <SelectValue placeholder={path.product ? "Select..." : "Select style first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {getColors(path.product).map(color => (
                            <SelectItem key={color} value={color}>
                              <div className="flex items-center space-x-2">
                                <div 
                                  className="w-4 h-4 rounded border border-gray-300"
                                  style={{
                                    backgroundColor: color.toLowerCase() === 'black' ? '#000000' :
                                                  color.toLowerCase() === 'white' ? '#ffffff' :
                                                  color.toLowerCase() === 'red' ? '#ef4444' :
                                                  color.toLowerCase() === 'blue' ? '#3b82f6' :
                                                  color.toLowerCase() === 'green' ? '#10b981' :
                                                  color.toLowerCase() === 'brown' ? '#a3a3a3' :
                                                  color.toLowerCase() === 'gray' || color.toLowerCase() === 'grey' ? '#6b7280' :
                                                  '#94a3b8'
                                  }}
                                />
                                <span>{color}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center space-x-1">
                        <span className="px-2 py-1 bg-pink-100 text-pink-800 rounded text-xs font-medium flex items-center space-x-1">
                          <div 
                            className="w-3 h-3 rounded border border-gray-300"
                            style={{
                              backgroundColor: path.color.toLowerCase() === 'black' ? '#000000' :
                                            path.color.toLowerCase() === 'white' ? '#ffffff' :
                                            path.color.toLowerCase() === 'red' ? '#ef4444' :
                                            path.color.toLowerCase() === 'blue' ? '#3b82f6' :
                                            path.color.toLowerCase() === 'green' ? '#10b981' :
                                            path.color.toLowerCase() === 'brown' ? '#a3a3a3' :
                                            path.color.toLowerCase() === 'gray' || path.color.toLowerCase() === 'grey' ? '#6b7280' :
                                            '#94a3b8'
                            }}
                          />
                          <span>{path.color}</span>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updatePath(path.id, 'color', '')}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Size Grid Button */}
                  {path.color && (
                    <Dialog open={sizeGridOpen === path.id} onOpenChange={(open) => setSizeGridOpen(open ? path.id : null)}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          <Grid3X3 className="h-3 w-3 mr-1" />
                          Size Grid ({Object.keys(path.sizeQuantities).length})
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Size Selection - {path.product?.name}</DialogTitle>
                        </DialogHeader>
                        <div className="p-4">
                          <div className="text-sm text-gray-600 mb-3">
                            Drag to select multiple sizes, or click individual sizes. Use Shift+Click for range selection.
                          </div>
                          <div 
                            className="grid grid-cols-4 gap-2 relative"
                            onMouseDown={(e) => {
                              setIsDragging(true);
                              setDragStart({ x: e.clientX, y: e.clientY });
                              setDragEnd({ x: e.clientX, y: e.clientY });
                            }}
                            onMouseMove={(e) => {
                              if (isDragging) {
                                setDragEnd({ x: e.clientX, y: e.clientY });
                              }
                            }}
                            onMouseUp={() => {
                              setIsDragging(false);
                              setDragStart(null);
                              setDragEnd(null);
                            }}
                          >
                            {getSizes(path.product).map((size, index) => {
                              const currentQty = path.product?.availableSizes.find(s => s.size === size)?.stock || 0;
                              const sizeQty = path.sizeQuantities[size] || 0;
                              
                              return (
                                <div 
                                  key={size} 
                                  className={`text-center p-2 border rounded cursor-pointer transition-colors ${
                                    sizeQty > 0 ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                                  }`}
                                  onClick={(e) => {
                                    // Toggle selection with default quantity of 1
                                    const newQty = sizeQty > 0 ? 0 : 1;
                                    updateSizeQuantity(path.id, size, newQty);
                                  }}
                                >
                                  <div className="text-xs font-medium text-gray-600 mb-1">Size {size}</div>
                                  <Input
                                    type="number"
                                    min="0"
                                    max={currentQty}
                                    value={sizeQty}
                                    onChange={(e) => {
                                      const qty = parseInt(e.target.value) || 0;
                                      updateSizeQuantity(path.id, size, qty);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-8 w-full text-xs text-center p-1"
                                    placeholder="0"
                                  />
                                  <div className="text-xs text-gray-400">/{currentQty}</div>
                                </div>
                              );
                            })}
                            
                            {/* Drag Selection Visual Feedback */}
                            {isDragging && dragStart && dragEnd && (
                              <div 
                                className="absolute border-2 border-blue-500 bg-blue-100 bg-opacity-30 pointer-events-none"
                                style={{
                                  left: Math.min(dragStart.x, dragEnd.x) - 100,
                                  top: Math.min(dragStart.y, dragEnd.y) - 100,
                                  width: Math.abs(dragEnd.x - dragStart.x),
                                  height: Math.abs(dragEnd.y - dragStart.y),
                                }}
                              />
                            )}
                          </div>
                          <div className="flex justify-between items-center mt-4 pt-4 border-t">
                            <span className="text-sm text-gray-600">
                              Total: {Object.values(path.sizeQuantities).reduce((sum, qty) => sum + qty, 0)} items
                            </span>
                            <Button 
                              onClick={() => setSizeGridOpen(null)}
                              size="sm"
                            >
                              Done
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}

                  {/* Add Button */}
                  {Object.keys(path.sizeQuantities).length > 0 && (
                    <Button
                      onClick={() => handleAddToGrid(path)}
                      className="h-7 text-xs px-3"
                    >
                      Add ({Object.values(path.sizeQuantities).reduce((total, qty) => total + qty, 0)})
                    </Button>
                  )}

                  {/* Duplicate Button */}
                  {Object.keys(path.sizeQuantities).length > 0 && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        const duplicatedPath: FlowPath = {
                          ...path,
                          id: `path-${Date.now()}`,
                          sizeQuantities: {},
                          color: ''
                        };
                        setPaths(prev => [...prev, duplicatedPath]);
                      }}
                      className="h-7 text-xs px-2"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Instructions */}
        <div className="mt-4 text-xs text-gray-500 space-y-1 border-t pt-4">
          <div>• **Horizontal Flow**: Category → Brand → Style → Size → Color → Quantity → Add</div>
          <div>• **Parallel Paths**: Click "Add Path" to create multiple selection flows</div>
          <div>• **Duplicate**: Copy a path to quickly create variations with different sizes</div>
          <div>• **Dependencies**: Each step unlocks the next one in the flow</div>
        </div>
      </CardContent>
    </Card>
  );
}