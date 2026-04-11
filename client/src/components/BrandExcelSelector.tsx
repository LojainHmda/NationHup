import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search, Copy, ClipboardPaste, Download, Upload, Trash2, RotateCcw, Plus, Minus, Keyboard, Package, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Product, InsertCartItem } from "@shared/schema";
import { OrderDesigner } from "./OrderDesigner";
import { PhotoCarousel } from "./PhotoCarousel";
import { PreCartMatrix } from "./PreCartMatrix";

import type { FilterState } from "@/lib/types";

interface BrandExcelSelectorProps {
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: any) => void;
  onToggleArrayFilter: (key: 'categories' | 'brands' | 'sizes' | 'colors' | 'models', value: string) => void;
  onRemoveFilter: (key: keyof FilterState, value?: string) => void;
  activeFilters: { key: keyof FilterState; value: string; label: string }[];
  onAddToBucket: (item: { productId: string; productName: string; productSku: string; brand: string; color: string; size: string; quantity: number; price: string; }) => void;
  bucketItems: Array<{ productId: string; productName: string; productSku: string; brand: string; color: string; size: string; quantity: number; price: string; }>;
  updateBucketQuantity: (productId: string, color: string, size: string, quantity: number) => void;
  removeFromBucket: (productId: string, color: string, size: string) => void;
  moveToCart: () => void;
}

// Cell coordinate system for Excel-like functionality
interface CellCoordinate {
  row: number;
  col: number;
}

interface CellRange {
  start: CellCoordinate;
  end: CellCoordinate;
}

interface CellData {
  value: string | number;
  isEditable: boolean;
  dataType: 'text' | 'number' | 'readonly';
}

// Column definitions for the spreadsheet
interface ColumnDef {
  key: string;
  header: string;
  width?: string;
  editable?: boolean;
  dataType?: 'text' | 'number' | 'readonly';
}

interface ExcelRow {
  id: string;
  productId: string;
  category: string;
  styleCode: string;
  alias: string;
  barcode: string;
  name: string;
  brand: string;
  color: string;
  usSize: string;
  euSize: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  division: string;
  gender: string;
  costPrice: number;
  rrp: number;
  stock: number;
  isSelected: boolean;
  imageUrl: string;
}

