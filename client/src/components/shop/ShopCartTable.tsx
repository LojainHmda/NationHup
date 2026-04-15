import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, ShoppingCart, Plus, Minus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { Product } from '@shared/schema';

export type ShopCartProduct = {
  id: string;
  sku: string;
  name: string;
  color: string;
  image1: string;
  price: number;
  sizes: string[];
  quantities: Record<string, number>;
  availableSizes: Record<string, number>;
  isPreOrder?: boolean;
  brand?: string;
  unitsPerCarton?: number;
  unitsPerSize?: Record<string, number>;
  gender?: string;
  mainCategory?: string;
  kidsAgeGroup?: string;
  limitOrder?: number | null; // Fallback when no per-size limit (null/undefined = unlimited)
  limitOrderPerSize?: Record<string, number>; // Per-size max quantity (e.g. {"8-": 2, "9": 20})
  supportedSizes?: string[]; // Sizes this product supports (from product.availableSizes); undefined = all sizes
};

interface ShopCartTableProps {
  products: ShopCartProduct[];
  allSizes: string[];
  onQuantityChange?: (productId: string, size: string, quantity: number) => void;
  onBulkQuantityChange?: (updates: Array<{ productId: string; size: string; quantity: number }>) => void;
  onRemoveProduct?: (productId: string) => void;
  onToggleSelect?: (productId: string, selected: boolean) => void;
  readOnly?: boolean;
  highlightedRows?: Set<string>;
  convertSize?: (size: string) => string;
  selectedSizeStandard?: 'EU' | 'US' | 'UK';
}

const getCellKey = (productId: string, size: string) => `${productId}::${size}`;

function isSizeAvailable(product: ShopCartProduct, size: string): boolean {
  if (!product.supportedSizes || product.supportedSizes.length === 0) return true; // Backward compat: treat all as available
  return product.supportedSizes.includes(size);
}

function getLimitForSize(product: ShopCartProduct, size: string): number | null {
  // For carton products: limitOrder applies to total items. Per-size limit = maxCartons * unitsPerSize.
  const isCarton = (product.unitsPerCarton ?? 0) > 0;
  if (isCarton && product.limitOrder != null && product.limitOrder >= 1) {
    const unitsPerCarton = product.unitsPerCarton || 1;
    const maxCartons = Math.floor(product.limitOrder / unitsPerCarton);
    const unitsPerSize = product.unitsPerSize?.[size] || 0;
    const limitForSize = maxCartons * unitsPerSize;
    return limitForSize >= 1 ? limitForSize : null;
  }
  // For individual products: per-size limit or product-level limit
  const perSize = product.limitOrderPerSize?.[size];
  if (perSize != null && perSize >= 1) return perSize;
  if (product.limitOrder != null && product.limitOrder >= 1) return product.limitOrder;
  return null;
}

interface PopupCenteredProps {
  value: number;
  onChange: (newValue: number) => void;
  onApply: () => void;
  onClose: () => void;
  onCopy?: () => Promise<void>;
  onPaste?: () => Promise<void>;
  showCopyButton?: boolean;
  popupRef?: React.RefObject<HTMLDivElement>;
}

function PopupCentered({ value, onChange, onApply, onClose, onCopy, onPaste, showCopyButton = false, popupRef }: PopupCenteredProps) {
  const [localValue, setLocalValue] = useState(value);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleIncrement = () => {
    const newValue = localValue + 1;
    setLocalValue(newValue);
    onChange(newValue);
  };

  const handleDecrement = () => {
    const newValue = Math.max(0, localValue - 1);
    setLocalValue(newValue);
    onChange(newValue);
  };

  const handleCopy = async () => {
    if (onCopy) {
      await onCopy();
    }
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1000);
  };

  const handlePaste = async () => {
    if (onPaste) {
      await onPaste();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onApply();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div 
      ref={popupRef}
      className="bg-white border border-gray-300 rounded-md shadow-lg p-3 flex flex-col items-center gap-2 z-50"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="flex items-center gap-2">
        <div
          style={{
            width: 90,
            height: 28,
            background: "white",
            border: "2px solid #3a8bb7",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 2px",
            fontFamily: "sans-serif",
            fontSize: 13,
            userSelect: "none",
          }}
        >
          <button
            onClick={handleDecrement}
            disabled={isInputFocused}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 16,
              cursor: "pointer",
              width: 22,
              opacity: isInputFocused ? 0.5 : 1,
            }}
          >
            –
          </button>

          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={localValue}
            onChange={(e) => {
              const num = Number(e.target.value) || 0;
              setLocalValue(num);
              onChange(num);
            }}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            className="w-full text-center bg-transparent outline-none"
            style={{ fontFamily: 'sans-serif', fontSize: 13 }}
          />

          <button
            onClick={handleIncrement}
            disabled={isInputFocused}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 16,
              cursor: "pointer",
              width: 22,
              opacity: isInputFocused ? 0.5 : 1,
            }}
          >
            +
          </button>
        </div>

        <button onClick={onApply} className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600">
          Apply
        </button>
      </div>

      {showCopyButton && (
        <div
          style={{
            width: 130,
            height: 28,
            display: "flex",
            border: "2px solid #3a8bb7",
            borderRadius: 4,
            overflow: "hidden",
            background: "#f9fafb",
            fontFamily: "sans-serif",
            fontSize: 12,
            userSelect: "none",
            opacity: isInputFocused ? 0.5 : 1,
            pointerEvents: isInputFocused ? "none" : "auto",
          }}
        >
          <button
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: "0 2px",
            }}
            onClick={handleCopy}
          >
            <svg width="10" height="10" fill="#3a8bb7" viewBox="0 0 24 24">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 18H8V7h11v16z" />
            </svg>
            {isCopied ? 'COPIED' : 'COPY'}
          </button>

          <div style={{ width: 1, background: "#3a8bb7", opacity: 0.6 }} />

          <button
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: "0 2px",
            }}
            onClick={handlePaste}
          >
            <svg width="10" height="10" fill="#3a8bb7" viewBox="0 0 24 24">
              <path d="M19 2H14.82C14.4 0.84 13.3 0 12 0s-2.4.84-2.82 2H6C4.9 2 4 2.9 4 4v18c0 1.1.9 2 2 2h13c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 20H6V4h2v3h8V4h3v18z" />
            </svg>
            PASTE
          </button>
        </div>
      )}
    </div>
  );
}

