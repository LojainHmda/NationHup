import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Copy, ClipboardPaste, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SelectedProduct {
  productId: string;
  name: string;
  brand: string;
  styleCode: string;
  imageUrl: string;
  availableColors: string[];
  availableSizes: string[];
  unitPrice: number;
}

interface SizeColorMatrixProps {
  selectedProducts: SelectedProduct[];
  onBack: () => void;
  onSave: (orders: OrderItem[]) => void;
}

interface OrderItem {
  productId: string;
  name: string;
  brand: string;
  styleCode: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
}

interface CellCoordinate {
  productIndex: number;
  colorIndex: number;
  sizeIndex: number;
}

export function SizeColorMatrix({ selectedProducts, onBack, onSave }: SizeColorMatrixProps) {
  const { toast } = useToast();
  
  // Matrix data: productId -> color -> size -> quantity
  const [matrixData, setMatrixData] = useState<Map<string, Map<string, Map<string, number>>>>(new Map());
  
  // Selection and editing state
  const [activeCell, setActiveCell] = useState<CellCoordinate | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<CellCoordinate | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  
  // Copy/paste state
  const [copiedData, setCopiedData] = useState<Array<{color: string; size: string; quantity: number}>>([]);
  
  // Initialize matrix data
  useEffect(() => {
    const initialData = new Map<string, Map<string, Map<string, number>>>();
    selectedProducts.forEach(product => {
      const productMatrix = new Map<string, Map<string, number>>();
      product.availableColors.forEach(color => {
        const colorMatrix = new Map<string, number>();
        product.availableSizes.forEach(size => {
          colorMatrix.set(size, 0);
        });
        productMatrix.set(color, colorMatrix);
      });
      initialData.set(product.productId, productMatrix);
    });
    setMatrixData(initialData);
  }, [selectedProducts]);
  
  const getCellKey = (productIndex: number, colorIndex: number, sizeIndex: number): string => 
    `${productIndex},${colorIndex},${sizeIndex}`;
  
  const getQuantity = (productId: string, color: string, size: string): number => {
    return matrixData.get(productId)?.get(color)?.get(size) ?? 0;
  };
  
  const setQuantity = (productId: string, color: string, size: string, quantity: number) => {
    setMatrixData(prev => {
      const newData = new Map(prev);
      const productMatrix = newData.get(productId) || new Map();
      const colorMatrix = productMatrix.get(color) || new Map();
      colorMatrix.set(size, Math.max(0, quantity));
      productMatrix.set(color, colorMatrix);
      newData.set(productId, productMatrix);
      return newData;
    });
  };
  
  const handleCellClick = (productIndex: number, colorIndex: number, sizeIndex: number) => {
    setActiveCell({ productIndex, colorIndex, sizeIndex });
    setSelectedCells(new Set([getCellKey(productIndex, colorIndex, sizeIndex)]));
  };
  
  const handleCellDoubleClick = (productIndex: number, colorIndex: number, sizeIndex: number) => {
    const product = selectedProducts[productIndex];
    const color = product.availableColors[colorIndex];
    const size = product.availableSizes[sizeIndex];
    const currentQty = getQuantity(product.productId, color, size);
    
    setEditingCell({ productIndex, colorIndex, sizeIndex });
    setEditValue(currentQty.toString());
  };
  
  const handleEditKeyDown = (e: React.KeyboardEvent, productId: string, color: string, size: string) => {
    if (e.key === 'Enter') {
      const qty = parseInt(editValue) || 0;
      setQuantity(productId, color, size, qty);
      setEditingCell(null);
      setEditValue('');
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setEditValue('');
    }
  };
  
  const handleCopy = useCallback(() => {
    if (!activeCell) return;
    
    const product = selectedProducts[activeCell.productIndex];
    const color = product.availableColors[activeCell.colorIndex];
    const size = product.availableSizes[activeCell.sizeIndex];
    const quantity = getQuantity(product.productId, color, size);
    
    setCopiedData([{ color, size, quantity }]);
    
    toast({
      title: "Copied",
      description: `Copied ${quantity} units of ${color} / ${size}`,
    });
  }, [activeCell, selectedProducts, matrixData, toast]);
  
  const handlePaste = useCallback(() => {
    if (!activeCell || copiedData.length === 0) return;
    
    const product = selectedProducts[activeCell.productIndex];
    const targetColor = product.availableColors[activeCell.colorIndex];
    const targetSize = product.availableSizes[activeCell.sizeIndex];
    
    // Paste the first copied item's quantity
    setQuantity(product.productId, targetColor, targetSize, copiedData[0].quantity);
    
    toast({
      title: "Pasted",
      description: `Pasted ${copiedData[0].quantity} units`,
    });
  }, [activeCell, copiedData, selectedProducts]);
  
  const handleSave = () => {
    const orders: OrderItem[] = [];
    
    selectedProducts.forEach(product => {
      const productMatrix = matrixData.get(product.productId);
      if (!productMatrix) return;
      
      productMatrix.forEach((colorMatrix, color) => {
        colorMatrix.forEach((quantity, size) => {
          if (quantity > 0) {
            orders.push({
              productId: product.productId,
              name: product.name,
              brand: product.brand,
              styleCode: product.styleCode,
              color,
              size,
              quantity,
              unitPrice: product.unitPrice
            });
          }
        });
      });
    });
    
    if (orders.length === 0) {
      toast({
        title: "No Items",
        description: "Please select at least one size and color with quantity > 0",
        variant: "destructive"
      });
      return;
    }
    
    onSave(orders);
  };
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingCell) return; // Don't handle shortcuts while editing
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        handleCopy();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        handlePaste();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCopy, handlePaste, editingCell]);
  
  return (
    <div className="fixed inset-0 bg-background z-50 overflow-auto">
      <div className="min-h-screen p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={onBack}
              className="gap-2"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Grid
            </Button>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Select Colors & Sizes
            </h1>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleCopy}
              disabled={!activeCell}
              className="gap-2"
              data-testid="button-copy"
            >
              <Copy className="h-4 w-4" />
              Copy (Ctrl+C)
            </Button>
            <Button
              variant="outline"
              onClick={handlePaste}
              disabled={copiedData.length === 0}
              className="gap-2"
              data-testid="button-paste"
            >
              <ClipboardPaste className="h-4 w-4" />
              Paste (Ctrl+V)
            </Button>
            <Button
              onClick={handleSave}
              className="gap-2 bg-gradient-to-r from-primary to-accent"
              data-testid="button-save-order"
            >
              <Save className="h-4 w-4" />
              Save Order
            </Button>
          </div>
        </div>
        
        {/* Products Grid */}
        <div className="space-y-8">
          {selectedProducts.map((product, productIndex) => (
            <Card key={product.productId} className="p-6">
              <div className="flex gap-6 mb-6">
                <img
                  src={product.image1}
                  alt={product.name}
                  className="w-32 h-32 object-fill rounded-lg border"
                />
                <div>
                  <h2 className="text-xl font-bold">{product.name}</h2>
                  <p className="text-muted-foreground">{product.brand} • {product.styleCode}</p>
                  <p className="text-lg font-semibold mt-2">${product.unitPrice.toFixed(2)}</p>
                </div>
              </div>
              
              {/* Size/Color Matrix */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="border-2 border-border bg-muted p-3 text-left font-semibold">Size / Color</th>
                      {product.availableColors.map((color, colorIndex) => (
                        <th
                          key={color}
                          className="border-2 border-border bg-muted p-3 text-center font-semibold min-w-[100px]"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <div 
                              className="w-6 h-6 rounded-full border-2 border-gray-300"
                              style={{
                                backgroundColor: color.toLowerCase() === 'white' ? '#FFFFFF' :
                                              color.toLowerCase() === 'black' ? '#000000' :
                                              color.toLowerCase() === 'red' ? '#DC2626' :
                                              color.toLowerCase() === 'blue' ? '#2563EB' :
                                              color.toLowerCase() === 'green' ? '#16A34A' :
                                              color.toLowerCase() === 'grey' || color.toLowerCase() === 'gray' ? '#6B7280' :
                                              '#6B7280'
                              }}
                            />
                            <span>{color}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {product.availableSizes.map((size, sizeIndex) => (
                      <tr key={size}>
                        <td className="border border-border bg-muted/50 p-3 font-medium">
                          {size}
                        </td>
                        {product.availableColors.map((color, colorIndex) => {
                          const isActive = activeCell?.productIndex === productIndex &&
                                         activeCell?.colorIndex === colorIndex &&
                                         activeCell?.sizeIndex === sizeIndex;
                          const isEditing = editingCell?.productIndex === productIndex &&
                                          editingCell?.colorIndex === colorIndex &&
                                          editingCell?.sizeIndex === sizeIndex;
                          const quantity = getQuantity(product.productId, color, size);
                          
                          return (
                            <td
                              key={color}
                              className={`border border-border p-0 cursor-cell transition-colors ${
                                isActive ? 'ring-2 ring-primary bg-primary/10' : 
                                quantity > 0 ? 'bg-accent/20' : 'hover:bg-muted/30'
                              }`}
                              onClick={() => handleCellClick(productIndex, colorIndex, sizeIndex)}
                              onDoubleClick={() => handleCellDoubleClick(productIndex, colorIndex, sizeIndex)}
                              data-testid={`cell-${productIndex}-${colorIndex}-${sizeIndex}`}
                            >
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => handleEditKeyDown(e, product.productId, color, size)}
                                  onBlur={() => {
                                    const qty = parseInt(editValue) || 0;
                                    setQuantity(product.productId, color, size, qty);
                                    setEditingCell(null);
                                  }}
                                  autoFocus
                                  className="w-full h-12 text-center border-2 border-primary bg-background outline-none"
                                  data-testid={`input-${productIndex}-${colorIndex}-${sizeIndex}`}
                                />
                              ) : (
                                <div className="h-12 flex items-center justify-center font-semibold">
                                  {quantity || ''}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
