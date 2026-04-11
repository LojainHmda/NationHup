import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { X, ShoppingCart, Package, Copy, ClipboardPaste } from "lucide-react";
import type { Product } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface BucketItem {
  productId: string;
  productName: string;
  productSku: string;
  brand: string;
  color: string;
  size: string;
  quantity: number;
  price: string;
}

interface PreCartMatrixProps {
  isOpen: boolean;
  selectedProductIds: string[];
  onClose: () => void;
  onAddToCart: (productId: string, productName: string, items: { color: string; size: string; quantity: number }[]) => void;
}

interface QuantityMap {
  [productId: string]: {
    [color: string]: {
      [size: string]: number;
    };
  };
}

export function PreCartMatrix({ isOpen, selectedProductIds, onClose, onAddToCart }: PreCartMatrixProps) {
  const { toast } = useToast();
  const [quantities, setQuantities] = useState<QuantityMap>({});
  const [activeCell, setActiveCell] = useState<{ productId: string; color: string; size: string } | null>(null);
  const [fillHandleCell, setFillHandleCell] = useState<{ productId: string; color: string; size: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartCell, setDragStartCell] = useState<{ productId: string; color: string; size: string } | null>(null);
  const [fillPreview, setFillPreview] = useState<Set<string>>(new Set());
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [copiedRow, setCopiedRow] = useState<{ productId: string; color: string; data: { [size: string]: number } } | null>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const dialogRef = useRef<HTMLDivElement>(null);

  // Fetch all products
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const selectedProducts = allProducts.filter(p => selectedProductIds.includes(p.id));

  // Focus management and escape key handler
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      // Focus the dialog when it opens
      dialogRef.current.focus();
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  // Clear selected cells and fill handle when clicking anywhere (except during drag or on inputs)
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Don't clear during drag operation
      if (isDragging) return;
      
      const target = e.target as HTMLElement;
      const isInput = target.closest('input[data-testid^="input-quantity-"]');
      
      // Clear selection when clicking anywhere
      setSelectedCells(new Set());
      
      // Clear fill handle only if not clicking on an input (inputs will set their own fill handle on focus)
      if (!isInput) {
        setFillHandleCell(null);
      }
    };

    if (isOpen) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [isOpen, isDragging]);

  const getCellKey = (productId: string, color: string, size: string) => `${productId}:::${color}:::${size}`;

  const handleQuantityChange = (productId: string, color: string, size: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setQuantities(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [color]: {
          ...(prev[productId]?.[color] || {}),
          [size]: numValue,
        },
      },
    }));
    
    // After editing, keep fill handle on this cell
    setFillHandleCell({ productId, color, size });
  };

  // Fill handle drag start
  const handleFillHandleMouseDown = useCallback((e: React.MouseEvent, productId: string, color: string, size: string) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Blur the active cell to finish editing
    const cellKey = getCellKey(productId, color, size);
    const input = inputRefs.current.get(cellKey);
    if (input) {
      input.blur();
    }
    setActiveCell(null);
    
    setIsDragging(true);
    setDragStartCell({ productId, color, size });
    setFillPreview(new Set());
    setSelectedCells(new Set()); // Clear previous selection when starting a new drag
  }, []);

  // Update fill preview based on current cell
  const updateFillPreview = useCallback((productId: string, color: string, size: string, product: Product) => {
    if (!dragStartCell) return;
    
    // Only allow fill within the same product and color
    if (productId !== dragStartCell.productId || color !== dragStartCell.color) return;
    
    const startSizeIdx = product.availableSizes.findIndex(s => s.size === dragStartCell.size);
    const endSizeIdx = product.availableSizes.findIndex(s => s.size === size);
    
    const minSizeIdx = Math.min(startSizeIdx, endSizeIdx);
    const maxSizeIdx = Math.max(startSizeIdx, endSizeIdx);
    
    const newPreview = new Set<string>();
    for (let s = minSizeIdx; s <= maxSizeIdx; s++) {
      const cellKey = getCellKey(productId, color, product.availableSizes[s].size);
      newPreview.add(cellKey);
    }
    setFillPreview(newPreview);
    
    // Update selected cells in real-time during drag
    setSelectedCells(prev => {
      const updated = new Set(prev);
      newPreview.forEach(key => updated.add(key));
      return updated;
    });
  }, [dragStartCell]);

  // Highlight cells during drag
  const handleMouseEnter = useCallback((productId: string, color: string, size: string, product: Product) => {
    if (isDragging && dragStartCell) {
      updateFillPreview(productId, color, size, product);
    }
  }, [isDragging, dragStartCell, updateFillPreview]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent, productId: string, color: string, size: string, product: Product) => {
    const currentSizeIndex = product.availableSizes.findIndex(s => s.size === size);
    
    let nextSize = size;
    
    if (e.key === 'ArrowLeft' && currentSizeIndex > 0) {
      e.preventDefault();
      nextSize = product.availableSizes[currentSizeIndex - 1].size;
    } else if (e.key === 'ArrowRight' && currentSizeIndex < product.availableSizes.length - 1) {
      e.preventDefault();
      nextSize = product.availableSizes[currentSizeIndex + 1].size;
    } else if (e.key === 'Enter') {
      e.preventDefault();
    }
    
    if (nextSize !== size) {
      const nextKey = getCellKey(productId, color, nextSize);
      const nextInput = inputRefs.current.get(nextKey);
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
        setActiveCell({ productId, color, size: nextSize });
        setFillHandleCell({ productId, color, size: nextSize });
      }
    }
  }, []);

  // Track mouse movement and mouse up globally to apply fill
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      // Find the element under the cursor
      const element = document.elementFromPoint(e.clientX, e.clientY);
      if (!element) return;

      // Find the closest input element (the cell)
      const input = element.closest('input[data-testid^="input-quantity-"]');
      if (!input) return;

      // Extract productId, color, and size from the testid
      const testId = input.getAttribute('data-testid');
      if (!testId) return;

      const match = testId.match(/^input-quantity-(.+)-(.+)-(.+)$/);
      if (!match) return;

      const [, productId, color, size] = match;

      // Find the product to update preview
      const product = selectedProducts.find(p => p.id === productId);
      if (!product) return;

      updateFillPreview(productId, color, size, product);
    };

    const handleGlobalMouseUp = () => {
      if (isDragging && dragStartCell && fillPreview.size > 0) {
        const sourceValue = quantities[dragStartCell.productId]?.[dragStartCell.color]?.[dragStartCell.size] || 0;
        const fillPreviewArray = Array.from(fillPreview);
        
        fillPreviewArray.forEach(cellKey => {
          const [productId, color, size] = cellKey.split(':::');
          handleQuantityChange(productId, color, size, sourceValue.toString());
        });
        
        // Keep the final selection in selectedCells
        setSelectedCells(new Set(fillPreview));
        
        // Move fill handle to the last selected cell
        const lastCellKey = fillPreviewArray[fillPreviewArray.length - 1];
        const [productId, color, size] = lastCellKey.split(':::');
        setFillHandleCell({ productId, color, size });
        
        toast({
          title: "✓ Filled!",
          description: `Filled ${fillPreview.size} cells with value ${sourceValue}`,
          duration: 2000,
        });
      }
      setIsDragging(false);
      setDragStartCell(null);
      setFillPreview(new Set());
    };
    
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, dragStartCell, fillPreview, quantities, selectedProducts, updateFillPreview]);

  const handleAddToCart = () => {
    let hasLimitError = false;
    
    Object.entries(quantities).forEach(([productId, colors]) => {
      const product = selectedProducts.find(p => p.id === productId);
      if (!product) return;

      const items: { color: string; size: string; quantity: number }[] = [];
      let totalQuantity = 0;
      
      Object.entries(colors).forEach(([color, sizes]) => {
        Object.entries(sizes).forEach(([size, quantity]) => {
          if (quantity > 0) {
            items.push({ color, size, quantity });
            totalQuantity += quantity;
          }
        });
      });

      if (items.length > 0) {
        const avs = (product as any).availableSizes || [];
        for (const item of items) {
          const sizeEntry = avs.find((a: { size: string; limitOrder?: number }) => a.size === item.size);
          const limit = sizeEntry?.limitOrder ?? ((product as any).limitOrder >= 1 ? (product as any).limitOrder : null);
          if (limit != null && item.quantity > limit) {
            toast({
              variant: "destructive",
              title: "Order Limit Exceeded",
              description: `You cannot order more than ${limit} units of size ${item.size} for "${product.name}".`,
            });
            hasLimitError = true;
            return;
          }
        }
        onAddToCart(productId, product.name, items);
      }
    });
    
    if (!hasLimitError) {
      onClose();
    }
  };

  const getTotalItems = () => {
    let total = 0;
    Object.values(quantities).forEach(colors => {
      Object.values(colors).forEach(sizes => {
        Object.values(sizes).forEach(quantity => {
          total += quantity;
        });
      });
    });
    return total;
  };

  // Copy row function
  const handleCopyRow = (productId: string, color: string) => {
    const rowData = quantities[productId]?.[color] || {};
    const totalQty = Object.values(rowData).reduce((sum, qty) => sum + qty, 0);
    
    // Warn if trying to copy an empty row
    if (totalQty === 0) {
      toast({
        title: "⚠️ Empty Row",
        description: `${color} has no quantities to copy. Enter some quantities first.`,
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    
    setCopiedRow({ productId, color, data: { ...rowData } });
    
    console.log('📋 Copied row:', { productId, color, data: rowData, totalQty });
    
    toast({
      title: "✓ Copied!",
      description: `Copied ${totalQty} items from ${color}. Click Paste on another color to duplicate.`,
      duration: 3000,
    });
  };

  // Paste row function
  const handlePasteRow = (productId: string, color: string) => {
    if (!copiedRow) {
      toast({
        title: "No data copied",
        description: "Please copy a row first",
        variant: "destructive",
        duration: 2000,
      });
      return;
    }

    const totalQty = Object.values(copiedRow.data).reduce((sum, qty) => sum + qty, 0);
    
    console.log('📋 Pasting row:', { 
      from: { productId: copiedRow.productId, color: copiedRow.color }, 
      to: { productId, color },
      data: copiedRow.data,
      totalQty
    });

    // Paste the data to the target row
    setQuantities(prev => {
      const newQuantities = {
        ...prev,
        [productId]: {
          ...prev[productId],
          [color]: { ...copiedRow.data },
        },
      };
      
      console.log('📋 New quantities state:', newQuantities);
      return newQuantities;
    });

    toast({
      title: "✓ Pasted!",
      description: `Pasted quantities to ${color} (${totalQty} total items)`,
      duration: 2000,
    });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      {/* Floating centered popup */}
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
        <Card 
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="precart-title"
          aria-describedby="precart-description"
          tabIndex={-1}
          className="w-full max-w-6xl my-8 bg-white dark:bg-slate-900 shadow-2xl animate-in zoom-in-95 slide-in-from-top-4 duration-300"
        >
          {/* Header */}
          <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between z-10">
            <div>
              <h2 id="precart-title" className="text-2xl font-bold">Add to Cart</h2>
              <p id="precart-description" className="text-sm text-muted-foreground">Select sizes and quantities for each color SKU</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleAddToCart}
                className="bg-yellow-400 hover:bg-yellow-500 text-blue-900 font-semibold"
                data-testid="button-add-to-cart"
                disabled={getTotalItems() === 0}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                Add to Cart ({getTotalItems()} items)
              </Button>
              <Button
                onClick={onClose}
                variant="ghost"
                size="icon"
                data-testid="button-close-precart"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {selectedProducts.length === 0 ? (
            <div className="text-center py-12 p-6">
              <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Products Selected</h3>
              <p className="text-muted-foreground mb-4">Please select products first</p>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Instructions */}
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-900 dark:text-blue-100 font-bold mb-2">Quick Tips:</p>
                <div className="grid grid-cols-2 gap-3 text-xs text-blue-700 dark:text-blue-200">
                  <div>
                    <p className="font-semibold mb-1">🔄 Drag to Fill (same color):</p>
                    <p className="pl-2">
                      1. Enter a number in any cell
                      <br />
                      2. Drag the <span className="font-semibold">blue square</span> in corner
                      <br />
                      3. Release to fill across sizes
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">📋 Copy/Paste Rows:</p>
                    <p className="pl-2">
                      1. Click <span className="font-semibold">Copy</span> on any color SKU
                      <br />
                      2. Click <span className="font-semibold">Paste</span> on another color
                      <br />
                      3. Quantities are duplicated instantly
                    </p>
                  </div>
                </div>
              </div>

              {/* Products - Each color as separate SKU table */}
              <div className="space-y-6">
                {selectedProducts.map(product => (
                  <div key={product.id} className="space-y-3">
                    {/* Product Header */}
                    <div className="flex gap-3 items-start p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                      <img
                        src={product.image1}
                        alt={product.name}
                        className="w-16 h-16 object-cover rounded-md"
                      />
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold">{product.name}</h3>
                        <p className="text-xs text-muted-foreground">{product.brand}</p>
                        <p className="text-xs font-medium text-primary mt-0.5">
                          ${product.wholesalePrice} wholesale
                        </p>
                      </div>
                    </div>

                    {/* Separate table for each color SKU */}
                    {[product.colourway || 'Default'].map((color: string) => {
                      const isCopiedRow = copiedRow?.productId === product.id && copiedRow?.color === color;
                      
                      // Calculate totals for this color SKU
                      const colorTotal = Object.values(quantities[product.id]?.[color] || {}).reduce((sum, qty) => sum + qty, 0);
                      const colorPrice = colorTotal * parseFloat(product.wholesalePrice);
                      
                      return (
                        <Card 
                          key={`${product.id}-${color}`} 
                          className={`p-3 transition-all ${isCopiedRow ? 'ring-2 ring-green-500 bg-green-50/50 dark:bg-green-900/20' : ''}`}
                        >
                        <div className="flex gap-3 mb-3">
                          <img
                            src={product.image1}
                            alt={`${product.name} - ${color}`}
                            className="w-20 h-20 object-cover rounded-md border border-slate-200"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                                Color: {color}
                              </h4>
                              {isCopiedRow && (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-green-500 text-white rounded-full">
                                  COPIED
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              SKU: {product.sku}-{color.substring(0, 3).toUpperCase()}
                            </p>
                            <p className="text-xs font-medium text-primary mt-1">
                              ${product.wholesalePrice} per pair
                            </p>
                          </div>
                          <div className="flex gap-1 items-start">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopyRow(product.id, color)}
                              className={`h-7 px-2 text-xs ${isCopiedRow ? 'bg-green-100 border-green-400' : ''}`}
                              data-testid={`button-copy-${product.id}-${color}`}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copy
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePasteRow(product.id, color)}
                              className={`h-7 px-2 text-xs ${copiedRow && !isCopiedRow ? 'bg-green-50 border-green-300 hover:bg-green-100' : ''}`}
                              data-testid={`button-paste-${product.id}-${color}`}
                            >
                              <ClipboardPaste className="h-3 w-3 mr-1" />
                              Paste
                            </Button>
                          </div>
                        </div>
                        
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-xs">
                            <thead>
                              <tr className="bg-muted">
                                <th className="border border-slate-300 px-2 py-1 text-left font-semibold text-xs">Size</th>
                                {product.availableSizes.map(sizeObj => (
                                  <th key={sizeObj.size} className="border border-slate-300 px-1 py-1 text-center font-semibold text-xs min-w-[70px]">
                                    {sizeObj.size}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="border border-slate-300 px-2 py-1 font-medium text-xs whitespace-nowrap bg-slate-50 dark:bg-slate-800">
                                  Quantity
                                </td>
                                {product.availableSizes.map(sizeObj => {
                                  // For pre-order products, skip stock validation
                                  const isPreOrder = product.isPreOrder || false;
                                  const available = isPreOrder ? true : sizeObj.stock > 0;
                                  const cellKey = getCellKey(product.id, color, sizeObj.size);
                                  const isActive = activeCell?.productId === product.id && 
                                                 activeCell?.color === color && 
                                                 activeCell?.size === sizeObj.size;
                                  const hasFillHandle = fillHandleCell?.productId === product.id && 
                                                       fillHandleCell?.color === color && 
                                                       fillHandleCell?.size === sizeObj.size;
                                  const isFillPreview = fillPreview.has(cellKey);
                                  const isSelected = selectedCells.has(cellKey);
                                  
                                  return (
                                    <td 
                                      key={sizeObj.size} 
                                      className={`border border-slate-300 p-0 relative ${isSelected ? 'bg-blue-200 dark:bg-blue-950/50 border-2 border-blue-600 dark:border-blue-700' : ''}`}
                                      onMouseEnter={() => handleMouseEnter(product.id, color, sizeObj.size, product)}
                                    >
                                      <Input
                                        ref={(el) => {
                                          if (el) {
                                            inputRefs.current.set(cellKey, el);
                                          } else {
                                            inputRefs.current.delete(cellKey);
                                          }
                                        }}
                                        type="number"
                                        min="0"
                                        max={isPreOrder ? undefined : (available ? sizeObj.stock : 0)}
                                        disabled={!available}
                                        value={quantities[product.id]?.[color]?.[sizeObj.size] || ''}
                                        onChange={(e) => handleQuantityChange(product.id, color, sizeObj.size, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(e, product.id, color, sizeObj.size, product)}
                                        onFocus={() => {
                                          setActiveCell({ productId: product.id, color, size: sizeObj.size });
                                          setFillHandleCell({ productId: product.id, color, size: sizeObj.size });
                                        }}
                                        className={`w-full h-8 text-center text-xs px-1 border-0 focus:ring-0 ${!available ? 'bg-muted' : ''} ${isSelected ? 'bg-blue-200 dark:bg-blue-950/50' : ''}`}
                                        placeholder={available ? '0' : '-'}
                                        data-testid={`input-quantity-${product.id}-${color}-${sizeObj.size}`}
                                      />
                                      {/* Excel-like Fill Handle */}
                                      {hasFillHandle && (
                                        <div
                                          className="absolute bottom-0 right-0 w-2 h-2 bg-blue-600 cursor-crosshair"
                                          style={{ transform: 'translate(50%, 50%)' }}
                                          onMouseDown={(e) => handleFillHandleMouseDown(e, product.id, color, sizeObj.size)}
                                          data-testid={`fill-handle-${product.id}-${color}-${sizeObj.size}`}
                                        />
                                      )}
                                      {available && !isPreOrder && (
                                        <div className="text-[9px] text-muted-foreground text-center leading-none px-1 pb-0.5 bg-slate-50">
                                          Stock: {sizeObj.stock}
                                        </div>
                                      )}
                                      {isPreOrder && (
                                        <div className="text-[9px] text-white text-center leading-none px-1 pb-0.5 bg-black">
                                          Pre-Order
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                              {/* Total Row */}
                              <tr className="bg-yellow-50 dark:bg-yellow-900/20 border-t-2 border-yellow-400">
                                <td className="border border-slate-300 px-2 py-2 font-bold text-xs text-blue-900 dark:text-blue-100">
                                  TOTAL
                                </td>
                                <td 
                                  colSpan={product.availableSizes.length}
                                  className="border border-slate-300 px-2 py-2"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="font-bold text-sm text-blue-900 dark:text-blue-100">
                                      {colorTotal} pairs
                                    </div>
                                    <div className="font-bold text-sm text-green-700 dark:text-green-400">
                                      ${colorPrice.toFixed(2)}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
