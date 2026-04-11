import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Plus, Trash2, MousePointer2, X, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useGridDragFill } from "@/hooks/useGridDragFill";
import { gridClipboard } from "@/lib/gridClipboard";
import { BulkOrderDecisionTree } from "@/components/BulkOrderDecisionTree";
import { VisualPathCanvas } from "@/components/VisualPathCanvas";
import { BrandIconToolbar } from "@/components/BrandIconToolbar";
import type { Product } from "@shared/schema";
import type { FilterState } from "@/lib/types";

interface GridOrderInterfaceProps {
  filters: FilterState;
  onToggleArrayFilter: (key: "categories" | "brands" | "sizes" | "colors" | "models", value: string) => void;
}

interface GridProduct {
  id: string;
  styleCode: string;
  name: string;
  brand: string;
  color: string;
  unitPrice: number;
  category: string;
  imageUrl: string;
  availableSizes: string[];
  quantities: Record<string, number>; // size -> quantity
}

interface GridRow {
  id: string;
  product: GridProduct;
  quantities: Record<string, number>;
  totalArticles: number;
  totalPrice: number;
}

const SIZES = ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'];

export function GridOrderInterface({ filters, onToggleArrayFilter }: GridOrderInterfaceProps) {
  const [gridRows, setGridRows] = useState<GridRow[]>([]);
  const [bulkQuantity, setBulkQuantity] = useState<string>('1');
  const [showBulkInput, setShowBulkInput] = useState(false);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  const { toast } = useToast();

  // Use the drag-fill hook
  const dragFill = useGridDragFill({
    cellValidator: (row, col) => {
      const targetRow = gridRows[row];
      const targetSize = SIZES[col];
      return targetRow?.product.availableSizes.includes(targetSize) ?? false;
    },
    onFillEnd: (region) => {
      if (region.minRow === region.maxRow && region.minCol === region.maxCol) {
        return;
      }
      setShowBulkInput(true);
    },
    getCellKey: (row, col) => `${gridRows[row]?.id}-${SIZES[col]}`,
  });

  // Build query parameters from filters
  const queryParams = new URLSearchParams();
  if (filters.categories.length > 0) queryParams.set('category', filters.categories.join(','));
  if (filters.brands.length > 0) queryParams.set('brand', filters.brands.join(','));
  if (filters.minPrice) queryParams.set('minPrice', filters.minPrice.toString());
  if (filters.maxPrice) queryParams.set('maxPrice', filters.maxPrice.toString());
  if (filters.sizes.length > 0) queryParams.set('sizes', filters.sizes.join(','));
  if (filters.search) queryParams.set('search', filters.search);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", queryParams.toString()],
  });

  // Convert products to grid products (one per style+color combination)
  const gridProducts = useMemo(() => {
    const productMap = new Map<string, GridProduct>();
    
    products.forEach(product => {
      const color = product.colourway || 'Default';
      const key = `${product.sku}-${color}`;
      const styleCode = `${product.sku}${color.slice(0,1).toUpperCase()}`;
      const availableSizes = product.availableSizes
        .map(s => s.size)
        .filter(size => SIZES.includes(size));
        
      productMap.set(key, {
        id: key,
        styleCode,
        name: product.name,
        brand: product.brand,
        color,
        unitPrice: parseFloat(product.wholesalePrice),
        category: product.category,
        imageUrl: product.image1,
        availableSizes,
        quantities: {}
      });
    });
    
    return Array.from(productMap.values());
  }, [products]);

  // Initialize grid rows from products
  const initializeRows = useCallback(() => {
    const newRows = gridProducts.map(product => ({
      id: product.id,
      product,
      quantities: {},
      totalArticles: 0,
      totalPrice: 0
    }));
    setGridRows(newRows);
  }, [gridProducts]);

  // Initialize rows when products change
  useMemo(() => {
    initializeRows();
  }, [initializeRows]);

  // Update quantity for a specific row and size
  const updateQuantity = useCallback((rowId: string, size: string, quantity: number) => {
    setGridRows(prev => prev.map(row => {
      if (row.id === rowId) {
        const newQuantities = { ...row.quantities, [size]: Math.max(0, quantity) };
        const totalArticles = Object.values(newQuantities).reduce((sum, qty) => sum + qty, 0);
        const totalPrice = totalArticles * row.product.unitPrice;
        
        return {
          ...row,
          quantities: newQuantities,
          totalArticles,
          totalPrice
        };
      }
      return row;
    }));
  }, []);

  // Handlers for cell interaction
  const handleCellMouseDown = useCallback((rowIndex: number, sizeIndex: number, event: React.MouseEvent) => {
    dragFill.handleMouseDown(rowIndex, sizeIndex, event);
  }, [dragFill]);

  const handleCellMouseEnter = useCallback((rowIndex: number, sizeIndex: number) => {
    dragFill.handleMouseEnter(rowIndex, sizeIndex);
  }, [dragFill]);

  const handleMouseUp = useCallback(() => {
    dragFill.handleMouseUp();
  }, [dragFill]);

  // Bulk fill selected cells
  const applyBulkQuantity = useCallback(() => {
    const quantity = parseInt(bulkQuantity) || 0;
    
    dragFill.selectedCells.forEach(cellKey => {
      const parts = cellKey.split('-');
      const size = parts[parts.length - 1];
      const rowId = parts.slice(0, -1).join('-');
      updateQuantity(rowId, size, quantity);
    });
    
    dragFill.clearSelection();
    setShowBulkInput(false);
    setBulkQuantity('1');
    
    toast({
      title: "Bulk Fill Applied",
      description: `Set ${dragFill.selectedCells.size} cells to ${quantity}`,
    });
  }, [bulkQuantity, dragFill, updateQuantity, toast]);

  const clearSelection = useCallback(() => {
    dragFill.clearSelection();
    setShowBulkInput(false);
    setBulkQuantity('1');
  }, [dragFill]);

  // Copy row functionality
  const copyRow = useCallback((rowId: string) => {
    const row = gridRows.find(r => r.id === rowId);
    if (!row) return;

    const totalQty = Object.values(row.quantities).reduce((sum, qty) => sum + qty, 0);
    if (totalQty === 0) {
      toast({
        title: "Empty Row",
        description: "This row has no quantities to copy",
        variant: "destructive",
      });
      return;
    }

    gridClipboard.copy(rowId, row.quantities);
    setCopiedRowId(rowId);
    
    toast({
      title: "Row Copied",
      description: `Copied ${totalQty} items from ${row.product.styleCode}`,
    });
  }, [gridRows, toast]);

  // Paste row functionality
  const pasteRow = useCallback((targetRowId: string) => {
    const clipboardData = gridClipboard.paste();
    if (!clipboardData) {
      toast({
        title: "Nothing to Paste",
        description: "Please copy a row first",
        variant: "destructive",
      });
      return;
    }

    const targetRow = gridRows.find(r => r.id === targetRowId);
    if (!targetRow) return;

    Object.entries(clipboardData.data).forEach(([size, quantity]) => {
      if (targetRow.product.availableSizes.includes(size)) {
        updateQuantity(targetRowId, size, quantity);
      }
    });

    const totalQty = Object.values(clipboardData.data).reduce((sum, qty) => sum + qty, 0);
    toast({
      title: "Row Pasted",
      description: `Pasted ${totalQty} items to ${targetRow.product.styleCode}`,
    });
  }, [gridRows, updateQuantity, toast]);

  // Clone a row with different color
  const cloneRow = useCallback((originalRowId: string) => {
    const originalRow = gridRows.find(r => r.id === originalRowId);
    if (!originalRow) return;

    // Find other colors for the same product
    const baseStyleCode = originalRow.product.styleCode.slice(0, -1); // Remove last character (color)
    const availableColors = gridProducts
      .filter(p => p.styleCode.startsWith(baseStyleCode) && p.id !== originalRowId)
      .map(p => ({ color: p.color, product: p }));

    if (availableColors.length === 0) {
      toast({
        title: "No Other Colors",
        description: "No other color variants available for this style",
        variant: "destructive"
      });
      return;
    }

    // For now, clone to the first available color
    const targetProduct = availableColors[0].product;
    const newRow: GridRow = {
      id: targetProduct.id,
      product: targetProduct,
      quantities: { ...originalRow.quantities },
      totalArticles: originalRow.totalArticles,
      totalPrice: originalRow.totalArticles * targetProduct.unitPrice
    };

    setGridRows(prev => {
      // Check if row already exists
      const existingIndex = prev.findIndex(r => r.id === newRow.id);
      if (existingIndex >= 0) {
        // Update existing row
        const updated = [...prev];
        updated[existingIndex] = newRow;
        return updated;
      } else {
        // Add new row
        return [...prev, newRow];
      }
    });

    toast({
      title: "Row Cloned",
      description: `Cloned to ${targetProduct.color} variant`,
    });
  }, [gridRows, gridProducts, toast]);

  // Remove a row
  const removeRow = useCallback((rowId: string) => {
    setGridRows(prev => prev.filter(r => r.id !== rowId));
  }, []);

  // Add product with specific size and quantity
  const addProductWithDetails = useCallback((product: Product, color: string, size: string, quantity: number) => {
    const styleCode = `${product.sku}${color.slice(0,1).toUpperCase()}`;
    const productKey = `${product.sku}-${color}`;
    const availableSizes = product.availableSizes
      .map(s => s.size)
      .filter(s => SIZES.includes(s));
      
    const gridProduct: GridProduct = {
      id: productKey,
      styleCode,
      name: product.name,
      brand: product.brand,
      color,
      unitPrice: parseFloat(product.wholesalePrice),
      category: product.category,
      imageUrl: product.image1,
      availableSizes,
      quantities: {}
    };
    
    let existingRow = gridRows.find(r => r.id === productKey);
    if (!existingRow) {
      // Add new row
      const newRow: GridRow = {
        id: productKey,
        product: gridProduct,
        quantities: { [size]: quantity },
        totalArticles: quantity,
        totalPrice: quantity * gridProduct.unitPrice
      };
      setGridRows(prev => [...prev, newRow]);
    } else {
      // Update existing row
      const currentQty = existingRow.quantities[size] || 0;
      const newQuantity = currentQty + quantity;
      updateQuantity(productKey, size, newQuantity);
    }
  }, [gridRows, updateQuantity]);

  // Add product to grid
  const addProductToGrid = useCallback((product: GridProduct) => {
    const existingRow = gridRows.find(r => r.id === product.id);
    if (existingRow) {
      toast({
        title: "Product Already Added",
        description: `${product.name} (${product.color}) is already in the grid`,
        variant: "destructive"
      });
      return;
    }

    const newRow: GridRow = {
      id: product.id,
      product,
      quantities: {},
      totalArticles: 0,
      totalPrice: 0
    };

    setGridRows(prev => [...prev, newRow]);
    
    toast({
      title: "Product Added",
      description: `Added ${product.name} (${product.color}) to grid`,
    });
  }, [gridRows, toast]);

  // Calculate overall totals
  const overallTotals = useMemo(() => {
    const totalQuantity = gridRows.reduce((sum, row) => sum + row.totalArticles, 0);
    const totalPrice = gridRows.reduce((sum, row) => sum + row.totalPrice, 0);
    return { totalQuantity, totalPrice };
  }, [gridRows]);

  return (
    <div className="space-y-6" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      {/* Brand Icon Toolbar */}
      <BrandIconToolbar
        filters={filters}
        onToggleArrayFilter={onToggleArrayFilter}
      />
      
      {/* Available Products to Add */}
      <Card>
        <CardHeader>
          <CardTitle>Available Products</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-64 overflow-y-auto">
            {gridProducts.map(product => (
              <div key={product.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-12 h-12 object-cover rounded"
                  />
                  <div>
                    <div className="font-medium text-sm">{product.styleCode}</div>
                    <div className="text-xs text-muted-foreground">{product.name}</div>
                    <div className="text-xs">{product.color} • ${product.unitPrice}</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addProductToGrid(product)}
                  disabled={gridRows.some(r => r.id === product.id)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Visual Path Designer Canvas */}
      <VisualPathCanvas 
        onPathsChange={(paths) => {
          // Sync visual paths with order designer below
          console.log('Visual paths updated:', paths);
        }}
      />
      
      {/* Order Designer */}
      <BulkOrderDecisionTree 
        filters={filters}
        onAddToGrid={addProductWithDetails}
      />

      {/* Grid Ordering Interface */}
      <Card>
        <CardHeader>
          <CardTitle>Bulk Order Grid</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-border">
              <thead>
                <tr className="bg-muted/50">
                  <th className="border border-border p-3 text-left min-w-[200px]">Product</th>
                  {SIZES.map(size => (
                    <th key={size} className="border border-border p-2 text-center w-16">
                      {size}
                    </th>
                  ))}
                  <th className="border border-border p-3 text-center w-20">Total Articles</th>
                  <th className="border border-border p-3 text-center w-24">Total LP</th>
                  <th className="border border-border p-3 text-center w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {gridRows.map((row, rowIndex) => (
                  <tr key={row.id} className="hover:bg-muted/30">
                    {/* Product Info */}
                    <td className="border border-border p-3">
                      <div className="flex items-center space-x-3">
                        <img
                          src={row.product.imageUrl}
                          alt={row.product.name}
                          className="w-10 h-10 object-cover rounded"
                        />
                        <div>
                          <div className="font-medium text-sm">{row.product.styleCode}</div>
                          <div className="text-xs text-muted-foreground">{row.product.name}</div>
                          <div className="text-xs">{row.product.color} • ${row.product.unitPrice}</div>
                        </div>
                      </div>
                    </td>
                    
                    {/* Size Quantity Inputs */}
                    {SIZES.map((size, sizeIndex) => {
                      const cellKey = `${row.id}-${size}`;
                      const isSelected = dragFill.selectedCells.has(cellKey);
                      const isAvailable = row.product.availableSizes.includes(size);
                      const isCopied = copiedRowId === row.id;
                      
                      return (
                        <td 
                          key={size} 
                          className={`border border-border p-1 ${
                            isSelected ? 'bg-blue-100 dark:bg-blue-900' : ''
                          } ${!isAvailable ? 'bg-gray-50 dark:bg-gray-800' : ''}`}
                          onMouseDown={(e) => {
                            if (isAvailable && (e.target === e.currentTarget || e.shiftKey || e.ctrlKey)) {
                              handleCellMouseDown(rowIndex, sizeIndex, e);
                            }
                          }}
                          onMouseEnter={() => isAvailable && handleCellMouseEnter(rowIndex, sizeIndex)}
                          onMouseUp={handleMouseUp}
                        >
                          <Input
                            type="number"
                            min="0"
                            value={row.quantities[size] || ''}
                            onChange={(e) => updateQuantity(row.id, size, parseInt(e.target.value) || 0)}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={(e) => e.stopPropagation()}
                            className={`w-full h-8 text-center text-xs ${
                              isSelected ? 'bg-blue-50 dark:bg-blue-800 border-blue-300' : ''
                            }`}
                            placeholder="0"
                            disabled={!isAvailable}
                          />
                        </td>
                      );
                    })}
                    
                    {/* Total Articles */}
                    <td className="border border-border p-3 text-center font-medium">
                      {row.totalArticles}
                    </td>
                    
                    {/* Total LP */}
                    <td className="border border-border p-3 text-center font-medium">
                      ${row.totalPrice.toFixed(2)}
                    </td>
                    
                    {/* Actions */}
                    <td className="border border-border p-3">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyRow(row.id)}
                          title="Copy row"
                          className={copiedRowId === row.id ? 'bg-green-100 border-green-400' : ''}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => pasteRow(row.id)}
                          title="Paste row"
                          disabled={!gridClipboard.has()}
                        >
                          <ClipboardPaste className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeRow(row.id)}
                          title="Remove row"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {gridRows.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                Add products from the list above to start creating your bulk order
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bulk Fill Interface */}
      {(showBulkInput || dragFill.selectedCells.size > 0) && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <MousePointer2 className="h-5 w-5 text-blue-600" />
                  <span className="font-medium text-blue-900 dark:text-blue-100">
                    {dragFill.selectedCells.size} cells selected
                  </span>
                </div>
                {showBulkInput && (
                  <div className="flex items-center space-x-2">
                    <Input
                      type="number"
                      placeholder="Enter quantity"
                      value={bulkQuantity}
                      onChange={(e) => setBulkQuantity(e.target.value)}
                      className="w-24 h-8"
                      min="0"
                    />
                    <Button 
                      size="sm" 
                      onClick={applyBulkQuantity}
                      disabled={!bulkQuantity || parseInt(bulkQuantity) < 0}
                    >
                      Fill All
                    </Button>
                  </div>
                )}
              </div>
              
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={clearSelection}
                className="text-blue-600 hover:text-blue-800"
              >
                <X className="h-4 w-4" />
                Clear Selection
              </Button>
            </div>
            
            {!showBulkInput && dragFill.selectedCells.size > 1 && (
              <div className="mt-3">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setShowBulkInput(true)}
                  className="border-blue-300 text-blue-600 hover:bg-blue-100"
                >
                  Bulk Fill Selected Cells
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Overall Totals */}
      {gridRows.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex space-x-8">
                <div>
                  <div className="text-sm text-muted-foreground">Total Quantity</div>
                  <div className="text-2xl font-bold">{overallTotals.totalQuantity.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">pairs</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total Price</div>
                  <div className="text-2xl font-bold">${overallTotals.totalPrice.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">list price</div>
                </div>
              </div>
              
              <div className="flex space-x-3">
                <Button variant="outline">
                  Export Order
                </Button>
                <Button>
                  Add to Cart ({overallTotals.totalQuantity} pairs)
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}