const EditableCellInput = ({ value, onChange, onBlur, onKeyDown }: { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; onBlur: () => void; onKeyDown: (e: React.KeyboardEvent) => void; }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.select();
    }
  }, []);

  // Sync input value if the prop changes while component is mounted
  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="h-7 w-14 text-center text-xs font-semibold bg-transparent border-0 outline-none"
      autoFocus
    />
  );
};

export function ShopCartTable({
  products,
  allSizes,
  onQuantityChange,
  onBulkQuantityChange,
  onRemoveProduct,
  onToggleSelect,
  readOnly = false,
  highlightedRows = new Set(),
  convertSize,
  selectedSizeStandard,
}: ShopCartTableProps) {
  const { getCurrencySymbol, userCurrency } = useCurrency();
  
  // Pre-compute display sizes to ensure updates when convertSize changes
  const displaySizeMap = useMemo(() => {
    const map = new Map<string, string>();
    allSizes.forEach(size => {
      map.set(size, convertSize ? convertSize(size) : size);
    });
    return map;
  }, [allSizes, convertSize]);

  // Helper to get display size
  const getDisplaySize = (size: string) => displaySizeMap.get(size) || size;

  const [selectedRange, setSelectedRange] = useState<{ start: { productIndex: number; sizeIndex: number }; end: { productIndex: number; sizeIndex: number } } | null>(null);
  const [editingCell, setEditingCell] = useState<{ productIndex: number; sizeIndex: number } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const [isSelecting, setIsSelecting] = useState(false);
  const [isFilling, setIsFilling] = useState(false);
  const [fillOrigin, setFillOrigin] = useState<{ productIndex: number; sizeIndex: number; value: number } | null>(null);
  const [fillPreview, setFillPreview] = useState<Map<string, number>>(new Map());

  const [copiedData, setCopiedData] = useState<Array<Array<number>> | null>(null);
  const [copiedShape, setCopiedShape] = useState<{ rows: number; cols: number } | null>(null);

  const [hoveredCellKey, setHoveredCellKey] = useState<string | null>(null);

  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set(products.map((p) => p.id)));
  const [productToDelete, setProductToDelete] = useState<{ id: string; name: string } | null>(null);
  const [overStockAlertCells, setOverStockAlertCells] = useState<Set<string>>(new Set());
  const [orderLimitAlertCells, setOrderLimitAlertCells] = useState<Set<string>>(new Set());

  const [showFillPopup, setShowFillPopup] = useState(false);
  const [fillPopupPosition, setFillPopupPosition] = useState<{ top: number; left: number } | null>(null);
  const [fillInputValue, setFillInputValue] = useState(0);

  const [isRowFilling, setIsRowFilling] = useState(false);
  const [rowFillOriginIndex, setRowFillOriginIndex] = useState<number | null>(null);
  const [rowFillPreviewIndices, setRowFillPreviewIndices] = useState<Set<number>>(new Set());

  const tableRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showFillPopup && popupRef.current) {
      popupRef.current.focus();
    }
  }, [showFillPopup]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showFillPopup && popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setShowFillPopup(false);
        setSelectedRange(null);
      }
    };

    if (showFillPopup) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFillPopup]);

  const triggerOverStockAlert = useCallback((cellKey: string) => {
    setOverStockAlertCells(prev => new Set([...prev, cellKey]));
    setTimeout(() => {
      setOverStockAlertCells(prev => {
        const newSet = new Set(prev);
        newSet.delete(cellKey);
        return newSet;
      });
    }, 1000);
  }, []);

  const triggerOrderLimitAlert = useCallback((cellKey: string) => {
    setOrderLimitAlertCells(prev => new Set([...prev, cellKey]));
    setTimeout(() => {
      setOrderLimitAlertCells(prev => {
        const newSet = new Set(prev);
        newSet.delete(cellKey);
        return newSet;
      });
    }, 1000);
  }, []);

  const saveAndCloseEdit = useCallback(() => {
    if (!editingCell) return;
    const { productIndex, sizeIndex } = editingCell;
    const product = products[productIndex];
    const size = allSizes[sizeIndex];
    if (product && size) {
      let newQuantity = parseInt(editValue, 10) || 0;
      const availableStock = product.availableSizes[size] || 0;
      const cellKey = getCellKey(product.id, size);
      
      // Check order limit per size (reject if exceeds)
      const limitOrder = getLimitForSize(product, size);
      if (limitOrder != null && newQuantity > limitOrder) {
        triggerOrderLimitAlert(cellKey);
        setEditingCell(null);
        setSelectedRange(null);
        return;
      }
      
      // Check if quantity exceeds available stock (only for non-pre-order products)
      if (!product.isPreOrder && newQuantity > availableStock && availableStock > 0) {
        triggerOverStockAlert(cellKey);
        newQuantity = 0; // Reset to 0 when exceeding stock
      }
      
      if (onQuantityChange) {
        onQuantityChange(product.id, size, newQuantity);
      }
    }
    setEditingCell(null);
    setSelectedRange(null);
  }, [editingCell, editValue, products, allSizes, onQuantityChange, triggerOverStockAlert, triggerOrderLimitAlert]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if ((editingCell || selectedRange) && tableRef.current && !tableRef.current.contains(event.target as Node)) {
        saveAndCloseEdit();
      }
    };

    if (editingCell || selectedRange) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editingCell, selectedRange, saveAndCloseEdit]);

  const getDisplayQuantity = useCallback((productId: string, size: string): number => {
    const cellKey = getCellKey(productId, size);
    if (fillPreview.has(cellKey)) {
      return fillPreview.get(cellKey)!;
    }
    const product = products.find(p => p.id === productId);
    return product?.quantities[size] || 0;
  }, [fillPreview, products]);

  const selectedCells = useMemo(() => {
    if (!selectedRange) return new Set<string>();
    const { start, end } = selectedRange;
    const minRow = Math.min(start.productIndex, end.productIndex);
    const maxRow = Math.max(start.productIndex, end.productIndex);
    const minCol = Math.min(start.sizeIndex, end.sizeIndex);
    const maxCol = Math.max(start.sizeIndex, end.sizeIndex);
    const cells = new Set<string>();
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const product = products[r];
        const size = allSizes[c];
        if (product && size && isSizeAvailable(product, size)) {
          cells.add(getCellKey(product.id, size));
        }
      }
    }
    return cells;
  }, [selectedRange, products, allSizes]);

  const handleCellMouseDown = useCallback((
    productIndex: number,
    sizeIndex: number,
    e: React.MouseEvent
  ) => {
    if (readOnly) return;
    const product = products[productIndex];
    const size = allSizes[sizeIndex];
    if (product && size && !isSizeAvailable(product, size)) return; // Unavailable size - no interaction
    e.preventDefault();
    e.stopPropagation();
    setShowFillPopup(false);

    // Save current edit before switching to a new cell
    if (editingCell) {
      const { productIndex: editProductIndex, sizeIndex: editSizeIndex } = editingCell;
      const product = products[editProductIndex];
      const size = allSizes[editSizeIndex];
      if (product && size) {
        let newQuantity = parseInt(editValue, 10) || 0;
        const availableStock = product.availableSizes[size] || 0;
        const cellKey = getCellKey(product.id, size);
        
        const limitOrder = getLimitForSize(product, size);
        if (limitOrder != null && newQuantity > limitOrder) {
          triggerOrderLimitAlert(cellKey);
          // Don't apply - skip onQuantityChange
        } else {
          if (!product.isPreOrder && newQuantity > availableStock && availableStock > 0) {
            triggerOverStockAlert(cellKey);
            newQuantity = 0;
          }
          if (onQuantityChange) {
            onQuantityChange(product.id, size, newQuantity);
          }
        }
      }
    }

    setIsSelecting(true);
    setSelectedRange({
      start: { productIndex, sizeIndex },
      end: { productIndex, sizeIndex },
    });
    setEditingCell(null);
  }, [readOnly, editingCell, editValue, products, allSizes, onQuantityChange, triggerOverStockAlert, triggerOrderLimitAlert]);

  const handleCellMouseEnter = useCallback((
    productIndex: number,
    sizeIndex: number
  ) => {
    const product = products[productIndex];
    const size = allSizes[sizeIndex];
    const cellKey = getCellKey(product.id, size);
    setHoveredCellKey(cellKey);

    if (product && size && !isSizeAvailable(product, size)) {
      if (isSelecting || isFilling) return; // Don't expand selection/fill into unavailable cells
    }

    if (isSelecting) {
      setSelectedRange(prev => prev ? { ...prev, end: { productIndex, sizeIndex } } : null);
    } else if (isFilling && fillOrigin) {
      const previewMap = new Map<string, number>();
      const originRow = fillOrigin.productIndex;
      const originCol = fillOrigin.sizeIndex;
      const originValue = fillOrigin.value;
      const minRow = Math.min(originRow, productIndex);
      const maxRow = Math.max(originRow, productIndex);
      const minCol = Math.min(originCol, sizeIndex);
      const maxCol = Math.max(originCol, sizeIndex);

      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const product = products[r];
          const size = allSizes[c];
          if (product && size && isSizeAvailable(product, size)) {
            previewMap.set(getCellKey(product.id, size), originValue);
          }
        }
      }

      setFillPreview(previewMap);
    }
  }, [isSelecting, isFilling, fillOrigin, products, allSizes]);

  const handleMouseUp = useCallback(() => {
    if (isRowFilling && rowFillOriginIndex !== null) {
      const sourceProduct = products[rowFillOriginIndex];
      if (sourceProduct) {
        const updates: Array<{ productId: string; size: string; quantity: number }> = [];
        rowFillPreviewIndices.forEach(targetIndex => {
          if (targetIndex === rowFillOriginIndex) return;
          const targetProduct = products[targetIndex];
          if (!targetProduct) return;
          allSizes.forEach(size => {
            if (!isSizeAvailable(targetProduct, size)) return; // Skip unavailable sizes
            const sourceQuantity = sourceProduct.quantities[size] || 0;
            const limitOrder = getLimitForSize(targetProduct, size);
            if (limitOrder != null && sourceQuantity > limitOrder) {
              triggerOrderLimitAlert(getCellKey(targetProduct.id, size));
              return; // Reject - don't apply
            }
            updates.push({ productId: targetProduct.id, size, quantity: sourceQuantity });
          });
        });
        if (onBulkQuantityChange && updates.length > 0) {
          onBulkQuantityChange(updates);
        }
      }
      setIsRowFilling(false);
      setRowFillOriginIndex(null);
      setRowFillPreviewIndices(new Set());
      return;
    }

    if (isFilling) {
      const updates: Array<{ productId: string; size: string; quantity: number }> = [];
      fillPreview.forEach((quantity, cellKey) => {
        const parts = cellKey.split('::');
        if (parts.length >= 2) {
          const size = parts[parts.length - 1];
          const productId = parts.slice(0, -1).join('::');
          const product = products.find(p => p.id === productId);
          if (!product || !isSizeAvailable(product, size)) return;
          const limitOrder = getLimitForSize(product, size);
          if (limitOrder != null && quantity > limitOrder) {
            triggerOrderLimitAlert(cellKey);
            return; // Reject - don't apply
          }
          updates.push({ productId, size, quantity });
        }
      });
      if (onBulkQuantityChange && updates.length > 0) {
        onBulkQuantityChange(updates);
      }
      setIsFilling(false);
      setFillOrigin(null);
      setFillPreview(new Map());
      setSelectedRange(null);
      return;
    }

    if (isSelecting && selectedRange) {
      setIsSelecting(false);
      const { start, end } = selectedRange;

      if (start.productIndex !== end.productIndex || start.sizeIndex !== end.sizeIndex) {
        const endCell = document.querySelector(`[data-testid="cell-${products[end.productIndex].id}-${allSizes[end.sizeIndex]}"]`) as HTMLElement;
        if (endCell && tableRef.current) {
          const tableRect = tableRef.current.getBoundingClientRect();
          const cellRect = endCell.getBoundingClientRect();
          const centerX = cellRect.left - tableRect.left + (cellRect.width / 2);
          const centerY = cellRect.bottom - tableRect.top + 5;

          setFillPopupPosition({ top: centerY, left: centerX + 10 });
          setShowFillPopup(true);

          const firstProduct = products[start.productIndex];
          const firstSize = allSizes[start.sizeIndex];
          if (firstProduct && firstSize) {
            setFillInputValue(getDisplayQuantity(firstProduct.id, firstSize));
          }
        }
      } else {
        const product = products[start.productIndex];
        const size = allSizes[start.sizeIndex];
        if (product && size && isSizeAvailable(product, size)) {
          setEditingCell({ productIndex: start.productIndex, sizeIndex: start.sizeIndex });
          setEditValue(String(getDisplayQuantity(product.id, size)));
        }
      }
    }
  }, [isRowFilling, rowFillOriginIndex, rowFillPreviewIndices, isFilling, isSelecting, fillPreview, onBulkQuantityChange, selectedRange, products, allSizes, getDisplayQuantity, triggerOrderLimitAlert]);

  const handleFillHandleMouseDown = useCallback((
    productIndex: number,
    sizeIndex: number,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const product = products[productIndex];
    const size = allSizes[sizeIndex];
    if (!product || !size) return;
    
    // Prevent fill operations for carton products
    const isCartonProduct = (product.unitsPerCarton ?? 0) > 0;
    if (isCartonProduct) return;

    // Save and close any active edit mode (same as clicking outside)
    saveAndCloseEdit();
    
    const value = getDisplayQuantity(product.id, size);
    setFillOrigin({ productIndex, sizeIndex, value });
    setIsFilling(true);
    setSelectedRange({
      start: { productIndex, sizeIndex },
      end: { productIndex, sizeIndex },
    });
    setShowFillPopup(false);
  }, [products, allSizes, getDisplayQuantity, saveAndCloseEdit]);

  const handleRowFillStart = useCallback((productIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent row fill for carton products
    const product = products[productIndex];
    const isCartonProduct = product && (product.unitsPerCarton ?? 0) > 0;
    if (isCartonProduct) return;
    
    // Save and close any active edit mode (same as clicking outside)
    saveAndCloseEdit();
    
    setIsRowFilling(true);
    setRowFillOriginIndex(productIndex);
    setRowFillPreviewIndices(new Set([productIndex]));
  }, [products, saveAndCloseEdit]);

  const handleRowFillEnter = useCallback((productIndex: number) => {
    if (!isRowFilling || rowFillOriginIndex === null) return;
    const minRow = Math.min(rowFillOriginIndex, productIndex);
    const maxRow = Math.max(rowFillOriginIndex, productIndex);
    const indices = new Set<number>();
    for (let i = minRow; i <= maxRow; i++) {
      indices.add(i);
    }
    setRowFillPreviewIndices(indices);
  }, [isRowFilling, rowFillOriginIndex]);

  const handleEditChange = useCallback((value: string) => {
    if (value === '' || /^\d+$/.test(value)) {
      setEditValue(value);
    }
  }, []);

  const handleEditCommit = useCallback(() => {
    if (!editingCell) return;
    const { productIndex, sizeIndex } = editingCell;
    const product = products[productIndex];
    const size = allSizes[sizeIndex];
    if (product && size) {
      let newQuantity = parseInt(editValue, 10) || 0;
      const availableStock = product.availableSizes[size] || 0;
      const cellKey = getCellKey(product.id, size);
      
      // Check order limit per size (reject if exceeds)
      const limitOrder = getLimitForSize(product, size);
      if (limitOrder != null && newQuantity > limitOrder) {
        triggerOrderLimitAlert(cellKey);
        setEditValue(String(getDisplayQuantity(product.id, size)));
        return;
      }
      
      // Check if quantity exceeds available stock (only for non-pre-order products)
      if (!product.isPreOrder && newQuantity > availableStock && availableStock > 0) {
        triggerOverStockAlert(cellKey);
        newQuantity = 0; // Reset to 0 when exceeding stock
        setEditValue('0');
      }

      if (onQuantityChange) {
        onQuantityChange(product.id, size, newQuantity);
      }
    }
    // Keep the cell in edit mode, but the parent will re-render with the new value
    // The EditableCellInput will sync its value with the new prop
  }, [editingCell, editValue, products, allSizes, onQuantityChange, triggerOverStockAlert, triggerOrderLimitAlert, getDisplayQuantity]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditCommit();
      setEditingCell(null);
      setSelectedRange(null);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setSelectedRange(null);
    }
  }, [handleEditCommit]);

  const handleFillPopupApply = useCallback(() => {
    if (!selectedRange) return;
    const updates: Array<{ productId: string; size: string; quantity: number }> = [];

    selectedCells.forEach((cellKey) => {
      const parts = cellKey.split('::');
      if (parts.length >= 2) {
        const size = parts[parts.length - 1];
        const productId = parts.slice(0, -1).join('::');
        const product = products.find(p => p.id === productId);
        if (!product || !isSizeAvailable(product, size)) return; // Skip unavailable sizes
        const limitOrder = getLimitForSize(product, size);
        if (limitOrder != null && fillInputValue > limitOrder) {
          triggerOrderLimitAlert(cellKey);
          return; // Reject - don't include in updates
        }
        updates.push({ productId, size, quantity: fillInputValue });
      }
    });

    if (onBulkQuantityChange && updates.length > 0) {
      onBulkQuantityChange(updates);
    }
    setShowFillPopup(false);
    setSelectedRange(null);
  }, [fillInputValue, selectedRange, selectedCells, onBulkQuantityChange, products, triggerOrderLimitAlert]);

  const handleCopy = useCallback(async () => {
    if (!selectedRange) return;
    const { start, end } = selectedRange;
    const minRow = Math.min(start.productIndex, end.productIndex);
    const maxRow = Math.max(start.productIndex, end.productIndex);
    const minCol = Math.min(start.sizeIndex, end.sizeIndex);
    const maxCol = Math.max(start.sizeIndex, end.sizeIndex);

    const rows = maxRow - minRow + 1;
    const cols = maxCol - minCol + 1;
    const data: Array<Array<number>> = [];

    for (let r = minRow; r <= maxRow; r++) {
      const row: number[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const product = products[r];
        const size = allSizes[c];
        row.push(getDisplayQuantity(product.id, size));
      }
      data.push(row);
    }

    setCopiedData(data);
    setCopiedShape({ rows, cols });
    await navigator.clipboard.writeText(data.map(row => row.join('\t')).join('\n'));
  }, [selectedRange, products, allSizes, getDisplayQuantity]);

  const handlePaste = useCallback(async () => {
    if (!selectedRange) return;

    let dataToPaste: Array<Array<number>> | null = null;
    let shapeToPaste: { rows: number; cols: number } | null = null;

    if (copiedData && copiedShape) {
      dataToPaste = copiedData;
      shapeToPaste = copiedShape;
    } else {
      try {
        const clipboardText = await navigator.clipboard.readText();
        const rows = clipboardText.split('\n').filter(row => row.trim() !== '');
        if (rows.length === 0) return;

        const parsedData = rows.map(row =>
          row.split('\t').map(cell => {
            const num = Number(cell);
            return isNaN(num) ? 0 : num;
          })
        );

        const cols = parsedData[0]?.length || 0;
        if (cols === 0) return;

        dataToPaste = parsedData;
        shapeToPaste = { rows: parsedData.length, cols };
      } catch (err) {
        console.error('Failed to read clipboard contents for external paste: ', err);
        alert("Could not paste data. Please check clipboard permissions.");
        return;
      }
    }

    if (!dataToPaste || !shapeToPaste) return;

    const { start, end } = selectedRange;
    const targetRows = Math.abs(end.productIndex - start.productIndex) + 1;
    const targetCols = Math.abs(end.sizeIndex - start.sizeIndex) + 1;

    if (shapeToPaste.rows !== targetRows || shapeToPaste.cols !== targetCols) {
      alert("The shape of the data you are trying to paste does not match the shape of the selection.");
      return;
    }

    const minRow = Math.min(start.productIndex, end.productIndex);
    const minCol = Math.min(start.sizeIndex, end.sizeIndex);
    const updates: Array<{ productId: string; size: string; quantity: number }> = [];

    for (let r = 0; r < shapeToPaste.rows; r++) {
      for (let c = 0; c < shapeToPaste.cols; c++) {
        const product = products[minRow + r];
        const size = allSizes[minCol + c];
        if (product && size && !isSizeAvailable(product, size)) continue; // Skip unavailable sizes
        if (product && size) {
          const quantity = dataToPaste[r][c];
          const limitOrder = getLimitForSize(product, size);
          const cellKey = getCellKey(product.id, size);
          if (limitOrder != null && quantity > limitOrder) {
            triggerOrderLimitAlert(cellKey);
          } else {
            updates.push({ productId: product.id, size, quantity });
          }
        }
      }
    }

    if (onBulkQuantityChange && updates.length > 0) {
      onBulkQuantityChange(updates);
    }
    setSelectedRange(null);
  }, [selectedRange, copiedData, copiedShape, products, allSizes, onBulkQuantityChange, triggerOrderLimitAlert]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedRange) {
        e.preventDefault();
        handleCopy();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && selectedRange) {
        e.preventDefault();
        handlePaste();
      }
      if (e.key === 'Escape') {
        setShowFillPopup(false);
        if (!editingCell) {
          setSelectedRange(null);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleCopy, handlePaste, selectedRange, editingCell]);

  const getCellStyles = useCallback((productIndex: number, sizeIndex: number) => {
    const cellKey = getCellKey(products[productIndex].id, allSizes[sizeIndex]);
    const isSelected = selectedCells.has(cellKey);
    const isEditing = editingCell && editingCell.productIndex === productIndex && editingCell.sizeIndex === sizeIndex;
    const isPreviewed = fillPreview.has(cellKey);

    if (isEditing) {
      return { border: '2px solid black', backgroundColor: 'white' };
    }
    if (isPreviewed) {
      return { backgroundColor: 'rgba(34, 197, 94, 0.2)', border: '1px solid rgba(34, 197, 94, 0.5)' };
    }
    if (isSelected) {
      return { backgroundColor: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.8)' };
    }
    return {};
  }, [selectedCells, editingCell, fillPreview, products, allSizes]);

  return (
    <div className="space-y-3 relative" ref={tableRef} onMouseUp={handleMouseUp} onMouseLeave={() => setHoveredCellKey(null)}>
      {showFillPopup && fillPopupPosition && (
        <div className="absolute z-50" style={{ top: `${fillPopupPosition.top}px`, left: `${fillPopupPosition.left}px` }}>
          <PopupCentered
            value={fillInputValue}
            onChange={setFillInputValue}
            onApply={handleFillPopupApply}
            onClose={() => { setShowFillPopup(false); setSelectedRange(null); }}
            onCopy={handleCopy}
            onPaste={handlePaste}
            showCopyButton={true}
            popupRef={popupRef}
          />
        </div>
      )}

      <div className="border border-border overflow-hidden bg-gray-50 dark:bg-gray-900">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800 border-b border-border">
                <th className="w-12 p-2 sticky left-0 z-10 bg-gray-100 dark:bg-gray-800 border-r border-border">
                  <Button size="icon" variant="ghost" onClick={() => handleSelectAll(selectedProducts.size !== products.length)} className="h-7 w-7 mx-auto" data-testid="button-toggle-all-carts" title={selectedProducts.size === products.length ? 'Deselect all' : 'Select all'}>
                    <ShoppingCart className={`w-3.5 h-3.5 ${selectedProducts.size === products.length && products.length > 0 ? 'fill-yellow-500 text-yellow-500' : selectedProducts.size > 0 ? 'fill-yellow-300 text-yellow-300' : 'text-muted-foreground'}`} />
                  </Button>
                </th>
                <th className="text-left p-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-[220px] sticky left-12 z-10 bg-gray-100 dark:bg-gray-800 border-r border-border">ITEM/SKU</th>
                {allSizes.map((size, index) => (
                  <th key={size} className="p-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-16 border-r border-border">
                    <div className="text-center">
                      {getDisplaySize(size)}
                    </div>
                  </th>
                ))}
                <th className="w-16 p-2 sticky right-20 z-10 bg-gray-100 dark:bg-gray-800 border-l border-border text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Total</th>
                <th className="w-20 p-2 sticky right-0 z-10 bg-gray-100 dark:bg-gray-800 border-l border-border text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Total LP</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product, productIndex) => {
                const productQuantity = Object.values(product.quantities).reduce((s, q) => s + q, 0);
                const productPrice = productQuantity * product.price;
                const isHighlighted = highlightedRows.has(product.id);
                const isCartonProduct = (product.unitsPerCarton ?? 0) > 0;
                return (
                  <tr 
                    key={product.id} 
                    className={`border-b border-border hover:bg-gray-100 dark:hover:bg-gray-800 group bg-white dark:bg-gray-950 ${rowFillPreviewIndices.has(productIndex) && productIndex !== rowFillOriginIndex ? 'bg-green-100 dark:bg-green-900/30' : ''} ${isHighlighted ? 'bg-red-100 dark:bg-red-900/30 animate-pulse ring-2 ring-red-500' : ''} ${isCartonProduct ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`} 
                    data-testid={`cart-product-${product.id}`}
                    onMouseEnter={() => !isCartonProduct && handleRowFillEnter(productIndex)}
                  >
                    <td className="p-2 sticky left-0 z-10 bg-white dark:bg-gray-950 group-hover:bg-gray-100 dark:group-hover:bg-gray-800 border-r border-border relative">
                      <Button size="icon" variant="ghost" onClick={() => handleToggleProduct(product.id)} className="h-8 w-8" data-testid={`button-toggle-cart-${product.id}`}>
                        <ShoppingCart className={`w-4 h-4 ${selectedProducts.has(product.id) ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground'}`} />
                      </Button>
                    </td>
                    <td 
                      className="p-2 w-[220px] sticky left-12 z-10 bg-white dark:bg-gray-950 group-hover:bg-gray-100 dark:group-hover:bg-gray-800 border-r border-border cursor-pointer"
                      onClick={async () => {
                        const realProductId = product.id.includes('::') ? product.id.split('::')[0] : product.id;
                        const currentPath = window.location.pathname + window.location.search;
                        try {
                          const res = await fetch(`/api/products/${realProductId}`);
                          if (res.ok) {
                            const fullProduct = await res.json();
                            // Pass product data with fromPage context (same as ShopProductCard)
                            window.history.pushState({ product: fullProduct, fromPage: currentPath }, "", `/product/${realProductId}`);
                            window.dispatchEvent(new PopStateEvent("popstate", { state: { product: fullProduct, fromPage: currentPath } }));
                          }
                        } catch (error) {
                          console.error("Failed to fetch product:", error);
                        }
                      }}
                      data-testid={`link-product-detail-${product.id}`}
                    >
                      <div className="flex items-center gap-2 justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-12 bg-muted rounded overflow-hidden flex-shrink-0">
                            <img src={product.image1} alt={product.name} className="w-full h-full object-contain" />
                          </div>
                          <div className="min-w-[160px]">
                            <p className="text-[11px] text-muted-foreground uppercase font-mono font-semibold">{product.sku}</p>
                            <h4 className="text-xs font-medium leading-tight">{product.name}</h4>
                            <p className="text-[11px] text-muted-foreground">{product.color}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {isCartonProduct && (
                            <div className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 rounded text-[9px] font-medium text-amber-700 dark:text-amber-400" data-testid={`carton-badge-${product.id}`}>
                              📦 Carton
                            </div>
                          )}
                          {/* Row-level +/- buttons for carton products - affects all sizes by their base units */}
                          {!readOnly && isCartonProduct && (
                            <div className="flex items-center gap-0.5 ml-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Decrease by one carton: subtract units per size from each size (from unitsPerSize)
                                  const updates = product.sizes
                                    .filter(size => product.sizes.includes(size))
                                    .map(size => {
                                      const currentQty = getDisplayQuantity(product.id, size);
                                      const baseUnits = product.unitsPerSize?.[size] ?? 1;
                                      return { productId: product.id, size, quantity: Math.max(0, currentQty - baseUnits) };
                                    });
                                  if (onBulkQuantityChange) {
                                    onBulkQuantityChange(updates);
                                  } else {
                                    updates.forEach(u => onQuantityChange?.(u.productId, u.size, u.quantity));
                                  }
                                }}
                                className="w-6 h-6 flex items-center justify-center rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"
                                data-testid={`carton-row-minus-${product.id}`}
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Carton limit: limitOrder applies to total items - block if adding would exceed
                                  const limitOrder = product.limitOrder;
                                  const unitsPerCarton = product.unitsPerCarton || 1;
                                  if (limitOrder != null && limitOrder >= 1 && productQuantity + unitsPerCarton > limitOrder) {
                                    const firstSize = product.sizes[0];
                                    if (firstSize) triggerOrderLimitAlert(getCellKey(product.id, firstSize));
                                    return;
                                  }
                                  // Add one carton: add units per size to each size (from unitsPerSize)
                                  const updates = product.sizes
                                    .filter(size => product.sizes.includes(size))
                                    .map(size => {
                                      const currentQty = getDisplayQuantity(product.id, size);
                                      const baseUnits = product.unitsPerSize?.[size] ?? 1;
                                      return { productId: product.id, size, quantity: currentQty + baseUnits };
                                    });
                                  if (onBulkQuantityChange) {
                                    onBulkQuantityChange(updates);
                                  } else {
                                    updates.forEach(u => onQuantityChange?.(u.productId, u.size, u.quantity));
                                  }
                                }}
                                className="w-6 h-6 flex items-center justify-center rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"
                                data-testid={`carton-row-plus-${product.id}`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          {!readOnly && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setProductToDelete({ id: product.id, name: product.name });
                              }} 
                              className="h-8 w-8 hover:bg-primary hover:text-red-600 dark:hover:text-red-500 transition-colors" 
                              data-testid={`button-delete-${product.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </td>
                    {allSizes.map((size, sizeIndex) => {
                      const stock = product.availableSizes[size] || 0;
                      const quantity = getDisplayQuantity(product.id, size);
                      const cellKey = getCellKey(product.id, size);
                      const isSizeUnavailable = !isCartonProduct && !isSizeAvailable(product, size);
                      const isEditing = !isCartonProduct && !isSizeUnavailable && editingCell && editingCell.productIndex === productIndex && editingCell.sizeIndex === sizeIndex;
                      const isOverStockAlert = overStockAlertCells.has(cellKey);
                      const isOrderLimitAlert = orderLimitAlertCells.has(cellKey);
                      const isHovered = hoveredCellKey === cellKey;
                      const limitForSize = getLimitForSize(product, size);
                      const hasOrderLimit = limitForSize != null;

                      // Unavailable size cell - darker background, tooltip, no interaction
                      if (isSizeUnavailable) {
                        return (
                          <TooltipProvider key={size}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <td
                                  className="p-1 text-center relative select-none border-r border-border bg-gray-300 dark:bg-gray-700 cursor-not-allowed"
                                  data-testid={`cell-${product.id}-${size}`}
                                >
                                  <div className="h-7 w-14 text-center text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center">
                                    -
                                  </div>
                                </td>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>This size is not available</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      }

                      // For carton products, show total units per size (= units per carton * carton count) + limit order
                      if (isCartonProduct) {
                        const hasSize = product.sizes.includes(size);
                        const unitsPerSizeInCarton = product.unitsPerSize?.[size] || 0;
                        const cartonCount = Math.ceil(productQuantity / (product.unitsPerCarton || 1));
                        const totalUnitsForSize = unitsPerSizeInCarton * cartonCount;
                        return (
                          <td
                            key={size}
                            className={`p-1 text-center relative select-none border-r border-border ${hasSize ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-gray-100 dark:bg-gray-800'}`}
                            data-testid={`cell-${product.id}-${size}`}
                          >
                            {hasSize ? (
                              <div className="flex flex-col items-center justify-center h-full">
                                {hasOrderLimit && <div className="text-[8px] text-red-600 dark:text-red-400 leading-none mb-0.5 pointer-events-none" style={{ background: 'transparent' }}>limit order : {limitForSize}</div>}
                                <div className="h-7 w-14 text-center text-xs font-semibold flex items-center justify-center">
                                  {totalUnitsForSize || '-'}
                                </div>
                              </div>
                            ) : (
                              <div className="h-7 w-14 text-center text-xs text-gray-400 flex items-center justify-center">
                                -
                              </div>
                            )}
                          </td>
                        );
                      }

                      // Regular product cells with editable behavior
                      return (
                        <td
                          key={size}
                          className={`p-1 text-center relative select-none border-r border-border transition-colors duration-300 ${isOverStockAlert ? 'bg-red-500/30' : ''} ${isOrderLimitAlert ? 'bg-red-500/30 animate-pulse' : ''}`}
                          style={getCellStyles(productIndex, sizeIndex)}
                          data-testid={`cell-${product.id}-${size}`}
                          onMouseDown={(e) => handleCellMouseDown(productIndex, sizeIndex, e)}
                          onMouseEnter={() => handleCellMouseEnter(productIndex, sizeIndex)}
                          onMouseLeave={() => setHoveredCellKey(null)}
                        >
                          <div className="flex flex-col items-center justify-center h-full">
                            {hasOrderLimit && <div className="text-[8px] text-red-600 dark:text-red-400 leading-none mb-0.5 pointer-events-none" style={{ background: 'transparent' }}>limit order : {limitForSize}</div>}
                            {!product.isPreOrder && stock > 0 && <div className="text-[9px] text-red-600 dark:text-red-400 font-semibold leading-none mb-0.5 pointer-events-none">{stock}</div>}
                            {isEditing ? (
                              <EditableCellInput
                                value={editValue}
                                onChange={(e) => handleEditChange(e.target.value)}
                                onBlur={handleEditCommit}
                                onKeyDown={handleEditKeyDown}
                              />
                            ) : (
                              <div className="h-7 w-14 text-center text-xs font-semibold flex items-center justify-center">
                                {quantity || ''}
                              </div>
                            )}
                          </div>
                          {!isEditing && isHovered && (
                            <div
                              className="absolute bottom-0 right-0 w-2 h-2 bg-blue-500 cursor-move z-30"
                              onMouseDown={(e) => handleFillHandleMouseDown(productIndex, sizeIndex, e)}
                              title="Drag to fill"
                            />
                          )}
                          {sizeIndex === 0 && (
                            <div
                              className="absolute top-0 left-0 w-3 h-3 bg-green-500 cursor-grab active:cursor-grabbing z-20 opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}
                              onMouseDown={(e) => handleRowFillStart(productIndex, e)}
                              title="Drag to copy row values"
                              data-testid={`drag-handle-${product.id}`}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="p-2 text-center sticky right-20 z-10 bg-white dark:bg-gray-950 group-hover:bg-gray-100 dark:group-hover:bg-gray-800 border-l border-border">
                      <div data-testid={`total-qty-${product.id}`}>
                        {isCartonProduct ? (
                          (() => {
                            const cartonCount = Math.ceil(productQuantity / (product.unitsPerCarton || 1));
                            const totalUnits = cartonCount * (product.unitsPerCarton || 1);
                            return (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{totalUnits}</span>
                                <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 rounded-md">
                                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">{cartonCount} {cartonCount === 1 ? 'carton' : 'cartons'}</span>
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <span className="text-xs font-semibold">{productQuantity}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-center sticky right-0 z-10 bg-white dark:bg-gray-950 group-hover:bg-gray-100 dark:group-hover:bg-gray-800 border-l border-border">
                      <span className="text-xs font-semibold" data-testid={`total-lp-${product.id}`}>{getCurrencySymbol(userCurrency)}{productPrice.toFixed(2)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <AlertDialog open={!!productToDelete} onOpenChange={(open) => !open && setProductToDelete(null)}>
        <AlertDialogContent data-testid="dialog-delete-confirmation">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this item? {productToDelete && <span className="block mt-2 font-semibold text-foreground">{productToDelete.name}</span>}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (productToDelete) { onRemoveProduct?.(productToDelete.id); setProductToDelete(null); } }} className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:text-red-800" data-testid="button-confirm-delete">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedProducts(new Set(products.map((p) => p.id)));
      products.forEach((p) => onToggleSelect?.(p.id, true));
    } else {
      setSelectedProducts(new Set());
      products.forEach((p) => onToggleSelect?.(p.id, false));
    }
  }

  function handleToggleProduct(productId: string) {
    const newSelected = new Set(selectedProducts);
    const isCurrentlySelected = selectedProducts.has(productId);
    if (isCurrentlySelected) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
    onToggleSelect?.(productId, !isCurrentlySelected);
  }
}