export function BrandExcelSelector({ 
  filters,
  onFilterChange,
  onToggleArrayFilter,
  onRemoveFilter,
  activeFilters,
  onAddToBucket,
  bucketItems,
  updateBucketQuantity,
  removeFromBucket,
  moveToCart
}: BrandExcelSelectorProps) {
  
  // Helper function to format gender display
  const formatGender = (gender: string): string => {
    switch (gender.toLowerCase()) {
      case 'men': return 'Men';
      case 'women': return 'Women'; 
      case 'kids': return 'Kids';
      case 'unisex': return 'Unisex';
      default: return gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
    }
  };
  // Excel-like cell selection state
  const [activeCell, setActiveCell] = useState<CellCoordinate | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set()); // "row,col" format
  const [selectedRanges, setSelectedRanges] = useState<CellRange[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<CellCoordinate | null>(null);
  
  // Editing state
  const [editingCell, setEditingCell] = useState<CellCoordinate | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  
  // Copy/paste state
  const [copiedRange, setCopiedRange] = useState<CellRange | null>(null);
  const [copiedData, setCopiedData] = useState<Map<string, any>>(new Map());
  
  // Legacy states for compatibility
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [copiedRows, setCopiedRows] = useState<ExcelRow[]>([]);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
  // Order Designer state
  const [showOrderDesigner, setShowOrderDesigner] = useState<boolean>(false);
  
  // PreCart Matrix state
  const [showPreCartMatrix, setShowPreCartMatrix] = useState<boolean>(false);
  
  // Product detail modal state
  const [selectedProductDetail, setSelectedProductDetail] = useState<Product | null>(null);
  
  const tableRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Build query parameters for all filters to get focused product list
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.categories.length > 0) params.set('category', filters.categories.join(','));
    if (filters.brands.length > 0) params.set('brand', filters.brands.join(','));
    if (filters.collections && filters.collections.length > 0) params.set('collections', filters.collections.join(','));
    if (filters.models && filters.models.length > 0) params.set('models', filters.models.join(','));
    if (filters.minPrice) params.set('minPrice', filters.minPrice.toString());
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice.toString());
    if (filters.sizes && filters.sizes.length > 0) params.set('sizes', filters.sizes.join(','));
    if (filters.colors && filters.colors.length > 0) params.set('colors', filters.colors.join(','));
    if (filters.search) params.set('search', filters.search);
    if (filters.styles && filters.styles.length > 0) params.set('styles', filters.styles.join(','));
    if (filters.ageRanges && filters.ageRanges.length > 0) params.set('ageRanges', filters.ageRanges.join(','));
    if (filters.occasions && filters.occasions.length > 0) params.set('occasions', filters.occasions.join(','));
    if (filters.genders && filters.genders.length > 0) params.set('genders', filters.genders.join(','));
    if (filters.supplierLocations && filters.supplierLocations.length > 0) params.set('supplierLocations', filters.supplierLocations.join(','));
    return params;
  }, [filters]);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", queryParams.toString()],
  });


  // Store quantities separately to avoid infinite loops
  const [quantityMap, setQuantityMap] = useState<Map<string, number>>(new Map());

  // Excel data from filtered products - ONE ROW PER PRODUCT (no color/size expansion)
  const excelRows = useMemo(() => {
    const rows: ExcelRow[] = [];
    
    products.forEach(product => {
      // Create ONE row per product (brand + model name)
      // Color and size will be selected later in PreCartMatrix
      const unitPrice = parseFloat(product.wholesalePrice);
      const totalStock = product.availableSizes.reduce((sum, { stock }) => sum + stock, 0);
      
      rows.push({
        id: product.id,
        productId: product.id,
        category: product.category,
        styleCode: product.sku,
        alias: product.sku,
        barcode: `194880${Math.random().toString().slice(2,8)}`,
        name: product.name,
        brand: product.brand,
        color: '', // Not shown - selected later
        usSize: '', // Not shown - selected later
        euSize: '',
        quantity: 0,
        unitPrice,
        totalPrice: 0,
        division: "FTW",
        gender: formatGender(product.gender),
        costPrice: unitPrice * 2.2,
        rrp: unitPrice * 2.35,
        stock: totalStock, // Total stock across all sizes/colors
        isSelected: false,
        imageUrl: product.image1
      });
    });
    
    return rows;
  }, [products]);
  
  // Create excelData using useMemo to avoid infinite loops
  const excelData = useMemo(() => {
    return excelRows.map(row => ({
      ...row,
      quantity: quantityMap.get(row.id) || 0,
      totalPrice: (quantityMap.get(row.id) || 0) * row.unitPrice,
      isSelected: (quantityMap.get(row.id) || 0) > 0
    }));
  }, [excelRows, quantityMap]);
  
  // Combine excel data with bucket items for Excel operations
  const combinedData = useMemo(() => {
    const bucketAsExcelRows: ExcelRow[] = bucketItems.map(item => ({
      id: `${item.productId}-${item.color}-${item.size}`,
      productId: item.productId,
      category: '',
      styleCode: item.productSku,
      alias: item.productSku,
      barcode: '',
      name: item.productName,
      brand: item.brand,
      color: item.color,
      usSize: item.size,
      euSize: '',
      quantity: item.quantity,
      unitPrice: parseFloat(item.price),
      totalPrice: parseFloat(item.price) * item.quantity,
      division: '',
      gender: '',
      costPrice: 0,
      rrp: 0,
      stock: 0,
      isSelected: true,
      imageUrl: ''
    }));
    return [...excelData, ...bucketAsExcelRows];
  }, [excelData, bucketItems]);
  
  // Column definitions for Excel-like spreadsheet with editable columns
  // Note: Color and Size are NOT shown here - they'll be selected in PreCartMatrix
  const columns: ColumnDef[] = [
    { key: 'productPhoto', header: 'Photo', width: 'w-48', dataType: 'readonly' },
    { key: 'styleCode', header: 'Model #', width: 'w-36', dataType: 'readonly' },
    { key: 'brand', header: 'Brand', width: 'w-32', dataType: 'readonly' },
    { key: 'name', header: 'Model Name', width: 'w-64', dataType: 'readonly' }
  ];
  
  // Helper function defined early for use in memos
  const getCellKeyUtil = (row: number, col: number): string => `${row},${col}`;
  
  // Get selected product IDs from selected rows (using row checkboxes) OR selected cells (highlighting)
  const selectedProductIds = useMemo(() => {
    const productIds = new Set<string>();
    
    // Add from checkbox selection
    excelData.forEach((row) => {
      if (selectedRows.has(row.id)) {
        productIds.add(row.productId);
      }
    });
    
    // Add from cell highlighting - extract unique row indices from selected cells
    if (selectedCells.size > 0) {
      const selectedRowIndices = new Set<number>();
      selectedCells.forEach(cellKey => {
        const [rowStr] = cellKey.split(',');
        selectedRowIndices.add(parseInt(rowStr));
      });
      
      selectedRowIndices.forEach(rowIndex => {
        if (rowIndex >= 0 && rowIndex < excelData.length) {
          productIds.add(excelData[rowIndex].productId);
        }
      });
    }
    
    return Array.from(productIds);
  }, [excelData, selectedRows, selectedCells]);
  
  // Handle "Next" button to go to precart matrix
  const handleNextToMatrix = () => {
    if (selectedProductIds.length === 0) {
      toast({
        title: "No Products Selected",
        description: "Please select at least one product row to continue",
        variant: "destructive"
      });
      return;
    }
    
    setShowPreCartMatrix(true);
  };
  
  // Handle add to cart from precart matrix
  const handleAddToCartFromMatrix = (productId: string, productName: string, items: { color: string; size: string; quantity: number }[]) => {
    const cartItem = {
      productId,
      batchName: productName,
      selections: items,
      sessionId: "anonymous"
    };
    
    apiRequest("/api/cart", "POST", cartItem).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Added to Cart",
        description: `${items.reduce((sum, item) => sum + item.quantity, 0)} items added to cart`,
      });
      setShowPreCartMatrix(false);
      setSelectedRows(new Set()); // Clear row selection
      setSelectedCells(new Set()); // Clear cell selection
      // Navigate to Order Builder
      setLocation('/order-builder');
    }).catch(() => {
      toast({
        title: "Error",
        description: "Failed to add items to cart",
        variant: "destructive"
      });
    });
  };
  
  // Helper functions for cell coordinates
  const getCellKey = (row: number, col: number): string => `${row},${col}`;
  const parseCellKey = (key: string): CellCoordinate => {
    const [row, col] = key.split(',').map(Number);
    return { row, col };
  };
  
  const isCellInRange = (cell: CellCoordinate, range: CellRange): boolean => {
    return cell.row >= range.start.row && cell.row <= range.end.row &&
           cell.col >= range.start.col && cell.col <= range.end.col;
  };
  
  const normalizeRange = (start: CellCoordinate, end: CellCoordinate): CellRange => {
    return {
      start: {
        row: Math.min(start.row, end.row),
        col: Math.min(start.col, end.col)
      },
      end: {
        row: Math.max(start.row, end.row),
        col: Math.max(start.col, end.col)
      }
    };
  };
  
  // Cell selection functions
  const selectCell = useCallback((row: number, col: number, extend: boolean = false, multi: boolean = false) => {
    const cellKey = getCellKey(row, col);
    
    if (extend && activeCell) {
      // Extend selection from active cell to this cell
      const range = normalizeRange(activeCell, { row, col });
      setSelectedRanges([range]);
      
      // Update selected cells set
      const newSelectedCells = new Set<string>();
      for (let r = range.start.row; r <= range.end.row; r++) {
        for (let c = range.start.col; c <= range.end.col; c++) {
          newSelectedCells.add(getCellKey(r, c));
        }
      }
      setSelectedCells(newSelectedCells);
    } else if (multi) {
      // Multi-select: toggle this cell
      setSelectedCells(prev => {
        const newSet = new Set(prev);
        if (newSet.has(cellKey)) {
          newSet.delete(cellKey);
        } else {
          newSet.add(cellKey);
        }
        return newSet;
      });
    } else {
      // Single select: clear others and select this cell
      setSelectedCells(new Set([cellKey]));
      setSelectedRanges([]);
    }
    
    setActiveCell({ row, col });
  }, [activeCell]);
  
  const clearCellSelection = useCallback(() => {
    setSelectedCells(new Set());
    setSelectedRanges([]);
    setActiveCell(null);
  }, []);
  
  const getCellValue = useCallback((rowData: ExcelRow, columnKey: string): any => {
    return (rowData as any)[columnKey];
  }, []);
  
  const setCellValue = useCallback((rowId: string, columnKey: string, value: any) => {
    if (columnKey === 'quantity') {
      const row = excelRows.find(r => r.id === rowId);
      if (row) {
        const newQuantity = Math.max(0, Math.min(value, row.stock));
        setQuantityMap(prev => new Map(prev.set(rowId, newQuantity)));
      }
    }
    // Note: Other column edits (like unitPrice) are not supported in this simplified version
  }, [excelRows]);
  
  // Data definitions moved - removing duplicates
  
  // Mouse event handlers for Excel-like behavior
  const handleCellClick = useCallback((e: React.MouseEvent, rowIndex: number, colIndex: number) => {
    e.preventDefault();
    const extend = e.shiftKey;
    const multi = e.ctrlKey || e.metaKey;
    selectCell(rowIndex, colIndex, extend, multi);
  }, [selectCell]);
  
  const handleCellDoubleClick = useCallback((e: React.MouseEvent, rowIndex: number, colIndex: number) => {
    const column = columns[colIndex];
    if (column?.editable) {
      setEditingCell({ row: rowIndex, col: colIndex });
      const rowData = combinedData[rowIndex];
      const currentValue = getCellValue(rowData, column.key);
      setEditValue(String(currentValue || ''));
    }
  }, [columns, excelData, getCellValue]);
  
  const handleCellMouseDown = useCallback((e: React.MouseEvent, rowIndex: number, colIndex: number) => {
    if (e.button === 0) { // Left mouse button
      setIsSelecting(true);
      setSelectionStart({ row: rowIndex, col: colIndex });
    }
  }, []);
  
  const handleCellMouseEnter = useCallback((e: React.MouseEvent, rowIndex: number, colIndex: number) => {
    if (isSelecting && selectionStart) {
      const range = normalizeRange(selectionStart, { row: rowIndex, col: colIndex });
      setSelectedRanges([range]);
      
      // Update selected cells set
      const newSelectedCells = new Set<string>();
      for (let r = range.start.row; r <= range.end.row; r++) {
        for (let c = range.start.col; c <= range.end.col; c++) {
          newSelectedCells.add(getCellKey(r, c));
        }
      }
      setSelectedCells(newSelectedCells);
    }
  }, [isSelecting, selectionStart, normalizeRange, getCellKey]);
  
  const handleMouseUp = useCallback(() => {
    setIsSelecting(false);
    setSelectionStart(null);
  }, []);
  
  // Keyboard navigation
  const moveActiveCell = useCallback((direction: 'up' | 'down' | 'left' | 'right' | 'tab' | 'shift-tab' | 'enter') => {
    if (!activeCell || excelData.length === 0) return;
    
    const maxRow = excelData.length - 1;
    const maxCol = columns.length - 1;
    let newRow = activeCell.row;
    let newCol = activeCell.col;
    
    switch (direction) {
      case 'up':
        newRow = Math.max(0, activeCell.row - 1);
        break;
      case 'down':
        newRow = Math.min(maxRow, activeCell.row + 1);
        break;
      case 'left':
        newCol = Math.max(0, activeCell.col - 1);
        break;
      case 'right':
        newCol = Math.min(maxCol, activeCell.col + 1);
        break;
      case 'tab':
        newCol = activeCell.col + 1;
        if (newCol > maxCol) {
          newCol = 0;
          newRow = Math.min(maxRow, activeCell.row + 1);
        }
        break;
      case 'shift-tab':
        newCol = activeCell.col - 1;
        if (newCol < 0) {
          newCol = maxCol;
          newRow = Math.max(0, activeCell.row - 1);
        }
        break;
      case 'enter':
        newRow = Math.min(maxRow, activeCell.row + 1);
        break;
    }
    
    selectCell(newRow, newCol);
    
    // Scroll cell into view
    const cellKey = getCellKey(newRow, newCol);
    const cellElement = cellRefs.current.get(cellKey);
    if (cellElement) {
      cellElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeCell, selectCell, getCellKey]); // Removed excelData.length to prevent infinite loop

  // Data already moved above
  
  // Focus management for keyboard navigation
  useEffect(() => {
    if (activeCell && tableRef.current) {
      tableRef.current.focus();
    }
  }, [activeCell]);


  // Define all functions with useCallback
  const updateQuantity = useCallback((rowId: string, quantity: number) => {
    const row = excelRows.find(r => r.id === rowId);
    if (row) {
      const newQuantity = Math.max(0, Math.min(quantity, row.stock));
      setQuantityMap(prev => new Map(prev.set(rowId, newQuantity)));
    }
  }, [excelRows]);

  const copyRowsToClipboard = useCallback(async () => {
    const selected = excelData.filter(row => selectedRows.has(row.id));
    if (selected.length === 0) {
      toast({
        title: "Nothing to Copy",
        description: "Please select rows to copy first",
        variant: "destructive"
      });
      return;
    }

    // Store the actual row data for internal paste
    setCopiedRows(selected);

    // Create CSV format for external clipboard (Excel compatibility)
    const headers = ['SKU', 'Product', 'Brand', 'Color', 'Size', 'Price', 'Stock', 'Quantity', 'Subtotal'];
    const csvData = [
      headers.join('\t'),
      ...selected.map(row => [
        row.styleCode,
        row.name,
        row.brand,
        row.color,
        row.usSize,
        row.unitPrice.toFixed(2),
        row.stock,
        row.quantity,
        row.totalPrice.toFixed(2)
      ].join('\t'))
    ].join('\n');

    try {
      await navigator.clipboard.writeText(csvData);
      toast({
        title: "Copied to Clipboard",
        description: `Copied ${selected.length} rows in Excel format`,
      });
    } catch (err) {
      toast({
        title: "Copied",
        description: `Copied ${selected.length} rows to internal clipboard`,
      });
    }
  }, [excelData, selectedRows, toast]);

  const pasteRows = useCallback(() => {
    if (copiedRows.length === 0) {
      toast({
        title: "Nothing to Paste",
        description: "Please copy rows first using Ctrl+C",
        variant: "destructive"
      });
      return;
    }
    
    // Update quantities using the new pattern
    copiedRows.forEach((copiedRow: ExcelRow) => {
      const existingRow = excelRows.find(row => 
        row.productId === copiedRow.productId && 
        row.color === copiedRow.color && 
        row.usSize === copiedRow.usSize
      );
      
      if (existingRow) {
        const quantityToPaste = Math.min(copiedRow.quantity, existingRow.stock);
        setQuantityMap(prev => new Map(prev.set(existingRow.id, quantityToPaste)));
      }
    });
    
    toast({
      title: "Pasted Successfully",
      description: `Pasted quantities from ${copiedRows.length} rows`,
    });
  }, [copiedRows, toast]);

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      // Handle editing mode
      if (editingCell) {
        if (e.key === 'Escape') {
          setEditingCell(null);
          setEditValue('');
        } else if (e.key === 'Enter') {
          // Save the edit
          const column = columns[editingCell.col];
          const rowData = combinedData[editingCell.row];
          if (column && rowData) {
            const value = column.dataType === 'number' ? parseFloat(editValue) || 0 : editValue;
            setCellValue(rowData.id, column.key, value);
          }
          setEditingCell(null);
          setEditValue('');
          moveActiveCell('enter');
        }
        return;
      }
      
      // Navigation keys
      if (activeCell) {
        switch (e.key) {
          case 'ArrowUp':
            e.preventDefault();
            moveActiveCell('up');
            break;
          case 'ArrowDown':
            e.preventDefault();
            moveActiveCell('down');
            break;
          case 'ArrowLeft':
            e.preventDefault();
            moveActiveCell('left');
            break;
          case 'ArrowRight':
            e.preventDefault();
            moveActiveCell('right');
            break;
          case 'Tab':
            e.preventDefault();
            moveActiveCell(e.shiftKey ? 'shift-tab' : 'tab');
            break;
          case 'Enter':
            e.preventDefault();
            moveActiveCell('enter');
            break;
          case 'F2':
            e.preventDefault();
            if (activeCell) {
              const column = columns[activeCell.col];
              if (column?.editable) {
                setEditingCell(activeCell);
                const rowData = combinedData[activeCell.row];
                const currentValue = getCellValue(rowData, column.key);
                setEditValue(String(currentValue || ''));
              }
            }
            break;
        }
      }
      
      // Copy/paste shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'c':
            if (selectedCells.size > 0) {
              e.preventDefault();
              copyCellsToClipboard();
            }
            break;
          case 'v':
            e.preventDefault();
            pasteCells();
            break;
          case 'a':
            e.preventDefault();
            // Select all cells
            const allCells = new Set<string>();
            for (let r = 0; r < excelData.length; r++) {
              for (let c = 0; c < columns.length; c++) {
                allCells.add(getCellKey(r, c));
              }
            }
            setSelectedCells(allCells);
            break;
        }
      }
      
      // Delete key
      if (e.key === 'Delete' && selectedCells.size > 0) {
        e.preventDefault();
        // Clear selected cells
        selectedCells.forEach(cellKey => {
          const { row, col } = parseCellKey(cellKey);
          const column = columns[col];
          const rowData = combinedData[row];
          if (column?.editable && rowData) {
            const value = column.dataType === 'number' ? 0 : '';
            setCellValue(rowData.id, column.key, value);
          }
        });
      }
    };
    
    const handleMouseUp = () => {
      setIsSelecting(false);
      setSelectionStart(null);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [editingCell, editValue, activeCell, selectedCells, copiedData, excelData, columns, moveActiveCell, setCellValue, getCellValue, parseCellKey, getCellKey]);
  
  // Enhanced copy/paste functionality for cells
  const copyCellsToClipboard = useCallback(async () => {
    if (selectedCells.size === 0) {
      toast({
        title: "Nothing to Copy",
        description: "Please select cells to copy first",
        variant: "destructive"
      });
      return;
    }
    
    // Build a map of copied cell data
    const copyMap = new Map<string, any>();
    const copyRange = { minRow: Infinity, maxRow: -1, minCol: Infinity, maxCol: -1 };
    
    selectedCells.forEach(cellKey => {
      const { row, col } = parseCellKey(cellKey);
      const column = columns[col];
      const rowData = combinedData[row];
      
      if (column && rowData) {
        const value = getCellValue(rowData, column.key);
        copyMap.set(cellKey, { value, columnKey: column.key, dataType: column.dataType });
        
        // Track the range for pasting
        copyRange.minRow = Math.min(copyRange.minRow, row);
        copyRange.maxRow = Math.max(copyRange.maxRow, row);
        copyRange.minCol = Math.min(copyRange.minCol, col);
        copyRange.maxCol = Math.max(copyRange.maxCol, col);
      }
    });
    
    setCopiedData(copyMap);
    setCopiedRange({
      start: { row: copyRange.minRow, col: copyRange.minCol },
      end: { row: copyRange.maxRow, col: copyRange.maxCol }
    });
    
    // Create CSV format for external clipboard (Excel compatibility)
    const rows: string[][] = [];
    for (let r = copyRange.minRow; r <= copyRange.maxRow; r++) {
      const row: string[] = [];
      for (let c = copyRange.minCol; c <= copyRange.maxCol; c++) {
        const cellKey = getCellKey(r, c);
        const cellData = copyMap.get(cellKey);
        if (cellData) {
          const value = cellData.dataType === 'number' && typeof cellData.value === 'number'
            ? cellData.value.toString()
            : String(cellData.value || '');
          row.push(value);
        } else {
          row.push('');
        }
      }
      rows.push(row);
    }
    
    const csvData = rows.map(row => row.join('\t')).join('\n');
    
    try {
      await navigator.clipboard.writeText(csvData);
      toast({
        title: "Copied to Clipboard",
        description: `Copied ${selectedCells.size} cells in Excel format`,
      });
    } catch (err) {
      toast({
        title: "Copied",
        description: `Copied ${selectedCells.size} cells to internal clipboard`,
      });
    }
  }, [selectedCells, parseCellKey, columns, excelData, getCellValue, getCellKey, toast]);
  
  const pasteCells = useCallback(async () => {
    if (!activeCell) {
      toast({
        title: "No Active Cell",
        description: "Please select a cell to paste into",
        variant: "destructive"
      });
      return;
    }

    // Try external clipboard first (for Excel compatibility)
    let externalData: string | null = null;
    try {
      externalData = await navigator.clipboard.readText();
    } catch (err) {
      // Clipboard read failed, will fall back to internal data
    }

    // Parse external clipboard data if available
    if (externalData && externalData.trim()) {
      const rows = externalData.trim().split('\n');
      const pasteData: any[][] = [];
      
      for (const rowText of rows) {
        const cells = rowText.split('\t');
        pasteData.push(cells);
      }
      
      if (pasteData.length > 0) {
        return await pasteExternalData(pasteData);
      }
    }

    // Fall back to internal clipboard data
    if (copiedData.size === 0) {
      toast({
        title: "Nothing to Paste",
        description: "Please copy cells first using Ctrl+C",
        variant: "destructive"
      });
      return;
    }
    
    if (!copiedRange) return;
    
    const pasteStartRow = activeCell.row;
    const pasteStartCol = activeCell.col;
    const copyWidth = copiedRange.end.col - copiedRange.start.col + 1;
    const copyHeight = copiedRange.end.row - copiedRange.start.row + 1;
    
    let pastedCount = 0;
    
    // Paste the copied range starting from the active cell
    for (let r = 0; r < copyHeight; r++) {
      for (let c = 0; c < copyWidth; c++) {
        const sourceRow = copiedRange.start.row + r;
        const sourceCol = copiedRange.start.col + c;
        const targetRow = pasteStartRow + r;
        const targetCol = pasteStartCol + c;
        
        // Check bounds
        if (targetRow >= excelData.length || targetCol >= columns.length) continue;
        
        const sourceCellKey = getCellKey(sourceRow, sourceCol);
        const copiedCellData = copiedData.get(sourceCellKey);
        
        if (copiedCellData) {
          const targetColumn = columns[targetCol];
          const targetRowData = combinedData[targetRow];
          
          // Only paste to editable cells of the same data type
          if (targetColumn?.editable && targetRowData) {
            let pasteValue = copiedCellData.value;
            
            // Enforce stock limits for quantity field
            if (targetColumn.key === 'quantity' && targetColumn.dataType === 'number') {
              pasteValue = Math.max(0, Math.min(pasteValue, targetRowData.stock));
            }
            
            setCellValue(targetRowData.id, targetColumn.key, pasteValue);
            pastedCount++;
          }
        }
      }
    }
    
    if (pastedCount > 0) {
      toast({
        title: "Pasted Successfully",
        description: `Pasted values to ${pastedCount} cells`,
      });
      
      // Select the pasted range
      const newSelection = new Set<string>();
      for (let r = 0; r < copyHeight; r++) {
        for (let c = 0; c < copyWidth; c++) {
          const targetRow = pasteStartRow + r;
          const targetCol = pasteStartCol + c;
          if (targetRow < excelData.length && targetCol < columns.length) {
            newSelection.add(getCellKey(targetRow, targetCol));
          }
        }
      }
      setSelectedCells(newSelection);
    } else {
      toast({
        title: "Paste Failed",
        description: "No editable cells found in the paste target range",
        variant: "destructive"
      });
    }
  }, [copiedData, copiedRange, activeCell, excelData, columns, setCellValue, getCellKey, toast]);

  // Helper function to paste external clipboard data (from Excel, etc.)
  const pasteExternalData = useCallback(async (pasteData: any[][]) => {
    if (!activeCell) {
      toast({
        title: "Select a Cell First",
        description: "Click on a cell before pasting. The values will paste starting from that cell.",
        variant: "destructive"
      });
      return;
    }
    
    const pasteStartRow = activeCell.row;
    const pasteStartCol = activeCell.col;
    const pasteHeight = pasteData.length;
    const pasteWidth = pasteData[0]?.length || 0;
    
    if (pasteWidth === 0) return;
    
    let pastedCount = 0;
    
    // Paste external data starting from the active cell
    for (let r = 0; r < pasteHeight; r++) {
      for (let c = 0; c < pasteWidth; c++) {
        const targetRow = pasteStartRow + r;
        const targetCol = pasteStartCol + c;
        
        // Check bounds
        if (targetRow >= excelData.length || targetCol >= columns.length) continue;
        
        const targetColumn = columns[targetCol];
        const targetRowData = combinedData[targetRow];
        const cellValue = pasteData[r][c];
        
        // Only paste to editable cells
        if (targetColumn?.editable && targetRowData && cellValue !== undefined && cellValue !== '') {
          let parsedValue = cellValue;
          
          // Parse numeric values for appropriate columns
          if (targetColumn.dataType === 'number') {
            // Clean the input string by removing common formatting characters
            const cleanValue = String(cellValue).replace(/[,$\s%]/g, '');
            const numValue = parseFloat(cleanValue);
            
            if (!isNaN(numValue)) {
              parsedValue = Math.max(0, numValue);
              
              // For quantity, check stock limits
              if (targetColumn.key === 'quantity') {
                parsedValue = Math.min(parsedValue, targetRowData.stock);
              }
            } else {
              // Handle empty or non-numeric values for numeric columns
              parsedValue = 0;
            }
          }
          
          setCellValue(targetRowData.id, targetColumn.key, parsedValue);
          pastedCount++;
        }
      }
    }
    
    if (pastedCount > 0) {
      toast({
        title: "Pasted from Clipboard",
        description: `Pasted values to ${pastedCount} cells from external clipboard`,
      });
      
      // Select the pasted range
      const newSelection = new Set<string>();
      for (let r = 0; r < pasteHeight; r++) {
        for (let c = 0; c < pasteWidth; c++) {
          const targetRow = pasteStartRow + r;
          const targetCol = pasteStartCol + c;
          if (targetRow < excelData.length && targetCol < columns.length) {
            newSelection.add(getCellKey(targetRow, targetCol));
          }
        }
      }
      setSelectedCells(newSelection);
    } else {
      toast({
        title: "External Paste Failed",
        description: "No valid data found or no editable cells in the paste range",
        variant: "destructive"
      });
    }
  }, [activeCell, excelData, columns, setCellValue, getCellKey, toast]);

  // Export data to CSV
  const exportToCSV = useCallback(() => {
    const headers = columns.map(col => col.header);
    const csvRows = [headers.join(',')];
    
    excelData.forEach(row => {
      const values = columns.map(col => {
        const value = row[col.key as keyof typeof row];
        const stringValue = value !== undefined && value !== null ? String(value) : '';
        return stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')
          ? `"${stringValue.replace(/"/g, '""')}"` 
          : stringValue;
      });
      csvRows.push(values.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `wholesale_order_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "CSV Exported",
      description: `Exported ${excelData.length} rows to CSV file`,
    });
  }, [excelData, columns, toast]);

  // Helper function to parse CSV row respecting quotes
  const parseCSVRow = (row: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      const nextChar = row[i + 1];
      
      if (char === '"' && inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  };

  // Import data from CSV
  const importFromCSV = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const rows = text.split('\n').filter(row => row.trim());
          
          if (rows.length < 2) {
            toast({
              title: "Invalid CSV",
              description: "CSV file is empty or has no data rows",
              variant: "destructive",
            });
            return;
          }
          
          const headers = parseCSVRow(rows[0]);
          const dataRows = rows.slice(1);
          
          let importedCount = 0;
          dataRows.forEach((row, rowIndex) => {
            const values = parseCSVRow(row);
            
            if (rowIndex < excelData.length) {
              const excelRow = combinedData[rowIndex];
              headers.forEach((header, colIndex) => {
                const column = columns.find(col => col.header === header);
                if (column && column.editable && values[colIndex] !== undefined) {
                  let value: any = values[colIndex];
                  
                  if (column.dataType === 'number') {
                    const cleanValue = String(value).replace(/[,$\s%]/g, '');
                    value = parseFloat(cleanValue) || 0;
                    if (column.key === 'quantity') {
                      value = Math.max(0, Math.min(value, excelRow.stock));
                    }
                  }
                  
                  setCellValue(excelRow.id, column.key, value);
                  importedCount++;
                }
              });
            }
          });
          
          toast({
            title: "CSV Imported",
            description: `Imported ${importedCount} values from CSV file`,
          });
        } catch (error) {
          toast({
            title: "Import Failed",
            description: "Failed to parse CSV file",
            variant: "destructive",
          });
        }
      };
      
      reader.readAsText(file);
    };
    
    input.click();
  }, [excelData, columns, setCellValue, toast]);

  // Add to cart mutation
  const addToCartMutation = useMutation({
    mutationFn: async (items: InsertCartItem[]) => {
      return apiRequest("/api/cart/batch", "POST", { items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Added to Cart",
        description: `Successfully added ${getSelectedRowsCount()} items to your cart`,
      });
      clearSelection();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add items to cart",
        variant: "destructive",
      });
    },
  });

  const toggleRowSelection = (rowId: string) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowId)) {
        newSet.delete(rowId);
      } else {
        newSet.add(rowId);
      }
      return newSet;
    });
  };

  const clearSelection = () => {
    setSelectedRows(new Set());
    // Selection state is now handled automatically by quantity
  };

  const clearAllQuantities = () => {
    setQuantityMap(new Map());
    setSelectedRows(new Set());
  };

  const getSelectedRowsCount = () => {
    return excelData.filter(row => row.quantity > 0).length;
  };

  const getTotalItems = () => {
    return excelData.reduce((sum, row) => sum + row.quantity, 0);
  };

  const getTotalValue = () => {
    return excelData.reduce((sum, row) => sum + row.totalPrice, 0);
  };

  // Get selected order items for Order Designer
  const getSelectedOrderItems = useCallback(() => {
    return excelData
      .filter(row => row.quantity > 0)
      .map(row => ({
        id: row.id,
        productId: row.productId,
        name: row.name,
        brand: row.brand,
        color: row.color,
        size: row.usSize,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        totalPrice: row.totalPrice,
        imageUrl: row.imageUrl,
        category: row.category,
        styleCode: row.styleCode
      }));
  }, [excelData]);

  // Order Designer handlers
  const handleCloseOrderDesigner = useCallback(() => {
    setShowOrderDesigner(false);
  }, []);

  const handleUpdateOrderQuantity = useCallback((itemId: string, quantity: number) => {
    updateQuantity(itemId, quantity);
  }, [updateQuantity]);

  const handleRemoveOrderItem = useCallback((itemId: string) => {
    updateQuantity(itemId, 0);
  }, [updateQuantity]);

  const handleAddToCart = useCallback(() => {
    // Group items by productId to create proper cart structure with selections
    const productMap = new Map<string, { selections: Array<{ color: string; size: string; quantity: number }>, productName: string }>();
    
    excelData
      .filter(row => row.quantity > 0)
      .forEach(row => {
        if (!productMap.has(row.productId)) {
          productMap.set(row.productId, {
            selections: [],
            productName: row.name
          });
        }
        productMap.get(row.productId)!.selections.push({
          color: row.color,
          size: row.usSize,
          quantity: row.quantity
        });
      });

    // Convert to proper cart item format
    const cartItems = Array.from(productMap.entries()).map(([productId, data]) => ({
      productId,
      batchName: data.productName,
      selections: data.selections,
      sessionId: "anonymous"
    }));

    if (cartItems.length > 0) {
      // Use regular cart endpoint for each product
      const promises = cartItems.map(item => 
        apiRequest("/api/cart", "POST", item)
      );

      Promise.all(promises).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
        toast({
          title: "Added to Cart",
          description: `${excelData.filter(row => row.quantity > 0).length} items added to cart`,
        });
        // Navigate to Order Builder
        setLocation('/order-builder');
      }).catch(() => {
        toast({
          title: "Error",
          description: "Failed to add items to cart",
          variant: "destructive"
        });
      });
    }
  }, [excelData, queryClient, setLocation, toast]);

  const handleProceedToCheckout = useCallback(() => {
    // Items are already in cart, just close the designer
    setShowOrderDesigner(false);
    toast({
      title: "Order Complete",
      description: "Your items are now in the cart and ready for checkout.",
    });
  }, [toast]);

  // Enhanced drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragStartIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(combinedData[index]));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    setDragStartIndex(null);
    
    // Drag and drop reordering disabled for now
    toast({
      title: "Drag & Drop",
      description: "Row reordering is currently disabled",
      variant: "destructive"
    });
  };

  return (
    <div className="space-y-2">
      {/* Active Filters Display */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          {activeFilters.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Active Filters:</h3>
              <div className="flex flex-wrap gap-2">
                {activeFilters.map((filter, index) => (
                  <div
                    key={index}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 border border-indigo-200 dark:border-indigo-700 rounded-xl text-sm font-medium text-indigo-800 dark:text-indigo-200 shadow-sm"
                    data-testid={`filter-tag-${index}`}
                  >
                    <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{filter.key}:</span>
                    <span>{filter.value}</span>
                    <button
                      onClick={() => onRemoveFilter(filter.key, filter.value)}
                      className="ml-1 text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-200 transition-colors"
                      data-testid={`filter-remove-${index}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span className="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full"></span>
              <span>No filters applied - showing all products</span>
            </div>
          )}
        </div>
        
        <div className="flex space-x-3">
          {selectedProductIds.length > 0 && (
            <Button
              data-testid="button-next-to-matrix"
              onClick={handleNextToMatrix}
              className="px-6 bg-gradient-to-r from-primary to-accent hover:shadow-xl text-white font-semibold shadow-lg transition-all duration-300"
            >
              Next: Select Sizes & Colors ({selectedProductIds.length} {selectedProductIds.length === 1 ? 'Model' : 'Models'})
            </Button>
          )}
          <Button
            data-testid="button-add-to-cart"
            onClick={handleAddToCart}
            disabled={getTotalItems() === 0 || addToCartMutation.isPending}
            className="px-6 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
          >
            {addToCartMutation.isPending ? 'Adding...' : `Add ${getTotalItems()} Items to Cart ($${getTotalValue().toFixed(2)})`}
          </Button>
        </div>
      </div>

      {/* Excel Table */}
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div 
          ref={tableRef}
          className="overflow-x-auto excel-table-container focus:outline-none"
          style={{ maxHeight: '70vh' }}
          tabIndex={0}
        >
          <table className="w-full excel-table border-collapse">
            <thead className="bg-gray-300 dark:bg-gray-800 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="w-8 p-2 border-2 border-gray-400 dark:border-gray-500 bg-gray-300 dark:bg-gray-800 font-semibold">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === excelData.length && excelData.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        // Select all rows
                        const allRows = new Set(excelData.map(row => row.id));
                        setSelectedRows(allRows);
                      } else {
                        setSelectedRows(new Set());
                      }
                    }}
                    data-testid="checkbox-select-all"
                  />
                </th>
                <th className="p-3 text-left border-2 border-gray-400 dark:border-gray-500 bg-gray-300 dark:bg-gray-800 font-semibold text-gray-800 dark:text-gray-100 min-w-[50px] hidden">#</th>
                {columns.map((column, colIndex) => (
                  <th 
                    key={column.key} 
                    className={`p-3 text-left border-2 border-gray-400 dark:border-gray-500 bg-gray-300 dark:bg-gray-800 font-semibold text-gray-800 dark:text-gray-100 ${column.width || 'min-w-[120px]'}`}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {excelData.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  className="excel-row"
                  data-testid={`row-${row.id}`}
                >
                  {/* Row Selection Checkbox */}
                  <td className="p-2 border border-border bg-muted/20 select-none">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(row.id)}
                      onChange={() => {
                        // Toggle row selection for "Next" button
                        setSelectedRows(prev => {
                          const newSet = new Set(prev);
                          if (newSet.has(row.id)) {
                            newSet.delete(row.id);
                          } else {
                            newSet.add(row.id);
                          }
                          return newSet;
                        });
                      }}
                      data-testid={`checkbox-row-${row.id}`}
                    />
                  </td>
                  
                  {/* Row Number */}
                  <td 
                    className="p-3 border border-border bg-muted/20 text-center text-xs font-mono cursor-pointer select-none hover:bg-muted/40 hidden"
                    onClick={() => {
                      // Select entire row
                      const rowCells = columns.map((_, colIndex) => getCellKey(rowIndex, colIndex));
                      setSelectedCells(new Set(rowCells));
                      setActiveCell({ row: rowIndex, col: 0 });
                    }}
                    data-testid={`row-number-${rowIndex + 1}`}
                  >
                    {rowIndex + 1}
                  </td>
                  
                  {/* Data Cells */}
                  {columns.map((column, colIndex) => {
                    const cellKey = getCellKey(rowIndex, colIndex);
                    const isActive = activeCell?.row === rowIndex && activeCell?.col === colIndex;
                    const isSelected = selectedCells.has(cellKey);
                    const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex;
                    const cellValue = getCellValue(row, column.key);
                    
                    return (
                      <td
                        key={`${row.id}-${column.key}`}
                        ref={(el) => {
                          if (el) {
                            cellRefs.current.set(cellKey, el);
                          } else {
                            cellRefs.current.delete(cellKey);
                          }
                        }}
                        className={`
                          p-1 border border-border cursor-cell select-none relative
                          ${isActive ? 'excel-active-cell' : ''}
                          ${isSelected ? 'excel-selected-cell' : ''}
                          ${column.editable ? 'excel-editable-cell hover:bg-blue-50 dark:hover:bg-blue-900/10' : 'hover:bg-muted/30'}
                          ${column.width || ''}
                        `}
                        onClick={(e) => handleCellClick(e, rowIndex, colIndex)}
                        onDoubleClick={(e) => handleCellDoubleClick(e, rowIndex, colIndex)}
                        onMouseDown={(e) => handleCellMouseDown(e, rowIndex, colIndex)}
                        onMouseEnter={(e) => handleCellMouseEnter(e, rowIndex, colIndex)}
                        data-testid={`cell-${rowIndex}-${colIndex}`}
                      >
                        {isEditing ? (
                          <Input
                            type={column.dataType === 'number' ? 'number' : 'text'}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full h-8 p-1 border-0 focus:ring-2 focus:ring-blue-500 rounded-none"
                            autoFocus
                            onBlur={() => {
                              // Save on blur
                              const value = column.dataType === 'number' ? parseFloat(editValue) || 0 : editValue;
                              setCellValue(row.id, column.key, value);
                              setEditingCell(null);
                              setEditValue('');
                            }}
                            data-testid={`input-edit-${rowIndex}-${colIndex}`}
                          />
                        ) : (
                          <div className="p-2 min-h-[32px] flex items-center">
                            {column.key === 'quantity' && column.editable ? (
                              <div className="flex items-center space-x-1 w-full">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateQuantity(row.id, row.quantity - 1);
                                  }}
                                  disabled={row.quantity <= 0 || row.stock === 0}
                                  data-testid={`button-decrease-${row.id}`}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="text-sm font-medium text-center min-w-[30px]">
                                  {row.quantity}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateQuantity(row.id, row.quantity + 1);
                                  }}
                                  disabled={row.quantity >= row.stock || row.stock === 0}
                                  data-testid={`button-increase-${row.id}`}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="h-6 px-2 ml-2 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (row.quantity > 0) {
                                      onAddToBucket({
                                        productId: row.productId,
                                        productName: row.name,
                                        productSku: row.styleCode,
                                        brand: row.brand,
                                        color: row.color,
                                        size: row.usSize,
                                        quantity: row.quantity,
                                        price: row.unitPrice.toString()
                                      });
                                      toast({
                                        title: "Added to Bucket",
                                        description: `${row.quantity} × ${row.name} (${row.color}, Size ${row.usSize})`,
                                      });
                                    }
                                  }}
                                  disabled={row.quantity <= 0 || row.stock === 0}
                                  data-testid={`button-add-to-bucket-${row.id}`}
                                >
                                  Add
                                </Button>
                              </div>
                            ) : column.key === 'productPhoto' ? (
                              <PhotoCarousel
                                imageUrl={row.imageUrl}
                                productName={`${row.name} - ${row.color}`}
                                autoRotate={false}
                                className="w-32 h-32"
                              />
                            ) : column.key === 'color' ? (
                              <div className="flex items-center space-x-2">
                                <div 
                                  className="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600 shadow-sm"
                                  style={{ 
                                    backgroundColor: row.color.toLowerCase() === 'white' ? '#FFFFFF' :
                                                   row.color.toLowerCase() === 'black' ? '#000000' :
                                                   row.color.toLowerCase() === 'red' ? '#DC2626' :
                                                   row.color.toLowerCase() === 'blue' ? '#2563EB' :
                                                   row.color.toLowerCase() === 'green' ? '#16A34A' :
                                                   row.color.toLowerCase() === 'grey' || row.color.toLowerCase() === 'gray' ? '#6B7280' :
                                                   row.color.toLowerCase() === 'brown' ? '#92400E' :
                                                   row.color.toLowerCase() === 'yellow' ? '#CA8A04' :
                                                   row.color.toLowerCase() === 'purple' ? '#7C3AED' :
                                                   row.color.toLowerCase() === 'pink' ? '#DB2777' :
                                                   row.color.toLowerCase() === 'orange' ? '#EA580C' :
                                                   '#6B7280' // Default gray for unknown colors
                                  }}
                                  title={row.color}
                                />
                                <span className="text-sm font-medium">{row.color}</span>
                              </div>
                            ) : column.key === 'name' ? (
                              <span 
                                className="text-sm font-semibold text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const product = products.find(p => p.id === row.productId);
                                  if (product) setSelectedProductDetail(product);
                                }}
                              >
                                {cellValue}
                              </span>
                            ) : (
                              <span className={`text-sm ${column.dataType === 'number' ? 'font-medium' : ''} ${column.key === 'styleCode' || column.key === 'barcode' ? 'font-mono' : ''}`}>
                                {column.dataType === 'number' && typeof cellValue === 'number' 
                                  ? cellValue.toFixed(2).replace(/\.?0+$/, '')
                                  : cellValue
                                }
                                {(column.key === 'unitPrice' || column.key === 'totalPrice' || column.key === 'costPrice' || column.key === 'rrp') && '$'}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              
              {/* Bucket Section - Staged Items */}
              {bucketItems.length > 0 && (
                <>
                  {/* Bucket Header Row */}
                  <tr className="bg-blue-50 dark:bg-blue-900/20 border-t-4 border-blue-500">
                    <td colSpan={1} className="p-3 border-2 border-gray-400 dark:border-gray-500">
                      <div className="flex items-center space-x-2">
                        <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <span className="font-bold text-blue-700 dark:text-blue-300">BUCKET - STAGED ITEMS</span>
                      </div>
                    </td>
                    <td colSpan={columns.length} className="p-3 border-2 border-gray-400 dark:border-gray-500 text-right">
                      <Button
                        onClick={() => {
                          moveToCart();
                          toast({
                            title: "Moved to Cart",
                            description: `${bucketItems.reduce((sum, item) => sum + item.quantity, 0)} items moved to cart`,
                          });
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                        data-testid="button-bucket-move-to-cart"
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Move All to Cart ({bucketItems.reduce((sum, item) => sum + item.quantity, 0)})
                      </Button>
                    </td>
                  </tr>
                  
                  {/* Bucket Items */}
                  {bucketItems.map((item, index) => {
                    const bucketRowIndex = excelData.length + index; // Row index after regular rows
                    
                    return (<tr
                        key={`bucket-${item.productId}-${item.color}-${item.size}`}
                        className="bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-100/70 dark:hover:bg-blue-900/20"
                        data-testid={`bucket-row-${index}`}
                      >
                        {/* Row Selection Checkbox */}
                        <td className="p-2 border border-border bg-blue-100/30 dark:bg-blue-900/30 select-none">
                          <input
                            type="checkbox"
                            checked={columns.some((_, colIndex) => selectedCells.has(getCellKey(bucketRowIndex, colIndex)))}
                            onChange={() => {
                              // Toggle entire row selection
                              const rowCells = columns.map((_, colIndex) => getCellKey(bucketRowIndex, colIndex));
                              const allSelected = rowCells.every(cellKey => selectedCells.has(cellKey));
                              setSelectedCells(prev => {
                                const newSet = new Set(prev);
                                if (allSelected) {
                                  rowCells.forEach(cellKey => newSet.delete(cellKey));
                                } else {
                                  rowCells.forEach(cellKey => newSet.add(cellKey));
                                }
                                return newSet;
                              });
                            }}
                            data-testid={`checkbox-bucket-row-${index}`}
                          />
                        </td>
                        
                        {/* Row Number */}
                        <td 
                          className="p-3 border border-border bg-blue-100/30 dark:bg-blue-900/30 text-center text-xs font-mono cursor-pointer select-none hover:bg-blue-200/50 dark:hover:bg-blue-800/50 hidden"
                          onClick={() => {
                            // Select entire row
                            const rowCells = columns.map((_, colIndex) => getCellKey(bucketRowIndex, colIndex));
                            setSelectedCells(new Set(rowCells));
                            setActiveCell({ row: bucketRowIndex, col: 0 });
                          }}
                          data-testid={`bucket-row-number-${index}`}
                        >
                          B{index + 1}
                        </td>
                        
                        {/* Map columns */}
                        {columns.map((column, colIndex) => {
                          const cellKey = getCellKey(bucketRowIndex, colIndex);
                          const isActive = activeCell?.row === bucketRowIndex && activeCell?.col === colIndex;
                          const isSelected = selectedCells.has(cellKey);
                          
                          if (column.key === 'productPhoto') {
                            return (
                              <td 
                                key={column.key} 
                                className={`p-2 border border-border cursor-cell select-none ${isActive ? 'excel-active-cell' : ''} ${isSelected ? 'excel-selected-cell' : ''}`}
                                onClick={(e) => handleCellClick(e, bucketRowIndex, colIndex)}
                                onDoubleClick={(e) => handleCellDoubleClick(e, bucketRowIndex, colIndex)}
                                onMouseDown={(e) => handleCellMouseDown(e, bucketRowIndex, colIndex)}
                                onMouseEnter={(e) => handleCellMouseEnter(e, bucketRowIndex, colIndex)}
                                data-testid={`bucket-cell-${index}-${colIndex}`}
                              >
                                <div className="w-32 h-32 rounded-md overflow-hidden border border-gray-200 dark:border-gray-600">
                                  <div className="w-full h-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center">
                                    <Package className="h-16 w-16 text-blue-600 dark:text-blue-400" />
                                  </div>
                                </div>
                              </td>
                            );
                          } else if (column.key === 'styleCode' || column.key === 'name' || column.key === 'brand' || column.key === 'usSize') {
                            let cellContent;
                            if (column.key === 'styleCode') cellContent = item.productSku;
                            else if (column.key === 'name') cellContent = item.productName;
                            else if (column.key === 'brand') cellContent = item.brand;
                            else if (column.key === 'usSize') cellContent = item.size;
                            
                            return (
                              <td 
                                key={column.key} 
                                className={`p-2 border border-border cursor-cell select-none ${isActive ? 'excel-active-cell' : ''} ${isSelected ? 'excel-selected-cell' : ''}`}
                                onClick={(e) => handleCellClick(e, bucketRowIndex, colIndex)}
                                onDoubleClick={(e) => handleCellDoubleClick(e, bucketRowIndex, colIndex)}
                                onMouseDown={(e) => handleCellMouseDown(e, bucketRowIndex, colIndex)}
                                onMouseEnter={(e) => handleCellMouseEnter(e, bucketRowIndex, colIndex)}
                                data-testid={`bucket-cell-${index}-${colIndex}`}
                              >
                                <div className="p-2 min-h-[32px] flex items-center">
                                  <span className={`text-sm ${column.key === 'name' ? 'font-medium' : ''} ${column.key === 'styleCode' ? 'font-mono' : ''}`}>
                                    {cellContent}
                                  </span>
                                </div>
                              </td>
                            );
                          } else if (column.key === 'color') {
                            return (
                              <td 
                                key={column.key} 
                                className={`p-2 border border-border cursor-cell select-none ${isActive ? 'excel-active-cell' : ''} ${isSelected ? 'excel-selected-cell' : ''}`}
                                onClick={(e) => handleCellClick(e, bucketRowIndex, colIndex)}
                                onDoubleClick={(e) => handleCellDoubleClick(e, bucketRowIndex, colIndex)}
                                onMouseDown={(e) => handleCellMouseDown(e, bucketRowIndex, colIndex)}
                                onMouseEnter={(e) => handleCellMouseEnter(e, bucketRowIndex, colIndex)}
                                data-testid={`bucket-cell-${index}-${colIndex}`}
                              >
                                <div className="p-2 min-h-[32px] flex items-center">
                                  <div className="flex items-center space-x-2">
                                    <div 
                                      className="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600 shadow-sm"
                                      style={{ 
                                        backgroundColor: item.color.toLowerCase() === 'white' ? '#FFFFFF' :
                                                       item.color.toLowerCase() === 'black' ? '#000000' :
                                                       item.color.toLowerCase() === 'red' ? '#DC2626' :
                                                       item.color.toLowerCase() === 'blue' ? '#2563EB' :
                                                       item.color.toLowerCase() === 'green' ? '#16A34A' :
                                                       item.color.toLowerCase() === 'grey' || item.color.toLowerCase() === 'gray' ? '#6B7280' :
                                                       item.color.toLowerCase() === 'brown' ? '#92400E' :
                                                       item.color.toLowerCase() === 'yellow' ? '#CA8A04' :
                                                       item.color.toLowerCase() === 'purple' ? '#7C3AED' :
                                                       item.color.toLowerCase() === 'pink' ? '#DB2777' :
                                                       item.color.toLowerCase() === 'orange' ? '#EA580C' :
                                                       '#6B7280'
                                      }}
                                    />
                                    <span className="text-sm font-medium">{item.color}</span>
                                  </div>
                                </div>
                              </td>
                            );
                        } else if (column.key === 'quantity' && column.editable) {
                          return (
                            <td key={column.key} className="p-2 border border-border">
                              <div className="flex items-center space-x-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateBucketQuantity(item.productId, item.color, item.size, item.quantity - 1);
                                  }}
                                  disabled={item.quantity <= 0}
                                  data-testid={`button-bucket-decrease-${index}`}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="text-sm font-medium text-center min-w-[30px]">
                                  {item.quantity}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateBucketQuantity(item.productId, item.color, item.size, item.quantity + 1);
                                  }}
                                  data-testid={`button-bucket-increase-${index}`}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 ml-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeFromBucket(item.productId, item.color, item.size);
                                    toast({
                                      title: "Removed from Bucket",
                                      description: `${item.productName} (${item.color}, Size ${item.size})`,
                                    });
                                  }}
                                  data-testid={`button-bucket-remove-${index}`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          );
                        } else if (column.key === 'unitPrice') {
                          return (
                            <td key={column.key} className="p-2 border border-border">
                              <span className="text-sm font-medium">{parseFloat(item.price).toFixed(2)}$</span>
                            </td>
                          );
                        } else if (column.key === 'totalPrice') {
                          return (
                            <td key={column.key} className="p-2 border border-border">
                              <span className="text-sm font-medium">{(parseFloat(item.price) * item.quantity).toFixed(2)}$</span>
                            </td>
                          );
                        } else {
                          return <td key={column.key} className="p-2 border border-border"></td>;
                        }
                      })}
                    </tr>);
                  })}
                  
                  {/* Bucket Summary Row */}
                  <tr className="bg-blue-100 dark:bg-blue-900/30 border-t-2 border-blue-400">
                    <td colSpan={1} className="p-3 border-2 border-gray-400 dark:border-gray-500"></td>
                    {columns.map((column) => {
                      if (column.key === 'quantity') {
                        return (
                          <td key={column.key} className="p-3 border-2 border-gray-400 dark:border-gray-500">
                            <span className="text-sm font-bold">Total: {bucketItems.reduce((sum, item) => sum + item.quantity, 0)}</span>
                          </td>
                        );
                      } else if (column.key === 'totalPrice') {
                        return (
                          <td key={column.key} className="p-3 border-2 border-gray-400 dark:border-gray-500">
                            <span className="text-sm font-bold">
                              ${bucketItems.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0).toFixed(2)}
                            </span>
                          </td>
                        );
                      } else {
                        return <td key={column.key} className="p-3 border-2 border-gray-400 dark:border-gray-500"></td>;
                      }
                    })}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Summary Footer */}
        <div className="bg-muted/30 p-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6 text-sm">
              <span>Selected Rows: <strong>{selectedRows.size}</strong></span>
              <span>Total Items: <strong>{getTotalItems()}</strong></span>
              <span>Total Value: <strong>${getTotalValue().toFixed(2)}</strong></span>
            </div>
            
            <div className="flex space-x-2">
              <Button
                data-testid="button-copy-cells"
                variant="outline"
                size="sm"
                onClick={copyCellsToClipboard}
                disabled={selectedCells.size === 0}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy ({selectedCells.size})
              </Button>
              <Button
                data-testid="button-paste-cells"
                variant="outline"
                size="sm"
                onClick={pasteCells}
                disabled={copiedData.size === 0 || !activeCell}
              >
                <ClipboardPaste className="h-4 w-4 mr-2" />
                Paste
              </Button>
              <Button
                data-testid="button-export-csv"
                variant="outline"
                size="sm"
                onClick={exportToCSV}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button
                data-testid="button-import-csv"
                variant="outline"
                size="sm"
                onClick={importFromCSV}
              >
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Button
                data-testid="button-select-all-rows"
                variant="outline"
                size="sm"
                onClick={() => setSelectedRows(new Set(excelRows.map(row => row.id)))}
              >
                Select All Rows
              </Button>
              <Button
                data-testid="button-select-in-stock"
                variant="outline"
                size="sm"
                onClick={() => {
                  const inStockIds = excelRows.filter(row => row.stock > 0).map(row => row.id);
                  setSelectedRows(new Set(inStockIds));
                }}
              >
                Select In Stock
              </Button>
              <Button
                data-testid="button-fill-common-sizes"
                variant="outline"
                size="sm"
                onClick={() => {
                  // Fill common sizes (8-11) with quantity 5
                  excelRows.forEach(row => {
                    if (['8', '9', '10', '11'].includes(row.usSize) && row.stock > 0) {
                      const quantity = Math.min(5, row.stock);
                      setQuantityMap(prev => new Map(prev.set(row.id, quantity)));
                    }
                  });
                }}
              >
                Fill Common Sizes
              </Button>
              <Button
                data-testid="button-bulk-quantity"
                variant="outline"
                size="sm"
                onClick={() => {
                  const qty = prompt("Enter quantity for selected rows:", "5");
                  if (qty && !isNaN(parseInt(qty))) {
                    const quantity = parseInt(qty);
                    excelRows.forEach(row => {
                      if (selectedRows.has(row.id) && row.stock > 0) {
                        const finalQty = Math.min(quantity, row.stock);
                        setQuantityMap(prev => new Map(prev.set(row.id, finalQty)));
                      }
                    });
                  }
                }}
                disabled={selectedRows.size === 0}
              >
                Set Bulk Quantity
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Order Designer Modal */}
      {showOrderDesigner && (
        <OrderDesigner
          orderItems={getSelectedOrderItems()}
          onUpdateQuantity={handleUpdateOrderQuantity}
          onRemoveItem={handleRemoveOrderItem}
          onClose={handleCloseOrderDesigner}
          onProceedToCheckout={handleProceedToCheckout}
        />
      )}
      
      {/* PreCart Matrix */}
      {showPreCartMatrix && (
        <PreCartMatrix
          selectedProductIds={selectedProductIds}
          onBack={() => setShowPreCartMatrix(false)}
          onAddToCart={handleAddToCartFromMatrix}
        />
      )}
      
      {/* Product Detail Dialog */}
      <Dialog open={selectedProductDetail !== null} onOpenChange={(open) => !open && setSelectedProductDetail(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">{selectedProductDetail?.name}</DialogTitle>
          </DialogHeader>
          {selectedProductDetail && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Large Product Photo */}
              <div className="space-y-4">
                <div className="w-full h-96 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  <img 
                    src={selectedProductDetail.imageUrl} 
                    alt={selectedProductDetail.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              
              {/* Product Details */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Brand</h3>
                  <p className="text-lg font-semibold">{selectedProductDetail.brand}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">SKU</h3>
                  <p className="text-lg font-mono">{selectedProductDetail.sku}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Wholesale Price</h3>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">${selectedProductDetail.wholesalePrice}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Color</h3>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedProductDetail.colourway && (
                      <Badge variant="outline" className="px-3 py-1">
                        {selectedProductDetail.colourway}
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Available Sizes</h3>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedProductDetail.availableSizes.map(({ size, stock }) => (
                      <Badge key={size} variant={stock > 0 ? "default" : "secondary"} className="px-3 py-1">
                        {size} {stock > 0 && `(${stock})`}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                {selectedProductDetail.description && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</h3>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{selectedProductDetail.description}</p>
                  </div>
                )}
                
                <Button 
                  className="w-full mt-4" 
                  size="lg"
                  onClick={() => {
                    setSelectedRows(new Set([selectedProductDetail.id]));
                    setSelectedProductDetail(null);
                    setShowPreCartMatrix(true);
                  }}
                >
                  Select for Order
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}