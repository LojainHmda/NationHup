import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Plus, Package, Check, X, Sparkles, RefreshCw, Image, CloudUpload, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductSchema } from "@shared/schema";
import { z } from "zod";

interface RawPreviewData {
  totalRows: number;
  rawRows: any[][];
  fileName: string;
  tempDataId: string;
  imageColumnInfo?: {
    columnName: string;
    columnIndex: number;
    imageCount: number;
  } | null;
}

interface PreviewData {
  totalRows: number;
  previewRows: any[];
  columns: string[];
  fileName: string;
  tempDataId: string;
  imageColumnInfo?: {
    columnName: string;
    columnIndex: number;
    imageCount: number;
  } | null;
}

interface ColumnMapping {
  sku: string;
  barcode: string;
  name: string;
  brand: string;
  category: string;
  gender: string;
  wholesalePrice: string;
  retailPrice: string;
  minOrder: string;
  division: string;
  countryOfOrigin: string;
  stock: string;
  color: string;
  size: string;
  imageUrl: string;
  description: string;
  embeddedImages: string; // Special marker for embedded image extraction
  // New product metadata fields
  keyCategory: string;
  colourway: string;
  ageGroup: string;
  corporateMarketingLine: string;
  productLine: string;
  productType: string;
  sportsCategory: string;
  moq: string;
  conditions: string;
  materialComposition: string;
  discount: string;
}

interface MissingSKUData {
  sku: string;
  barcode?: string;
  color?: string;
  size?: string;
  stock?: number;
}

interface MissingSKUCheckResult {
  totalSKUs: number;
  existingSKUs: number;
  missingSKUs: number;
  missingSkuData: MissingSKUData[];
}

const DEFAULT_SIZES = ['6', '7', '8', '9', '10', '11', '12'];

const isValidSize = (size: any): boolean => {
  if (size === null || size === undefined || size === '') return false;
  const sizeStr = String(size).trim();
  if (sizeStr === '' || sizeStr.toLowerCase() === 'one size') return false;
  const sizeNum = Number(sizeStr);
  return !isNaN(sizeNum) && Number.isInteger(sizeNum);
};

const quickProductSchema = insertProductSchema.extend({
  name: z.string().min(1, "Product name is required"),
  brand: z.string().min(1, "Brand is required"),
  category: z.string().min(1, "Category is required"),
  gender: z.string().min(1, "Gender is required"),
  wholesalePrice: z.string().min(1, "Wholesale price is required"),
  retailPrice: z.string().min(1, "Retail price is required"),
  minOrder: z.string().min(1, "Minimum order is required"),
  division: z.string().optional(),
  countryOfOrigin: z.string().optional(),
  imageUrl: z.string().optional(),
  description: z.string().optional(),
});

export function StockUpload() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({
    sku: '',
    barcode: '',
    name: '',
    brand: '',
    category: '',
    gender: '',
    wholesalePrice: '',
    retailPrice: '',
    minOrder: '',
    division: '',
    countryOfOrigin: '',
    stock: '',
    color: '',
    size: '',
    imageUrl: '',
    description: '',
    embeddedImages: '',
    keyCategory: '',
    colourway: '',
    ageGroup: '',
    corporateMarketingLine: '',
    productLine: '',
    productType: '',
    sportsCategory: '',
    moq: '',
    conditions: '',
    materialComposition: '',
    discount: ''
  });
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState<'upload' | 'row-selection' | 'mapping' | 'auto-naming' | 'preview-confirm' | 'ready-to-process' | 'complete'>('upload');
  const [result, setResult] = useState<any>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [rawPreview, setRawPreview] = useState<RawPreviewData | null>(null);
  const [selectedHeaderRow, setSelectedHeaderRow] = useState<number>(0);
  
  // Auto-naming pattern state (like PreOrder)
  const [namingPattern, setNamingPattern] = useState<Array<{ type: 'field' | 'text'; value: string }>>([
    { type: 'field', value: 'Brand' },
    { type: 'text', value: ' - ' },
    { type: 'field', value: 'UPC' }
  ]);
  const [missingCheck, setMissingCheck] = useState<MissingSKUCheckResult | null>(null);
  const [creatingProductIndex, setCreatingProductIndex] = useState<number | null>(null);
  const [createdProducts, setCreatedProducts] = useState<Set<string>>(new Set());
  const [autoCreateProducts, setAutoCreateProducts] = useState(true);
  const [defaultValues, setDefaultValues] = useState({
    brand: 'Unknown Brand',
    category: 'General',
    gender: 'Unisex',
    wholesalePrice: '0',
    retailPrice: '0',
    minOrder: '1',
    name: '',
    imageUrl: 'https://via.placeholder.com/400x400?text=No+Image',
    description: 'No description available',
    division: '',
    countryOfOrigin: '',
    stock: '50',
  });
  const [editablePreviewRows, setEditablePreviewRows] = useState<any[]>([]);
  const [skippedRows, setSkippedRows] = useState<Set<number>>(new Set());
  const [gridFilters, setGridFilters] = useState({
    sku: '',
    brand: '',
    category: '',
    status: 'all' as 'all' | 'existing' | 'new'
  });
  const [extractedImages, setExtractedImages] = useState<Record<number, string>>({});
  const [extractedImageArrays, setExtractedImageArrays] = useState<Record<number, string[]>>({});
  const [isExtractingImages, setIsExtractingImages] = useState(false);
  const [driveConfigured, setDriveConfigured] = useState<boolean | null>(null);
  
  // Mapping templates state
  const [savedTemplates, setSavedTemplates] = useState<{ name: string; mapping: ColumnMapping }[]>(() => {
    try {
      const saved = localStorage.getItem('stockUploadMappingTemplates');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [templateName, setTemplateName] = useState('');

  // Filter preview rows based on grid filters (keep original indices)
  const filteredPreviewRows = editablePreviewRows.map((row, originalIdx) => ({ row, originalIdx })).filter(({ row, originalIdx }) => {
    // If row is skipped, show it anyway (user can decide to unskip)
    if (gridFilters.sku && !row.sku?.toLowerCase().includes(gridFilters.sku.toLowerCase())) return false;
    if (gridFilters.brand && !row.brand?.toLowerCase().includes(gridFilters.brand.toLowerCase())) return false;
    if (gridFilters.category && !row.category?.toLowerCase().includes(gridFilters.category.toLowerCase())) return false;
    if (gridFilters.status !== 'all' && row.status !== gridFilters.status) return false;
    return true;
  });

  // Fetch brands and categories for default values and preview grid
  const { data: brands = [] } = useQuery<any[]>({
    queryKey: ['/api/brands'],
    enabled: step === 'mapping' || step === 'preview-confirm' || step === 'ready-to-process'
  });

  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ['/api/categories'],
    enabled: step === 'mapping' || step === 'preview-confirm' || step === 'ready-to-process'
  });

  // Check if Google Drive is configured
  const { data: driveStatus } = useQuery<{ connected: boolean }>({
    queryKey: ['/api/stock/upload/test-drive'],
    enabled: step === 'mapping',
    staleTime: 60000,
  });

  // Extract images from Excel and upload to Google Drive
  const extractImagesMutation = useMutation({
    mutationFn: async ({ uploadedFile, targetColumn, articleColumnName }: { uploadedFile: File; targetColumn?: string; articleColumnName?: string }) => {
      const formData = new FormData();
      formData.append('file', uploadedFile);
      if (targetColumn) {
        formData.append('targetColumn', targetColumn);
      }
      if (articleColumnName) {
        formData.append('articleColumnName', articleColumnName);
      }
      
      const response = await fetch('/api/stock/upload/extract-images', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to extract images');
      }
      
      if (!data.success && data.totalFound === 0) {
        throw new Error('No embedded images found in the Excel file');
      }
      
      return data as {
        success: boolean;
        message: string;
        totalImages: number;
        totalFound: number;
        failedUploads: number;
        rowImageMap: Record<number, string>; // First image per row (backward compatible)
        rowImageArrayMap?: Record<number, string[]>; // All images per row
      };
    },
    onSuccess: (data) => {
      setExtractedImages(data.rowImageMap);
      // Also store the full array of images per row
      if (data.rowImageArrayMap) {
        setExtractedImageArrays(data.rowImageArrayMap);
      }
      
      // Update preview rows with extracted image URLs in the Images column
      if (preview && preview.imageColumnInfo) {
        const imageColName = preview.imageColumnInfo.columnName;
        const updatedPreviewRows = preview.previewRows.map((row, idx) => {
          const imageUrls = data.rowImageArrayMap?.[idx] || (data.rowImageMap[idx] ? [data.rowImageMap[idx]] : []);
          if (imageUrls.length > 0) {
            return {
              ...row,
              [imageColName]: imageUrls.join(', ')
            };
          }
          return row;
        });
        setPreview({
          ...preview,
          previewRows: updatedPreviewRows
        });
      }
      
      if (data.failedUploads > 0) {
        toast({
          title: "⚠️ Partial extraction",
          description: data.message,
          variant: "default",
        });
      } else if (data.totalImages === 0) {
        toast({
          title: "No images found",
          description: "No embedded images were found in this Excel file.",
        });
      } else {
        toast({
          title: "✓ Images extracted!",
          description: data.message,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Image extraction failed",
        description: error.message || "Failed to extract images from Excel",
        variant: "destructive",
      });
    }
  });

  // Upload and preview mutation - shows raw preview first (like PreOrder)
  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/stock/upload/preview', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }
      
      return await response.json() as RawPreviewData;
    },
    onSuccess: (data) => {
      setRawPreview(data);
      setSelectedHeaderRow(0);
      
      // Go to row-selection step to let user choose header row (like PreOrder)
      setStep('row-selection');
      
      toast({
        title: "File uploaded",
        description: `${data.totalRows} rows loaded. Select the row that contains your column headers.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    }
  });
  
  // Set header row mutation (like PreOrder)
  const setHeaderMutation = useMutation({
    mutationFn: async ({ tempDataId, headerRowIndex }: { tempDataId: string, headerRowIndex: number }) => {
      const response = await apiRequest('/api/stock/upload/set-header', 'POST', {
        tempDataId,
        headerRowIndex
      });
      return await response.json() as PreviewData;
    },
    onSuccess: (data) => {
      setPreview(data);
      
      // Auto-detect column mappings - exact name matching only (like PreOrder)
      const columns = data.columns;
      const newMapping = { ...mapping };
      
      const exactMatches: Record<string, keyof ColumnMapping> = {
        'sku': 'sku',
        'upc': 'sku',
        'articlenumber': 'sku',
        'barcode': 'barcode',
        'ean': 'barcode',
        'gtin': 'barcode',
        'name': 'name',
        'productname': 'name',
        'brand': 'brand',
        'category': 'category',
        'gender': 'gender',
        'color': 'color',
        'colour': 'color',
        'colourway': 'colourway',
        'colorway': 'colourway',
        'size': 'size',
        'imageurl': 'imageUrl',
        'image': 'imageUrl',
        'images': 'imageUrl',
        'description': 'description',
        'division': 'division',
        'countryoforigin': 'countryOfOrigin',
        'wholesaleprice': 'wholesalePrice',
        'retailprice': 'retailPrice',
        'price': 'retailPrice',
        'minorder': 'minOrder',
        'stock': 'stock',
        'quantity': 'stock',
        'qty': 'stock',
        'keycategory': 'keyCategory',
        'agegroup': 'ageGroup',
        'corporatemarketingline': 'corporateMarketingLine',
        'productline': 'productLine',
        'producttype': 'productType',
        'sportscategory': 'sportsCategory',
        'moq': 'moq',
        'conditions': 'conditions',
        'materialcomposition': 'materialComposition',
        'discount': 'discount',
      };
      
      for (const col of columns) {
        const normalizedCol = col.toLowerCase().replace(/[\s_-]/g, '');
        if (exactMatches[normalizedCol]) {
          newMapping[exactMatches[normalizedCol]] = col;
        }
      }
      
      // Handle embedded images column
      if (data.imageColumnInfo) {
        newMapping.embeddedImages = data.imageColumnInfo.columnName;
        if (!newMapping.imageUrl) {
          newMapping.imageUrl = data.imageColumnInfo.columnName;
        }
      }
      
      setMapping(newMapping);
      setStep('mapping');
      
      const mappedCount = Object.values(newMapping).filter(v => v !== '').length;
      
      toast({
        title: "Header row set",
        description: `${data.totalRows} data rows ready. ${mappedCount} columns auto-mapped.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to set header row",
        description: error.message || "Failed to process header row",
        variant: "destructive",
      });
    }
  });

  // Get preview with SKU status
  const previewWithStatusMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview data");
      
      const response = await apiRequest('/api/stock/upload/preview-with-status', 'POST', {
        tempDataId: preview.tempDataId,
        mapping
      });
      const result = await response.json();
      return result as any;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      
      // Get inserted imageUrl values from current preview rows (e.g., from "Insert SKU.png" button)
      const imageColName = preview?.imageColumnInfo?.columnName;
      const insertedImageValues: Record<number, string> = {};
      if (imageColName && preview?.previewRows) {
        preview.previewRows.forEach((row, idx) => {
          const cellValue = row[imageColName];
          if (cellValue && String(cellValue).endsWith('.png')) {
            insertedImageValues[idx] = String(cellValue);
          }
        });
      }
      
      // Apply default values and extracted images to rows that have missing fields
      const rowsWithDefaults = (data.previewRows || []).map((row: any, index: number) => {
        // Priority: 1) Extracted images 2) Inserted SKU.png values 3) Row imageUrl 4) rawData imageUrl 5) Default
        const extractedImageUrl = extractedImages[index];
        const insertedImageUrl = insertedImageValues[index];
        const finalImageUrl = extractedImageUrl || insertedImageUrl || row.imageUrl || row.rawData?.imageUrl || defaultValues.imageUrl || '';
        
        // Build imageUrls array from all sources
        const imageUrlsSet = new Set<string>();
        if (extractedImageUrl) imageUrlsSet.add(extractedImageUrl);
        if (insertedImageUrl) imageUrlsSet.add(insertedImageUrl);
        if (row.imageUrl && row.imageUrl !== 'https://via.placeholder.com/400x400?text=No+Image') imageUrlsSet.add(row.imageUrl);
        if (row.rawData?.imageUrl) imageUrlsSet.add(row.rawData.imageUrl);
        if (Array.isArray(row.imageUrls)) row.imageUrls.forEach((url: string) => url && imageUrlsSet.add(url));
        const finalImageUrls = imageUrlsSet.size > 0 ? Array.from(imageUrlsSet) : [];
        
        return {
          ...row,
          name: row.name || row.rawData?.name || '',
          brand: row.brand || row.rawData?.brand || defaultValues.brand || '',
          category: row.category || row.rawData?.category || defaultValues.category || '',
          gender: row.gender || row.rawData?.gender || defaultValues.gender || '',
          division: row.division || row.rawData?.division || defaultValues.division || '',
          countryOfOrigin: row.countryOfOrigin || row.rawData?.countryOfOrigin || defaultValues.countryOfOrigin || '',
          description: row.description || row.rawData?.description || defaultValues.description || '',
          wholesalePrice: row.wholesalePrice || row.rawData?.wholesalePrice || defaultValues.wholesalePrice || '0',
          retailPrice: row.retailPrice || row.rawData?.retailPrice || defaultValues.retailPrice || '0',
          imageUrl: finalImageUrl,
          imageUrls: finalImageUrls,
          // Parse numeric fields to ensure they're numbers
          minOrder: row.minOrder !== undefined && row.minOrder !== '' 
            ? (typeof row.minOrder === 'number' ? row.minOrder : parseInt(row.minOrder) || 1)
            : (parseInt(defaultValues.minOrder) || 1),
          // Apply default stock value of 50 if not provided
          newStock: row.newStock !== undefined && row.newStock !== '' && row.newStock !== null
            ? (typeof row.newStock === 'number' ? row.newStock : parseInt(row.newStock) || 50)
            : (parseInt(defaultValues.stock) || 50),
        };
      });
      
      setEditablePreviewRows(rowsWithDefaults);
      setSkippedRows(new Set());
      setStep('preview-confirm');
    },
    onError: (error: any) => {
      toast({
        title: "Preview failed",
        description: error.message || "Failed to generate preview",
        variant: "destructive",
      });
      setStep('mapping');
    }
  });

  // Check missing SKUs mutation - auto-creates products and processes
  const checkMissingMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview data");
      
      const response = await apiRequest('/api/stock/upload/check-missing', 'POST', {
        tempDataId: preview.tempDataId,
        mapping
      });
      const result = await response.json();
      return result as unknown as MissingSKUCheckResult;
    },
    onSuccess: async (data) => {
      setMissingCheck(data);
      
      // Stay on same step - button shows loading state
      if (data.missingSKUs > 0) {
        // Auto-create products from Excel data - CONSOLIDATE BY SKU
        // First merge extracted images from state into preview rows (same as handleConfirmAndProcess)
        // APPEND state images to existing row.imageUrls to preserve all extracted URLs
        const rowsWithImages = editablePreviewRows.map((row, idx) => {
          const stateImageUrl = extractedImages[idx];
          const stateImageUrls = extractedImageArrays[idx] || [];
          const existingUrls = Array.isArray(row.imageUrls) ? row.imageUrls : [];
          // Combine all image sources: state arrays, state single, existing row arrays
          const combinedUrls = new Set<string>();
          stateImageUrls.forEach((url: string) => url && combinedUrls.add(url));
          if (stateImageUrl) combinedUrls.add(stateImageUrl);
          existingUrls.forEach((url: string) => url && combinedUrls.add(url));
          if (row.imageUrl && row.imageUrl !== 'https://via.placeholder.com/400x400?text=No+Image') {
            combinedUrls.add(row.imageUrl);
          }
          const mergedUrls = Array.from(combinedUrls);
          return {
            ...row,
            imageUrl: mergedUrls[0] || row.imageUrl,
            imageUrls: mergedUrls.length > 0 ? mergedUrls : row.imageUrls
          };
        });
        
        const missingSKUSet = new Set(data.missingSkuData.map(s => s.sku));
        const rowsForMissingSKUs = rowsWithImages.filter(row => missingSKUSet.has(row.sku));
        
        // Group all rows by SKU to consolidate into single product objects
        const skuGroupedRows: Record<string, any[]> = {};
        for (const row of rowsForMissingSKUs) {
          if (!skuGroupedRows[row.sku]) {
            skuGroupedRows[row.sku] = [];
          }
          skuGroupedRows[row.sku].push(row);
        }
        
        let createdCount = 0;
        for (const [sku, rows] of Object.entries(skuGroupedRows)) {
          try {
            // Use first row as base for product attributes
            const firstRow = rows[0];
            
            // Aggregate all colors from all rows for this SKU
            const colorsSet = new Set<string>();
            rows.forEach(r => {
              if (r.color && r.color !== 'Default') colorsSet.add(r.color);
            });
            const colors = colorsSet.size > 0 ? Array.from(colorsSet) : ['Default'];
            
            // Aggregate all sizes with stock from all rows for this SKU
            // If size is invalid or missing, use default sizes [6, 7, 8, 9, 10, 11, 12]
            const sizeStockMap: Record<string, number> = {};
            let hasValidSize = false;
            rows.forEach(r => {
              if (isValidSize(r.size)) {
                hasValidSize = true;
                const size = String(r.size).trim();
                const stockVal = parseInt(r.newStock);
                const stock = isNaN(stockVal) ? 50 : stockVal;
                sizeStockMap[size] = (sizeStockMap[size] || 0) + stock;
              }
            });
            
            // If no valid sizes found, use default sizes with stock of 50 each
            if (!hasValidSize) {
              DEFAULT_SIZES.forEach(size => {
                sizeStockMap[size] = 50;
              });
            }
            
            const availableSizes = Object.entries(sizeStockMap).map(([size, stock]) => ({
              size,
              stock
            }));
            
            // Build stockMatrix: { color: { size: quantity } }
            const stockMatrix: Record<string, Record<string, number>> = {};
            rows.forEach(r => {
              const color = r.color || 'Default';
              const stockVal = parseInt(r.newStock);
              const stock = isNaN(stockVal) ? 50 : stockVal;
              
              if (isValidSize(r.size)) {
                const size = String(r.size).trim();
                if (!stockMatrix[color]) stockMatrix[color] = {};
                stockMatrix[color][size] = (stockMatrix[color][size] || 0) + stock;
              } else {
                // Use default sizes with 50 stock each
                if (!stockMatrix[color]) stockMatrix[color] = {};
                DEFAULT_SIZES.forEach(size => {
                  stockMatrix[color][size] = 50;
                });
              }
            });
            
            // Aggregate ALL imageUrls from ALL rows for this SKU
            const imageUrlsSet = new Set<string>();
            rows.forEach(r => {
              if (r.imageUrl && r.imageUrl !== 'https://via.placeholder.com/400x400?text=No+Image') {
                imageUrlsSet.add(r.imageUrl);
              }
              // Also check for imageUrls array in each row
              if (Array.isArray(r.imageUrls)) {
                r.imageUrls.forEach((url: string) => imageUrlsSet.add(url));
              }
            });
            const imageUrls = imageUrlsSet.size > 0 ? Array.from(imageUrlsSet) : [];
            const imageUrl = imageUrls[0] || defaultValues.imageUrl || 'https://via.placeholder.com/400x400?text=No+Image';
            
            // Build complete product data with all fields - check edited (_) fields first
            const productData = {
              sku: sku,
              barcode: firstRow._barcode || firstRow.barcode || '',
              name: firstRow._name || firstRow.name || `${firstRow._brand || firstRow.brand || defaultValues.brand} ${sku}`,
              brand: firstRow._brand || firstRow.brand || defaultValues.brand,
              category: firstRow._category || firstRow.category || defaultValues.category,
              gender: firstRow._gender || firstRow.gender || defaultValues.gender,
              wholesalePrice: String(firstRow._wholesalePrice || firstRow.wholesalePrice || defaultValues.wholesalePrice || '0'),
              retailPrice: String(firstRow._retailPrice || firstRow.retailPrice || defaultValues.retailPrice || '0'),
              minOrder: (() => { const val = parseInt(firstRow._minOrder || firstRow.minOrder || defaultValues.minOrder); return isNaN(val) ? 1 : val; })(),
              division: firstRow._division || firstRow.division || defaultValues.division || '',
              countryOfOrigin: firstRow._countryOfOrigin || firstRow.countryOfOrigin || defaultValues.countryOfOrigin || '',
              imageUrl: imageUrl,
              imageUrls: imageUrls,
              description: firstRow._description || firstRow.description || defaultValues.description || '',
              colors: colors,
              availableSizes: availableSizes,
              stockMatrix: stockMatrix,
              inStock: true,
              stockLevel: 'in_stock',
              collections: [],
              isPreOrder: false,
              // Include additional metadata fields - check edited (_) fields first
              keyCategory: firstRow._keyCategory || firstRow.keyCategory || firstRow.rawData?.keyCategory || null,
              colourway: firstRow._colourway || firstRow.colourway || firstRow.rawData?.colourway || (colors.length > 0 ? colors[0] : null),
              ageGroup: firstRow._ageGroup || firstRow.ageGroup || firstRow.rawData?.ageGroup || null,
              corporateMarketingLine: firstRow._corporateMarketingLine || firstRow.corporateMarketingLine || firstRow.rawData?.corporateMarketingLine || null,
              productLine: firstRow._productLine || firstRow.productLine || firstRow.rawData?.productLine || null,
              productType: firstRow._productType || firstRow.productType || firstRow.rawData?.productType || null,
              sportsCategory: firstRow._sportsCategory || firstRow.sportsCategory || firstRow.rawData?.sportsCategory || null,
              moq: (() => { const val = parseInt(firstRow._moq || firstRow.moq || firstRow.rawData?.moq); return isNaN(val) ? null : val; })(),
              conditions: firstRow._conditions || firstRow.conditions || firstRow.rawData?.conditions || null,
              materialComposition: firstRow._materialComposition || firstRow.materialComposition || firstRow.rawData?.materialComposition || null,
              discount: firstRow._discount || firstRow.discount || firstRow.rawData?.discount || '0',
              // Store all original raw data for complete preservation
              rawAttributes: firstRow.rawData || firstRow,
            };
            
            const response = await apiRequest('/api/stock/upload/create-product', 'POST', productData);
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.details || errorData.message || 'Failed to create product');
            }
            createdCount++;
            setCreatedProducts(prev => new Set([...Array.from(prev), sku]));
          } catch (error: any) {
            console.error(`Failed to create product ${sku}:`, error);
            // Stop processing and show error
            toast({
              title: "Product creation failed",
              description: `Failed to create ${sku}: ${error.message}`,
              variant: "destructive",
            });
            setStep('preview-confirm');
            return; // Exit early, don't proceed to processing
          }
        }
        
        // Only proceed to stock processing if all products created successfully
        processMutation.mutate();
      } else {
        // All SKUs exist, proceed to processing
        processMutation.mutate();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Processing failed",
        description: error.message || "Failed to process upload",
        variant: "destructive",
      });
      setStep('ready-to-process');
    }
  });

  // Create product mutation
  const createProductMutation = useMutation({
    mutationFn: async (productData: any) => {
      const response = await apiRequest('/api/stock/upload/create-product', 'POST', productData);
      return await response.json();
    },
    onSuccess: (data, variables) => {
      const sku = variables.sku;
      setCreatedProducts(prev => new Set([...Array.from(prev), sku]));
      setCreatingProductIndex(null);
      
      toast({
        title: "✓ Product created",
        description: `${variables.name} has been created successfully.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create product",
        description: error.message || "Failed to create product",
        variant: "destructive",
      });
    }
  });

  // Process upload mutation
  const processMutation = useMutation({
    mutationFn: async (rowsToProcess?: any[]) => {
      if (!preview) throw new Error("No preview data");
      
      // Use provided rows or fall back to current state
      const rows = rowsToProcess || editablePreviewRows;
      const activeRows = rows.filter((_, idx) => !skippedRows.has(idx));
      
      const response = await apiRequest('/api/stock/upload/process', 'POST', {
        rows: activeRows, // Send edited data directly
        mapping,
        batchName: preview.fileName
      });
      const result = await response.json();
      return result as any;
    },
    onSuccess: (data: any) => {
      setResult(data);
      setStep('complete');
      toast({
        title: "✓ Import complete!",
        description: `Processed ${data.processed} of ${data.total} records.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to process import",
        variant: "destructive",
      });
      setStep('mapping');
    }
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    const validExtensions = ['.csv', '.xls', '.xlsx'];
    const isValid = validExtensions.some(ext => droppedFile.name.toLowerCase().endsWith(ext));
    
    if (droppedFile && isValid) {
      setFile(droppedFile);
      previewMutation.mutate(droppedFile);
    } else {
      toast({
        title: "Invalid file",
        description: "Please upload a CSV or Excel file",
        variant: "destructive",
      });
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      previewMutation.mutate(selectedFile);
    }
  };

  // No longer needed - checking is done when user clicks "Process Upload" in ready-to-process step

  const handleShowPreview = () => {
    // No required fields for now - allow processing with any mapping
    const hasSomeMapping = Object.values(mapping).some(v => v !== '');
    if (!hasSomeMapping) {
      toast({
        title: "No columns mapped",
        description: "Please map at least one column to continue",
        variant: "destructive",
      });
      return;
    }
    // Move to auto-naming step instead of preview (like PreOrder)
    setStep('auto-naming');
  };

  // Auto-naming helper functions (like PreOrder)
  const addNamingToken = (type: 'field' | 'text', value: string) => {
    setNamingPattern([...namingPattern, { type, value }]);
  };

  const removeNamingToken = (index: number) => {
    setNamingPattern(namingPattern.filter((_, i) => i !== index));
  };

  const applyPreset = (preset: string) => {
    switch (preset) {
      case 'brand-upc':
        setNamingPattern([
          { type: 'field', value: 'Brand' },
          { type: 'text', value: ' - ' },
          { type: 'field', value: 'UPC' }
        ]);
        break;
      case 'brand-category-upc':
        setNamingPattern([
          { type: 'field', value: 'Brand' },
          { type: 'text', value: ' ' },
          { type: 'field', value: 'Category' },
          { type: 'text', value: ' - ' },
          { type: 'field', value: 'UPC' }
        ]);
        break;
      case 'name-color':
        setNamingPattern([
          { type: 'field', value: 'Name' },
          { type: 'text', value: ' ' },
          { type: 'field', value: 'Color' }
        ]);
        break;
    }
  };

  // Generate product name from pattern and row data
  const generateProductName = (row: any, pattern: Array<{ type: 'field' | 'text'; value: string }>) => {
    return pattern.map(token => {
      if (token.type === 'text') return token.value;
      
      // Map field names to row data
      const fieldMap: Record<string, string> = {
        'UPC': row[mapping.sku] || '',
        'Brand': row[mapping.brand] || row._brand || defaultValues.brand,
        'Category': row[mapping.category] || row._category || defaultValues.category,
        'Name': row[mapping.name] || '',
        'Color': row[mapping.color] || '',
        'Size': row[mapping.size] || '',
        'Gender': row[mapping.gender] || row._gender || defaultValues.gender,
        'Description': row[mapping.description] || '',
      };
      
      return fieldMap[token.value] || token.value;
    }).join('').trim() || `Product ${row[mapping.sku] || ''}`;
  };

  const handleAnalyzeAndPreview = () => {
    previewWithStatusMutation.mutate();
  };

  const handleConfirmAndProcess = async () => {
    // Start with current rows, applying any already-extracted images from state
    // APPEND state images to existing row.imageUrls to preserve all extracted URLs
    let rowsWithImages = editablePreviewRows.map((row, idx) => {
      const stateImageUrl = extractedImages[idx];
      const stateImageUrls = extractedImageArrays[idx] || [];
      const existingUrls = Array.isArray(row.imageUrls) ? row.imageUrls : [];
      // Combine all image sources: state arrays, state single, existing row arrays
      const combinedUrls = new Set<string>();
      stateImageUrls.forEach((url: string) => url && combinedUrls.add(url));
      if (stateImageUrl) combinedUrls.add(stateImageUrl);
      existingUrls.forEach((url: string) => url && combinedUrls.add(url));
      if (row.imageUrl && row.imageUrl !== 'https://via.placeholder.com/400x400?text=No+Image') {
        combinedUrls.add(row.imageUrl);
      }
      const mergedUrls = Array.from(combinedUrls);
      return {
        ...row,
        imageUrl: mergedUrls[0] || row.imageUrl,
        imageUrls: mergedUrls.length > 0 ? mergedUrls : row.imageUrls
      };
    });
    
    // If there are embedded images to extract (not yet extracted), do it first
    if (preview?.imageColumnInfo && file && Object.keys(extractedImages).length === 0 && !extractImagesMutation.isPending) {
      toast({
        title: "Extracting images...",
        description: `Uploading ${preview.imageColumnInfo.imageCount} images to Google Drive`,
      });
      
      try {
        const result = await extractImagesMutation.mutateAsync({ 
          uploadedFile: file, 
          targetColumn: preview.imageColumnInfo.columnName,
          articleColumnName: mapping.sku // Use SKU column for article number naming
        });
        
        // Update rows with extracted image URLs - APPEND to existing, don't replace
        if (result.rowImageMap) {
          rowsWithImages = editablePreviewRows.map((row, idx) => {
            const extractedUrl = result.rowImageMap[idx];
            const extractedUrls = result.rowImageArrayMap?.[idx] || [];
            const existingUrls = Array.isArray(row.imageUrls) ? row.imageUrls : [];
            const combinedUrls = new Set<string>();
            extractedUrls.forEach((url: string) => url && combinedUrls.add(url));
            if (extractedUrl) combinedUrls.add(extractedUrl);
            existingUrls.forEach((url: string) => url && combinedUrls.add(url));
            if (row.imageUrl && row.imageUrl !== 'https://via.placeholder.com/400x400?text=No+Image') {
              combinedUrls.add(row.imageUrl);
            }
            const mergedUrls = Array.from(combinedUrls);
            return {
              ...row,
              imageUrl: mergedUrls[0] || row.imageUrl,
              imageUrls: mergedUrls.length > 0 ? mergedUrls : row.imageUrls
            };
          });
          // Also update state for UI
          setEditablePreviewRows(rowsWithImages);
        }
        
        toast({
          title: "✓ Images extracted!",
          description: result.message,
        });
      } catch (error: any) {
        toast({
          title: "Image extraction failed",
          description: error.message || "Failed to extract images, but continuing with upload...",
          variant: "destructive",
        });
      }
    }
    
    // Filter out skipped rows and use the rows with injected image URLs
    const activeRows = rowsWithImages.filter((_, idx) => !skippedRows.has(idx));
    const newSKUs = activeRows.filter((r: any) => r.status === 'new');
    
    if (newSKUs.length > 0 && autoCreateProducts) {
      // Auto-create all new products - CONSOLIDATE BY SKU first
      toast({
        title: "Creating products...",
        description: `Auto-creating products from ${newSKUs.length} rows`,
      });
      
      try {
        // Group all rows by SKU to consolidate into single product objects
        const skuGroupedRows: Record<string, any[]> = {};
        for (const row of newSKUs) {
          if (!skuGroupedRows[row.sku]) {
            skuGroupedRows[row.sku] = [];
          }
          skuGroupedRows[row.sku].push(row);
        }
        
        const uniqueSKUs = Object.keys(skuGroupedRows);
        let createdCount = 0;
        
        for (const [sku, rows] of Object.entries(skuGroupedRows)) {
          // Use first row as base for product attributes
          const firstRow = rows[0];
          
          // Aggregate all colors from all rows for this SKU
          const colorsSet = new Set<string>();
          rows.forEach(r => {
            const color = r.color || r.rawData?.colourway || 'Default';
            if (color && color !== 'Default') colorsSet.add(color);
          });
          const colors = colorsSet.size > 0 ? Array.from(colorsSet) : ['Default'];
          
          // Aggregate all sizes with stock from all rows for this SKU
          // If size is invalid or missing, use default sizes [6, 7, 8, 9, 10, 11, 12]
          const sizeStockMap: Record<string, number> = {};
          let hasValidSize = false;
          rows.forEach(r => {
            if (isValidSize(r.size)) {
              hasValidSize = true;
              const size = String(r.size).trim();
              const stockVal = parseInt(r.newStock);
              const stock = isNaN(stockVal) ? 50 : stockVal;
              sizeStockMap[size] = (sizeStockMap[size] || 0) + stock;
            }
          });
          
          // If no valid sizes found, use default sizes with stock of 50 each
          if (!hasValidSize) {
            DEFAULT_SIZES.forEach(size => {
              sizeStockMap[size] = 50;
            });
          }
          
          const availableSizes = Object.entries(sizeStockMap).map(([size, stock]) => ({
            size,
            stock
          }));
          
          // Build stockMatrix: { color: { size: quantity } }
          const stockMatrix: Record<string, Record<string, number>> = {};
          rows.forEach(r => {
            const color = r.color || r.rawData?.colourway || 'Default';
            const stockVal = parseInt(r.newStock);
            const stock = isNaN(stockVal) ? 50 : stockVal;
            
            if (isValidSize(r.size)) {
              const size = String(r.size).trim();
              if (!stockMatrix[color]) stockMatrix[color] = {};
              stockMatrix[color][size] = (stockMatrix[color][size] || 0) + stock;
            } else {
              // Use default sizes with 50 stock each
              if (!stockMatrix[color]) stockMatrix[color] = {};
              DEFAULT_SIZES.forEach(size => {
                stockMatrix[color][size] = 50;
              });
            }
          });
          
          // Use default values if column not mapped or empty - check edited (_) fields first
          const brand = firstRow._brand || firstRow.brand || firstRow.rawData?.brand || defaultValues.brand;
          const category = firstRow._category || firstRow.category || firstRow.rawData?.category || defaultValues.category;
          const name = firstRow._name || firstRow.name || firstRow.rawData?.name || `${brand} - ${sku}`;
          const gender = firstRow._gender || firstRow.gender || firstRow.rawData?.gender || defaultValues.gender;
          const wholesalePrice = String(firstRow._wholesalePrice || firstRow.wholesalePrice || firstRow.rawData?.wholesalePrice || defaultValues.wholesalePrice || '0');
          const retailPrice = String(firstRow._retailPrice || firstRow.retailPrice || firstRow.rawData?.retailPrice || defaultValues.retailPrice || '0');
          const minOrderVal = parseInt(firstRow._minOrder || firstRow.minOrder || firstRow.rawData?.minOrder || defaultValues.minOrder);
          const minOrder = isNaN(minOrderVal) ? 1 : minOrderVal;
          const description = firstRow._description || firstRow.description || firstRow.rawData?.description || defaultValues.description || '';
          
          // Aggregate ALL imageUrls from ALL rows for this SKU (consistent with checkMissingMutation)
          const imageUrlsSet = new Set<string>();
          rows.forEach(r => {
            if (r.imageUrl && r.imageUrl !== 'https://via.placeholder.com/400x400?text=No+Image') {
              imageUrlsSet.add(r.imageUrl);
            }
            if (Array.isArray(r.imageUrls)) {
              r.imageUrls.forEach((url: string) => {
                if (url && url !== 'https://via.placeholder.com/400x400?text=No+Image') {
                  imageUrlsSet.add(url);
                }
              });
            }
          });
          const imageUrls = imageUrlsSet.size > 0 ? Array.from(imageUrlsSet) : [];
          const imageUrl = imageUrls[0] || defaultValues.imageUrl || 'https://via.placeholder.com/400x400?text=No+Image';
          
          const productData = {
            sku,
            barcode: firstRow._barcode || firstRow.barcode || '',
            name,
            brand,
            category,
            gender,
            wholesalePrice,
            retailPrice,
            minOrder,
            division: firstRow._division || firstRow.division || firstRow.rawData?.division || defaultValues.division || '',
            countryOfOrigin: firstRow._countryOfOrigin || firstRow.countryOfOrigin || firstRow.rawData?.countryOfOrigin || '',
            imageUrl,
            imageUrls,
            description,
            colors,
            availableSizes,
            stockMatrix,
            inStock: true,
            stockLevel: 'in_stock',
            collections: [],
            isPreOrder: false,
            // Include additional metadata fields - check edited (_) fields first
            keyCategory: firstRow._keyCategory || firstRow.keyCategory || firstRow.rawData?.keyCategory || null,
            colourway: firstRow._colourway || firstRow.colourway || firstRow.rawData?.colourway || (colors.length > 0 ? colors[0] : null),
            ageGroup: firstRow._ageGroup || firstRow.ageGroup || firstRow.rawData?.ageGroup || null,
            corporateMarketingLine: firstRow._corporateMarketingLine || firstRow.corporateMarketingLine || firstRow.rawData?.corporateMarketingLine || null,
            productLine: firstRow._productLine || firstRow.productLine || firstRow.rawData?.productLine || null,
            productType: firstRow._productType || firstRow.productType || firstRow.rawData?.productType || null,
            sportsCategory: firstRow._sportsCategory || firstRow.sportsCategory || firstRow.rawData?.sportsCategory || null,
            moq: (() => { const val = parseInt(firstRow._moq || firstRow.moq || firstRow.rawData?.moq); return isNaN(val) ? null : val; })(),
            conditions: firstRow._conditions || firstRow.conditions || firstRow.rawData?.conditions || null,
            materialComposition: firstRow._materialComposition || firstRow.materialComposition || firstRow.rawData?.materialComposition || null,
            discount: firstRow._discount || firstRow.discount || firstRow.rawData?.discount || '0',
            rawAttributes: firstRow.rawData || firstRow,
          };
          
          console.log('Creating consolidated product:', { sku, name, brand, colors, sizesCount: availableSizes.length });
          
          const response = await apiRequest('/api/stock/upload/create-product', 'POST', productData);
          const result = await response.json();
          
          if (!response.ok) {
            throw new Error(result.details || result.message || 'Failed to create product');
          }
          createdCount++;
        }
        
        toast({
          title: "✓ Products created",
          description: `Successfully created ${createdCount} products from ${newSKUs.length} rows`,
        });
        
        // Now proceed to processing with the rows that have image URLs
        processMutation.mutate(rowsWithImages);
      } catch (error: any) {
        console.error('Product creation error:', error);
        toast({
          title: "Failed to create products",
          description: error.message || "Failed to auto-create products. Check console for details.",
          variant: "destructive",
        });
        setStep('preview-confirm');
      }
    } else if (newSKUs.length > 0 && !autoCreateProducts) {
      // Manual product creation flow - go to ready-to-process
      setStep('ready-to-process');
      checkMissingMutation.mutate();
    } else {
      // All SKUs exist, proceed directly to processing with image URLs
      processMutation.mutate(rowsWithImages);
    }
  };

  const handleCheckAndProcess = () => {
    // No required fields for now - allow processing with any mapping
    const hasSomeMapping = Object.values(mapping).some(v => v !== '');
    if (!hasSomeMapping) {
      toast({
        title: "No columns mapped",
        description: "Please map at least one column to continue",
        variant: "destructive",
      });
      return;
    }
    // Go to ready-to-process step and trigger check
    setStep('ready-to-process');
    checkMissingMutation.mutate();
  };

  // Cell editing functions (matching PreOrder style with _field prefix)
  const handleCellEdit = (rowIndex: number, field: string, value: string) => {
    setEditablePreviewRows(prev => {
      const updated = [...prev];
      updated[rowIndex] = {
        ...updated[rowIndex],
        [`_${field}`]: value
      };
      return updated;
    });
  };

  const handleFillDown = (field: string, startIndex: number) => {
    if (startIndex >= editablePreviewRows.length) return;
    
    const row = editablePreviewRows[startIndex];
    const value = row[`_${field}`] || row[field] || defaultValues[field as keyof typeof defaultValues];
    
    setEditablePreviewRows(prev => {
      const updated = [...prev];
      for (let i = startIndex + 1; i < updated.length; i++) {
        updated[i] = {
          ...updated[i],
          [`_${field}`]: value
        };
      }
      return updated;
    });
    
    toast({
      title: "Fill down applied",
      description: `Filled ${editablePreviewRows.length - startIndex - 1} cells`,
    });
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setRawPreview(null);
    setSelectedHeaderRow(0);
    setMapping({ 
      sku: '', 
      barcode: '', 
      name: '',
      brand: '',
      category: '',
      gender: '',
      wholesalePrice: '',
      retailPrice: '',
      minOrder: '',
      division: '',
      countryOfOrigin: '',
      stock: '', 
      color: '', 
      size: '',
      imageUrl: '',
      description: '',
      embeddedImages: '',
      keyCategory: '',
      colourway: '',
      ageGroup: '',
      corporateMarketingLine: '',
      productLine: '',
      productType: '',
      sportsCategory: '',
      moq: '',
      conditions: '',
      materialComposition: '',
      discount: ''
    });
    setStep('upload');
    setResult(null);
    setPreviewData(null);
    setMissingCheck(null);
    setCreatedProducts(new Set());
    setCreatingProductIndex(null);
    setExtractedImages({});
    setExtractedImageArrays({});
    setNamingPattern([
      { type: 'field', value: 'Brand' },
      { type: 'text', value: ' - ' },
      { type: 'field', value: 'UPC' }
    ]);
  };

  // Template management functions
  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      toast({
        title: "Template name required",
        description: "Please enter a name for your mapping template",
        variant: "destructive",
      });
      return;
    }
    
    const newTemplates = [...savedTemplates.filter(t => t.name !== templateName), { name: templateName.trim(), mapping }];
    setSavedTemplates(newTemplates);
    localStorage.setItem('stockUploadMappingTemplates', JSON.stringify(newTemplates));
    setTemplateName('');
    
    toast({
      title: "Template saved",
      description: `Mapping template "${templateName}" saved successfully`,
    });
  };

  const handleLoadTemplate = (template: { name: string; mapping: ColumnMapping }) => {
    setMapping(template.mapping);
    toast({
      title: "Template loaded",
      description: `Mapping template "${template.name}" applied`,
    });
  };

  const handleDeleteTemplate = (name: string) => {
    const newTemplates = savedTemplates.filter(t => t.name !== name);
    setSavedTemplates(newTemplates);
    localStorage.setItem('stockUploadMappingTemplates', JSON.stringify(newTemplates));
    toast({
      title: "Template deleted",
      description: `Mapping template "${name}" removed`,
    });
  };

  // Handle mapping change
  const handleMappingChange = (value: string, col: string) => {
    const newMapping = {...mapping};
    
    // Clear any existing mapping for this column
    Object.keys(newMapping).forEach(key => {
      if (newMapping[key as keyof ColumnMapping] === col) {
        newMapping[key as keyof ColumnMapping] = '';
      }
    });
    
    if (value !== 'none') {
      newMapping[value as keyof ColumnMapping] = col;
    }
    
    setMapping(newMapping);
  };

  return (
    <div className="space-y-6">
      {/* Upload Step */}
      {step === 'upload' && (
        <Card className="p-8">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'
            }`}
          >
            <Upload className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold mb-2">Upload Stock File</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Drag and drop your CSV or Excel file here, or click to browse
            </p>
            <Input
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
              data-testid="input-file-upload"
            />
            <Button asChild variant="outline">
              <label htmlFor="file-upload" className="cursor-pointer" data-testid="button-browse-file">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Browse Files
              </label>
            </Button>
          </div>
        </Card>
      )}

      {/* Row Selection Step (like PreOrder) */}
      {step === 'row-selection' && rawPreview && (
        <Card className="p-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-8 h-8 text-blue-600" />
                <div>
                  <h2 className="text-2xl font-bold">Select Header Row</h2>
                  <p className="text-sm text-muted-foreground">Click on the row that contains your column headers</p>
                </div>
              </div>
              <Badge variant="outline">{rawPreview?.fileName}</Badge>
            </div>

            <div className="flex items-center justify-between mb-6">
              <Alert className="flex-1">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>
                  Your file has {rawPreview?.totalRows} rows. Click on the row number below that contains your column headers (usually row 1).
                </AlertDescription>
              </Alert>
              
              {rawPreview?.imageColumnInfo && (
                <Badge variant="outline" className="text-green-600 border-green-300 ml-4">
                  <Image className="w-3 h-3 mr-1" />
                  {rawPreview.imageColumnInfo.imageCount} images detected
                </Badge>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden mb-6">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-100">
                      <TableHead className="w-16 text-center sticky left-0 top-0 bg-gray-100 z-20">Row</TableHead>
                      {rawPreview.rawRows[0]?.map((_: any, colIndex: number) => (
                        <TableHead key={colIndex} className="sticky top-0 bg-gray-100 z-10 text-center min-w-[120px]">
                          <div className="text-xs text-muted-foreground">{String.fromCharCode(65 + colIndex)}</div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rawPreview.rawRows.map((row: any[], rowIndex: number) => (
                      <TableRow
                        key={rowIndex}
                        className={`cursor-pointer transition-colors ${
                          selectedHeaderRow === rowIndex
                            ? 'bg-blue-100 hover:bg-blue-200'
                            : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setSelectedHeaderRow(rowIndex)}
                        data-testid={`row-select-${rowIndex}`}
                      >
                        <TableCell className={`text-center font-medium sticky left-0 z-10 ${
                          selectedHeaderRow === rowIndex ? 'bg-blue-100' : 'bg-white'
                        }`}>
                          {selectedHeaderRow === rowIndex && (
                            <Check className="w-4 h-4 inline mr-1 text-blue-600" />
                          )}
                          {rowIndex + 1}
                        </TableCell>
                        {row.map((cell: any, colIndex: number) => (
                          <TableCell key={colIndex} className="text-sm truncate max-w-[150px]">
                            {String(cell || '')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex gap-2 justify-between">
              <Button variant="outline" onClick={handleReset} data-testid="button-back-upload">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Upload
              </Button>
              <Button 
                onClick={() => {
                  if (rawPreview) {
                    setHeaderMutation.mutate({
                      tempDataId: rawPreview.tempDataId,
                      headerRowIndex: selectedHeaderRow
                    });
                  }
                }}
                disabled={setHeaderMutation.isPending}
                data-testid="button-continue-mapping"
              >
                {setHeaderMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Continue to Mapping
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Mapping Step */}
      {step === 'mapping' && preview && (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Map Columns to Database Fields</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Select the database field for each column
                </p>
              </div>
              <div className="flex gap-3">
                <Button onClick={handleReset} variant="outline" data-testid="button-cancel-mapping">
                  Cancel
                </Button>
                <Button onClick={handleShowPreview} data-testid="button-show-preview">
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Next: Preview Upload
                </Button>
              </div>
            </div>

            {/* Preview Table with Column Mapping - identical to PreOrderUpload */}
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px] text-center bg-gray-100 sticky left-0 z-10">#</TableHead>
                      {preview.columns.map((col, index) => {
                        const getFieldForColumn = (column: string): string => {
                          const entry = Object.entries(mapping).find(([_, c]) => c === column);
                          return entry ? entry[0] : 'none';
                        };
                        const currentField = getFieldForColumn(col);
                        const hasExtractedImages = Object.keys(extractedImages).length > 0;
                        const isImageColumn = preview?.imageColumnInfo?.columnName === col;
                        
                        return (
                          <TableHead key={col} className="w-[150px] p-2">
                            <Select 
                              value={currentField} 
                              onValueChange={(v) => handleMappingChange(v, col)}
                            >
                              <SelectTrigger 
                                className={`h-8 text-xs ${
                                  currentField !== 'none' ? 'border-green-500 bg-green-50' : 
                                  isImageColumn && hasExtractedImages ? 'border-green-300 bg-green-50' :
                                  isImageColumn ? 'border-blue-300 bg-blue-50' : ''
                                }`}
                                data-testid={`select-mapping-${index}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">- Not Mapped -</SelectItem>
                                <SelectItem value="sku">UPC/SKU *</SelectItem>
                                <SelectItem value="barcode">Barcode</SelectItem>
                                <SelectItem value="name">Product Name</SelectItem>
                                <SelectItem value="brand">Brand</SelectItem>
                                <SelectItem value="category">Category</SelectItem>
                                <SelectItem value="gender">Gender</SelectItem>
                                <SelectItem value="color">Color</SelectItem>
                                <SelectItem value="size">Size</SelectItem>
                                <SelectItem value="imageUrl">Image URL</SelectItem>
                                <SelectItem value="description">Description</SelectItem>
                                <SelectItem value="division">Division</SelectItem>
                                <SelectItem value="countryOfOrigin">Country of Origin</SelectItem>
                                <SelectItem value="wholesalePrice">Wholesale Price</SelectItem>
                                <SelectItem value="retailPrice">Retail Price</SelectItem>
                                <SelectItem value="minOrder">Min Order</SelectItem>
                                <SelectItem value="stock">Stock Qty</SelectItem>
                                <SelectItem value="keyCategory">Key Category</SelectItem>
                                <SelectItem value="colourway">Colourway</SelectItem>
                                <SelectItem value="ageGroup">Age Group</SelectItem>
                                <SelectItem value="corporateMarketingLine">Corporate Marketing Line</SelectItem>
                                <SelectItem value="productLine">Product Line</SelectItem>
                                <SelectItem value="productType">Product Type</SelectItem>
                                <SelectItem value="sportsCategory">Sports Category</SelectItem>
                                <SelectItem value="moq">MOQ</SelectItem>
                                <SelectItem value="conditions">Conditions</SelectItem>
                                <SelectItem value="materialComposition">Material Composition</SelectItem>
                                <SelectItem value="discount">Discount</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableHead>
                        );
                      })}
                    </TableRow>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-[50px] text-center font-bold bg-gray-100 sticky left-0 z-10">Row</TableHead>
                      {preview.columns.map((col) => (
                        <TableHead key={col} className="w-[150px] font-bold truncate" title={col}>
                          {col}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.previewRows.slice(0, 10).map((row, rowIndex) => (
                      <TableRow key={rowIndex} className="hover:bg-gray-50">
                        <TableCell className="w-[50px] text-center font-mono bg-gray-50 sticky left-0 z-10">
                          {rowIndex + 1}
                        </TableCell>
                        {preview.columns.map((col, colIndex) => (
                          <TableCell key={colIndex} className="w-[150px] text-sm truncate" title={row[col] || ''}>
                            {row[col] || <span className="text-gray-300 italic">empty</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            
            <div className="mt-4 text-sm text-muted-foreground">
              <strong>Preview:</strong> First 10 rows of {preview.totalRows} total rows
            </div>
          </Card>

          {/* Default Values for New Products */}
          <Card className="p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Default Values for All Missing Fields</h3>
              <p className="text-sm text-muted-foreground mt-1">
                These values will be used for ANY field that is empty or not mapped. You can always proceed - missing fields will use these defaults.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="default-brand" className="text-sm font-medium">
                  Brand
                </Label>
                <Select
                  value={defaultValues.brand}
                  onValueChange={(value) => setDefaultValues({...defaultValues, brand: value})}
                >
                  <SelectTrigger id="default-brand" data-testid="select-default-brand">
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.filter((b: any) => b.isActive).map((brand: any) => (
                      <SelectItem key={brand.id} value={brand.name}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="default-category" className="text-sm font-medium">
                  Category
                </Label>
                <Select
                  value={defaultValues.category}
                  onValueChange={(value) => setDefaultValues({...defaultValues, category: value})}
                >
                  <SelectTrigger id="default-category" data-testid="select-default-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.filter((c: any) => c.isActive).map((category: any) => (
                      <SelectItem key={category.id} value={category.name}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="default-name" className="text-sm font-medium">
                  Product Name (leave empty for "Brand - SKU")
                </Label>
                <Input
                  id="default-name"
                  value={defaultValues.name}
                  onChange={(e) => setDefaultValues({...defaultValues, name: e.target.value})}
                  placeholder='Will auto-construct as "Brand - SKU"'
                  data-testid="input-default-name"
                />
              </div>

              <div>
                <Label htmlFor="default-gender" className="text-sm font-medium">
                  Gender
                </Label>
                <Select
                  value={defaultValues.gender}
                  onValueChange={(value) => setDefaultValues({...defaultValues, gender: value})}
                >
                  <SelectTrigger id="default-gender" data-testid="select-default-gender">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Men">Men</SelectItem>
                    <SelectItem value="Women">Women</SelectItem>
                    <SelectItem value="Unisex">Unisex</SelectItem>
                    <SelectItem value="Kids">Kids</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="default-wholesale" className="text-sm font-medium">
                  Wholesale Price
                </Label>
                <Input
                  id="default-wholesale"
                  type="number"
                  step="0.01"
                  value={defaultValues.wholesalePrice}
                  onChange={(e) => setDefaultValues({...defaultValues, wholesalePrice: e.target.value})}
                  placeholder="0.00"
                  data-testid="input-default-wholesale"
                />
              </div>

              <div>
                <Label htmlFor="default-retail" className="text-sm font-medium">
                  Retail Price
                </Label>
                <Input
                  id="default-retail"
                  type="number"
                  step="0.01"
                  value={defaultValues.retailPrice}
                  onChange={(e) => setDefaultValues({...defaultValues, retailPrice: e.target.value})}
                  placeholder="0.00"
                  data-testid="input-default-retail"
                />
              </div>

              <div>
                <Label htmlFor="default-minorder" className="text-sm font-medium">
                  Min Order Quantity
                </Label>
                <Input
                  id="default-minorder"
                  type="number"
                  value={defaultValues.minOrder}
                  onChange={(e) => setDefaultValues({...defaultValues, minOrder: e.target.value})}
                  placeholder="1"
                  data-testid="input-default-minorder"
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="default-image" className="text-sm font-medium">
                  Image URL
                </Label>
                <Input
                  id="default-image"
                  value={defaultValues.imageUrl}
                  onChange={(e) => setDefaultValues({...defaultValues, imageUrl: e.target.value})}
                  placeholder="https://via.placeholder.com/400x400?text=No+Image"
                  data-testid="input-default-image"
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="default-description" className="text-sm font-medium">
                  Description
                </Label>
                <Input
                  id="default-description"
                  value={defaultValues.description}
                  onChange={(e) => setDefaultValues({...defaultValues, description: e.target.value})}
                  placeholder="No description available"
                  data-testid="input-default-description"
                />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Auto-Naming Step (like PreOrder) */}
      {step === 'auto-naming' && (
        <Card className="p-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <Sparkles className="w-8 h-8 text-yellow-600" />
              <h2 className="text-2xl font-bold">Auto-naming Configuration</h2>
            </div>

            <p className="text-muted-foreground mb-6">
              Build a naming pattern for your products by combining fields.
            </p>

            <div className="space-y-6">
              <div>
                <Label className="mb-2 block">Preset Patterns</Label>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => applyPreset('brand-upc')}
                    data-testid="button-preset-brand-upc"
                  >
                    Brand-UPC
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => applyPreset('brand-category-upc')}
                    data-testid="button-preset-brand-category-upc"
                  >
                    Brand-Category-UPC
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => applyPreset('name-color')}
                    data-testid="button-preset-name-color"
                  >
                    Name Color
                  </Button>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Current Pattern</Label>
                <div className="flex flex-wrap gap-2 p-4 border rounded-lg min-h-[60px]">
                  {namingPattern.map((token, index) => (
                    <div 
                      key={index} 
                      className={`flex items-center gap-2 px-3 py-1 rounded ${
                        token.type === 'field' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      <span className="text-sm font-medium">{token.value}</span>
                      <button
                        onClick={() => removeNamingToken(index)}
                        className="hover:text-red-600"
                        data-testid={`button-remove-token-${index}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Add Tokens</Label>
                <div className="grid grid-cols-4 gap-2">
                  <Button variant="outline" size="sm" onClick={() => addNamingToken('field', 'UPC')}>+ UPC</Button>
                  <Button variant="outline" size="sm" onClick={() => addNamingToken('field', 'Brand')}>+ Brand</Button>
                  <Button variant="outline" size="sm" onClick={() => addNamingToken('field', 'Category')}>+ Category</Button>
                  <Button variant="outline" size="sm" onClick={() => addNamingToken('field', 'Name')}>+ Name</Button>
                  <Button variant="outline" size="sm" onClick={() => addNamingToken('field', 'Color')}>+ Color</Button>
                  <Button variant="outline" size="sm" onClick={() => addNamingToken('field', 'Size')}>+ Size</Button>
                  <Button variant="outline" size="sm" onClick={() => addNamingToken('field', 'Gender')}>+ Gender</Button>
                  <Button variant="outline" size="sm" onClick={() => addNamingToken('text', ' ')}>+ Space</Button>
                  <Button variant="outline" size="sm" onClick={() => addNamingToken('text', ' - ')}>+ Dash</Button>
                  <Button variant="outline" size="sm" onClick={() => addNamingToken('text', ' | ')}>+ Pipe</Button>
                </div>
              </div>

              {preview && preview.previewRows && preview.previewRows.length > 0 && (
                <div>
                  <Label className="mb-2 block">Preview</Label>
                  <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                    {preview.previewRows.slice(0, 3).map((row: any, index: number) => (
                      <div key={index} className="text-sm">
                        <span className="text-muted-foreground">Row {index + 1}:</span>{' '}
                        <span className="font-medium">{generateProductName(row, namingPattern)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-8 justify-between">
              <Button variant="outline" onClick={() => setStep('mapping')} data-testid="button-back-mapping">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleAnalyzeAndPreview} disabled={previewWithStatusMutation.isPending} data-testid="button-analyze-preview">
                {previewWithStatusMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                Analyze & Preview
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Preview & Edit Step - matching PreOrder style exactly */}
      {step === 'preview-confirm' && previewData && previewData.previewRows && (
        <Card className="p-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Preview & Edit</h2>
              <div className="flex gap-2">
                <Badge variant="default" data-testid="badge-new-products">
                  {previewData.newCount || 0} New
                </Badge>
                <Badge variant="secondary" data-testid="badge-existing-products">
                  {previewData.existingCount || 0} Existing
                </Badge>
              </div>
            </div>

            {(previewData.newCount > 0 || previewData.existingCount > 0) && (
              <Alert className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {previewData.newCount > 0 && `${previewData.newCount} products will be created. `}
                  {previewData.existingCount > 0 && `${previewData.existingCount} products already exist and will be updated.`}
                </AlertDescription>
              </Alert>
            )}

            <ScrollArea className="h-[500px] border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editablePreviewRows.slice(0, 50).map((row, index) => (
                    <TableRow key={index} data-testid={`row-preview-${index}`}>
                      <TableCell>
                        {row.status === 'new' ? (
                          <Badge variant="default" data-testid={`badge-status-new-${index}`}>NEW</Badge>
                        ) : (
                          <Badge variant="secondary" data-testid={`badge-status-existing-${index}`}>EXISTS</Badge>
                        )}
                      </TableCell>
                      <TableCell>{row.sku}</TableCell>
                      <TableCell>
                        <Input
                          value={row._category || row.category || defaultValues.category}
                          onChange={(e) => handleCellEdit(index, 'category', e.target.value)}
                          className="w-32"
                          data-testid={`input-category-${index}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row._gender || row.gender || defaultValues.gender}
                          onChange={(e) => handleCellEdit(index, 'gender', e.target.value)}
                          className="w-32"
                          data-testid={`input-gender-${index}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleFillDown('category', index)}
                          data-testid={`button-filldown-${index}`}
                        >
                          Fill Down
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex gap-2 mt-6">
              <Button variant="outline" onClick={() => setStep('auto-naming')} data-testid="button-back-autonaming">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button onClick={() => setStep('ready-to-process')} data-testid="button-proceed-process">
                Upload & Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Ready to Process Step - matches PreOrder's collection-info step */}
      {step === 'ready-to-process' && (
        <Card className="p-8">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Ready to Process Upload</h2>

            <div className="space-y-4 mb-6">
              <Alert>
                <CheckCircle2 className="w-4 h-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p><strong>File:</strong> {preview?.fileName || 'Stock Upload'}</p>
                    <p><strong>Total Products:</strong> {editablePreviewRows.length} items</p>
                    <p><strong>New Products:</strong> {editablePreviewRows.filter(r => r.status === 'new').length}</p>
                    <p><strong>Existing Products:</strong> {editablePreviewRows.filter(r => r.status === 'existing').length}</p>
                  </div>
                </AlertDescription>
              </Alert>

              <p className="text-muted-foreground">
                Review your upload details above. Click "Process Upload" to update stock levels. New products will be auto-created from your Excel data.
              </p>
            </div>

            <div className="flex gap-2 mt-6">
              <Button variant="outline" onClick={() => setStep('preview-confirm')} data-testid="button-back-preview">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button 
                onClick={() => checkMissingMutation.mutate()} 
                disabled={checkMissingMutation.isPending || processMutation.isPending}
                data-testid="button-process-upload"
              >
                {(checkMissingMutation.isPending || processMutation.isPending) ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                Process Upload
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Complete Step */}
      {step === 'complete' && result && (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="text-center mb-6">
              {result.errors?.length > 0 ? (
                <>
                  <AlertCircle className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
                  <h3 className="text-lg font-semibold mb-2">Import Completed with Warnings</h3>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
                  <h3 className="text-lg font-semibold mb-2">Import Successful!</h3>
                </>
              )}
              
              <div className="grid grid-cols-3 gap-4 mt-6 max-w-2xl mx-auto">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-700">{result.total}</div>
                  <div className="text-sm text-blue-600">Total Rows</div>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-700">{result.processed}</div>
                  <div className="text-sm text-green-600">Successfully Updated</div>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-700">{result.total - result.processed}</div>
                  <div className="text-sm text-red-600">Errors</div>
                </div>
              </div>
            </div>

            {/* Detailed Results Table */}
            {result.results && result.results.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold">Detailed Results</h4>
                  <Button variant="outline" size="sm" onClick={handleReset} data-testid="button-upload-another">
                    Upload Another File
                  </Button>
                </div>
                
                <div className="border rounded-lg overflow-hidden">
                  <div className="max-h-[500px] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-muted z-10">
                        <TableRow>
                          <TableHead className="w-[60px]">Row</TableHead>
                          <TableHead className="w-[80px]">Status</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Product Name</TableHead>
                          <TableHead>Color</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead className="text-right">Previous</TableHead>
                          <TableHead className="text-right">New</TableHead>
                          <TableHead className="text-right">Difference</TableHead>
                          <TableHead>Message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.results.map((row: any, idx: number) => (
                          <TableRow 
                            key={idx}
                            className={row.status === 'success' ? 'bg-green-50/50' : 'bg-red-50/50'}
                            data-testid={`result-row-${idx}`}
                          >
                            <TableCell className="font-mono text-sm">{row.rowNumber}</TableCell>
                            <TableCell>
                              {row.status === 'success' ? (
                                <Badge variant="default" className="bg-green-500">
                                  <Check className="w-3 h-3 mr-1" />
                                  Success
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <X className="w-3 h-3 mr-1" />
                                  Error
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono font-semibold">{row.sku}</TableCell>
                            <TableCell className="text-sm">{row.productName || '-'}</TableCell>
                            <TableCell className="text-sm">{row.color}</TableCell>
                            <TableCell className="text-sm">{row.size}</TableCell>
                            <TableCell className="text-right font-mono">{row.previousStock}</TableCell>
                            <TableCell className="text-right font-mono font-semibold">{row.newStock}</TableCell>
                            <TableCell className={`text-right font-mono ${row.difference > 0 ? 'text-green-600' : row.difference < 0 ? 'text-red-600' : ''}`}>
                              {row.difference > 0 ? `+${row.difference}` : row.difference}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.message}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

interface MissingSKUFormProps {
  skuData: MissingSKUData;
  brands: any[];
  categories: any[];
  onCancel: () => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
}

function MissingSKUForm({ 
  skuData, 
  brands,
  categories,
  onCancel,
  onSubmit,
  isPending
}: MissingSKUFormProps) {
  const form = useForm<z.infer<typeof quickProductSchema>>({
    resolver: zodResolver(quickProductSchema),
    defaultValues: {
      sku: skuData.sku,
      barcode: skuData.barcode || '',
      name: '',
      brand: '',
      category: '',
      gender: 'unisex',
      wholesalePrice: '',
      retailPrice: '',
      minOrder: '1',
      division: '',
      countryOfOrigin: '',
      imageUrl: '',
      description: '',
      colors: [],
      availableSizes: [],
      inStock: true,
      stockLevel: 'in_stock'
    }
  });

  const handleSubmit = (values: z.infer<typeof quickProductSchema>) => {
    // Convert string fields to appropriate types
    const productData = {
      ...values,
      minOrder: parseInt(values.minOrder) || 1,
      wholesalePrice: values.wholesalePrice.toString(),
      retailPrice: values.retailPrice.toString(),
    };
    onSubmit(productData);
  };

  return (
    <Card className="p-4 bg-blue-50">
      <div className="mb-4">
        <h4 className="font-semibold">Create Product: {skuData.sku}</h4>
        <p className="text-sm text-muted-foreground">Fill in the product details</p>
      </div>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Name *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., Nike Air Max 90" data-testid="input-product-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="brand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-brand">
                        <SelectValue placeholder="Select brand" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {brands.map((brand) => (
                        <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-gender">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="men">Men</SelectItem>
                      <SelectItem value="women">Women</SelectItem>
                      <SelectItem value="kids">Kids</SelectItem>
                      <SelectItem value="unisex">Unisex</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="wholesalePrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Wholesale Price *</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" step="0.01" placeholder="0.00" data-testid="input-wholesale-price" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="retailPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Retail Price *</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" step="0.01" placeholder="0.00" data-testid="input-retail-price" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="minOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum Order *</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" placeholder="1" data-testid="input-min-order" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="division"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Division (RBU)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., Teamsport, Running" data-testid="input-division" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="countryOfOrigin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country of Origin (COO)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., KH, CN, VN" data-testid="input-coo" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Image URL</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="https://..." data-testid="input-image-url" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Product description" data-testid="input-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel-create-form">
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} data-testid="button-submit-create-product">
              {isPending ? "Creating..." : "Create Product"}
            </Button>
          </div>
        </form>
      </Form>
    </Card>
  );
}
