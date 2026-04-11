import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Upload, FileSpreadsheet, CheckCircle2, Heart, RefreshCw, ArrowRight, ArrowLeft, ArrowRightLeft,
  Plus, X, AlertCircle, Image, Clock, Package, Check, Box, ShoppingBag, Layers,
  Users, Ruler, Settings, Eye, Zap, FileUp, Loader2, StopCircle, Warehouse, BookOpen
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

// LocalStorage key for persisting upload state
const UPLOAD_STATE_KEY = 'preorder_upload_state';

// Upload type: 'preorder' for pre-order collections, 'stock' for warehouse inventory, 'catalogue' for product catalog (hidden until assigned to collection)
type UploadType = 'preorder' | 'stock' | 'catalogue';

// Persisted state interface - subset of state that can be serialized
// Note: previewData/rawPreviewData are NOT persisted - they are rehydrated from tempDataId
interface PersistedUploadState {
  uploadType: UploadType;
  mode: UploadMode | null;
  step: Step;
  selectedBrandId: string;
  selectedBrandName: string;
  tempDataId: string | null;
  selectedHeaderRow: number;
  mapping: ColumnMapping;
  detectedGenders: string[];
  detectedDivisions: string[];
  categoryMappings: Record<string, CategoryMapping>;
  genderNormalizationMap: Record<string, StandardizedGender>;
  divisionMappings: Record<string, 'Footwear' | 'Apparel' | 'Accessories'>;
  selectedSizeChartId: string;
  genderCartonConfig: GenderCartonConfig;
  cartonConfigMode: 'upload' | 'manual';
  manualSizesInput: Record<string, string>;
  individualSizeChartMappings: Array<{ key: string; sizes: string[] }>;
  genderToSizeChartRowMap: Record<string, string>;
  imageSource: 'embedded' | 'column' | 'zip' | 'none';
  urlPatternConfig: {
    findPattern: string;
    replaceImage2: string;
    replaceImage3: string;
    replaceImage4: string;
  };
  collectionName: string;
  collectionImage: string;
  fileName: string | null;
  savedAt: number;
}

type UploadMode = 'individual' | 'carton';

type Step = 
  | 'mode'           // Choose carton vs individual
  | 'brand'          // Select brand
  | 'upload'         // Upload Excel file
  | 'uploading'      // Processing file
  | 'mapping'        // Map columns
  | 'gender'         // Gender normalization
  | 'sizes'          // Size configuration (different for each mode)
  | 'division'       // Division classification (Footwear, Apparel, Accessories)
  | 'images'         // Image source configuration
  | 'review'         // Review products
  | 'collection'     // Collection details (preorder only)
  | 'processing'     // Final processing
  | 'complete';      // Done

// Product division types for classification - must match FILTER_OPTIONS.divisions in filterConstants.ts
const PRODUCT_DIVISIONS = ['Footwear', 'Apparel', 'Accessories'] as const;
type ProductDivision = typeof PRODUCT_DIVISIONS[number];

interface ProductUploadProps {
  uploadType?: UploadType;
}

interface StepInfo {
  id: Step;
  label: string;
  icon: React.ReactNode;
  description: string;
}

// Gender and Age Group Taxonomy
// Gender: Male, Female, Unisex only
const MAIN_CATEGORIES = ['Male', 'Female', 'Unisex'] as const;
type MainCategory = typeof MAIN_CATEGORIES[number];

// Gender options (kept for backward compatibility)
const KIDS_GENDERS = ['Male', 'Female', 'Unisex'] as const;
type KidsGender = typeof KIDS_GENDERS[number];

// Age Group: Adult, Junior, Kids, Infant
const KIDS_AGE_GROUPS = ['Adult', 'Junior', 'Kids', 'Infant'] as const;
type KidsAgeGroup = typeof KIDS_AGE_GROUPS[number];

// Combined mapping result for gender normalization
interface CategoryMapping {
  mainCategory: MainCategory;
  kidsGender?: KidsGender;
  kidsAgeGroup?: KidsAgeGroup;
  ageGroup?: string; // FIXED: Add ageGroup field for carton config matching (same as kidsAgeGroup)
}

// Gender options
const STANDARDIZED_GENDERS = [...MAIN_CATEGORIES] as const;
type StandardizedGender = typeof STANDARDIZED_GENDERS[number];

interface ColumnMapping {
  sku: string;
  barcode: string;
  name: string;
  brand: string;
  category: string;
  division: string;
  gender: string;
  ageGroup: string;
  size: string;
  image1: string;
  image2: string;
  image3: string;
  image4: string;
  description: string;
  wholesalePrice: string;
  retailPrice: string;
  cost: string;
  colourway: string;
  stock: string;  // Required for stock upload, optional for preorder
  currency: string;
  [key: string]: string;
}

interface CartonConfig {
  sizes: string[];
  unitsPerSize: Record<string, number>;
  mappedGender?: string;  // Maps to: Male, Female, Unisex, Kids
  mappedAgeGroup?: string; // Maps to: Adult, Junior, Kids, Infant
}

interface GenderCartonConfig {
  [gender: string]: CartonConfig;
}

interface RawPreviewData {
  totalRows: number;
  rawRows: any[][];
  fileName: string;
  tempDataId: string;
  imageColumnInfo?: {
    columnIndex: number;
    columnName: string;
    imageCount: number;
  };
}

interface PreviewData {
  totalRows: number;
  previewRows: any[];
  columns: string[];
  fileName: string;
  tempDataId: string;
}

interface JobProgress {
  stage: string;
  percent: number;
  message: string;
  imagesProcessed?: number;
  totalImages?: number;
  startedAt: number;
  completedAt?: number;
}

interface ProcessingResult {
  success: boolean;
  collectionId: string;
  collectionName: string;
  productsCreated: number;
  productsUpdated: number;
  errors: string[];
  processingTime: string;
}

interface StepTiming {
  stepId: Step;
  startedAt?: number;
  completedAt?: number;
  status: 'pending' | 'in-progress' | 'completed' | 'skipped';
}

// ============================================================================
// STEP DEFINITIONS
// ============================================================================

const getSteps = (mode: UploadMode, uploadType: UploadType = 'preorder'): StepInfo[] => {
  const baseSteps: StepInfo[] = [
    { id: 'mode', label: 'Upload Type', icon: <Layers className="w-4 h-4" />, description: 'Choose upload type' },
    { id: 'brand', label: 'Brand', icon: <Heart className="w-4 h-4" />, description: 'Select brand' },
    { id: 'upload', label: 'Upload', icon: <Upload className="w-4 h-4" />, description: 'Upload file' },
    { id: 'mapping', label: 'Columns', icon: <Settings className="w-4 h-4" />, description: 'Map columns' },
  ];

  const sizeStep: StepInfo = mode === 'carton' 
    ? { id: 'sizes', label: 'Carton Setup', icon: <Box className="w-4 h-4" />, description: 'Configure carton sizes & quantities' }
    : { id: 'sizes', label: 'Size Chart', icon: <Ruler className="w-4 h-4" />, description: 'Select size chart' };

  const genderStep: StepInfo = { id: 'gender', label: 'Gender', icon: <Users className="w-4 h-4" />, description: 'Normalize genders' };
  const divisionStep: StepInfo = { id: 'division', label: 'Division', icon: <Layers className="w-4 h-4" />, description: 'Product classification' };

  const finalSteps: StepInfo[] = [
    { id: 'images', label: 'Images', icon: <Image className="w-4 h-4" />, description: 'Image source' },
    { id: 'review', label: 'Review', icon: <Eye className="w-4 h-4" />, description: 'Review products' },
  ];

  // Add collection step for preorder and stock uploads only (not catalogue - products stay hidden)
  if (uploadType !== 'catalogue') {
    finalSteps.push({ id: 'collection', label: 'Collection', icon: <ShoppingBag className="w-4 h-4" />, description: 'Collection details' });
  }

  return [...baseSteps, sizeStep, genderStep, divisionStep, ...finalSteps];
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PreOrderUploadV2({ uploadType = 'preorder' }: ProductUploadProps) {
  const { toast } = useToast();
  
  // Determine if this is a stock upload (requires stock field)
  const isStockUpload = uploadType === 'stock';
  // Determine if this is a catalogue upload (products hidden until assigned to collection)
  const isCatalogueUpload = uploadType === 'catalogue';

  // Core state
  const [mode, setMode] = useState<UploadMode | null>(null);
  const [step, setStep] = useState<Step>('mode');
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [selectedBrandName, setSelectedBrandName] = useState<string>('');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('USD');

  // File & upload state
  const [file, setFile] = useState<File | null>(null);
  const [restoredFileName, setRestoredFileName] = useState<string | null>(null); // Used when restoring from localStorage
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const [rawPreview, setRawPreview] = useState<RawPreviewData | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [selectedHeaderRow, setSelectedHeaderRow] = useState<number>(0);

  // Mapping state
  const [mapping, setMapping] = useState<ColumnMapping>({
    sku: '', barcode: '', name: '', brand: '', category: '', division: '', gender: '', ageGroup: '',
    size: '', image1: '', image2: '', image3: '', image4: '', description: '', 
    wholesalePrice: '', retailPrice: '', cost: '', colourway: '', stock: '', currency: ''
  });

  // Gender normalization state - uses three-layer category system
  const [detectedGenders, setDetectedGenders] = useState<string[]>([]);
  const [categoryMappings, setCategoryMappings] = useState<Record<string, CategoryMapping>>({});
  // Legacy state for backward compatibility
  const [genderNormalizationMap, setGenderNormalizationMap] = useState<Record<string, StandardizedGender>>({});

  // Division mapping state - classify products by division (Footwear, Apparel, Accessories)
  const [divisionMappings, setDivisionMappings] = useState<Record<string, ProductDivision>>({});
  const [detectedDivisions, setDetectedDivisions] = useState<string[]>([]);
  
  // Loading state for data analysis after column mapping
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Size configuration state
  const [selectedSizeChartId, setSelectedSizeChartId] = useState<string>('');
  const [genderCartonConfig, setGenderCartonConfig] = useState<GenderCartonConfig>({});
  
  // Carton config mode state (for Excel upload vs manual entry)
  const [cartonConfigMode, setCartonConfigMode] = useState<'upload' | 'manual'>('upload');
  const [cartonExcelFile, setCartonExcelFile] = useState<File | null>(null);
  const [isParsingCartonExcel, setIsParsingCartonExcel] = useState(false);
  const [manualSizesInput, setManualSizesInput] = useState<Record<string, string>>({});
  
  // Size chart Excel upload state (for individual mode)
  const [sizeChartExcelFile, setSizeChartExcelFile] = useState<File | null>(null);
  const [isParsingSizeChartExcel, setIsParsingSizeChartExcel] = useState(false);
  const [individualSizeChartMappings, setIndividualSizeChartMappings] = useState<Array<{ key: string; sizes: string[] }>>([]);
  // Map from detected product gender to size chart row key
  const [genderToSizeChartRowMap, setGenderToSizeChartRowMap] = useState<Record<string, string>>({});

  // Image state
  const [imageSource, setImageSource] = useState<'embedded' | 'column' | 'zip' | 'none'>('none');
  const [imageUploadJobId, setImageUploadJobId] = useState<string | null>(null);
  // Pre-uploaded embedded images (when user went back and returns - avoids re-extraction)
  const [embeddedImagesPreUploaded, setEmbeddedImagesPreUploaded] = useState<{
    uploadedCount: number;
    totalInExcel: number | null;
  } | null>(null);
  const [imageUploadProgress, setImageUploadProgress] = useState<{
    status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped';
    percent: number;
    message: string;
    imagesProcessed: number;
    totalImages: number;
  } | null>(null);
  // When embedded: 'source' = Choose Image Source, 'progress' = Upload Progress div
  const [embeddedUploadView, setEmbeddedUploadView] = useState<'source' | 'progress'>('source');
  
  // URL pattern replacement configuration for generating image2, image3, image4 from image1
  const [urlPatternConfig, setUrlPatternConfig] = useState<{
    findPattern: string;      // Pattern to find in image1 URL (e.g., "first")
    replaceImage2: string;    // Replacement for image2 (e.g., "second")
    replaceImage3: string;    // Replacement for image3 (e.g., "third")
    replaceImage4: string;    // Replacement for image4 (e.g., "fourth")
  }>({
    findPattern: '',
    replaceImage2: '',
    replaceImage3: '',
    replaceImage4: ''
  });
  
  // ZIP upload state
  const [zipUploadJobId, setZipUploadJobId] = useState<string | null>(null);
  const [zipFileName, setZipFileName] = useState<string | null>(null);
  const [zipUploading, setZipUploading] = useState(false);
  const [zipUploadProgress, setZipUploadProgress] = useState<{
    stage: string;
    percent: number;
    message: string;
    imagesProcessed: number;
    totalImages: number;
  } | null>(null);

  // Collection state
  const [collectionName, setCollectionName] = useState('');
  const [collectionImage, setCollectionImage] = useState('');
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);

  // Processing state
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null);
  const [liveProgress, setLiveProgress] = useState<{
    productsProcessed: number;
    totalProducts: number;
    productsCreated: number;
    productsUpdated: number;
    percent: number;
    message: string;
    elapsed: number;
  } | null>(null);
  
  // Job Monitor state - track timing for each step
  const [stepTimings, setStepTimings] = useState<StepTiming[]>([]);
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);

  // Dialog states
  const [isCreatingBrand, setIsCreatingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [isCreatingSizeChart, setIsCreatingSizeChart] = useState(false);
  const [newSizeChartName, setNewSizeChartName] = useState('');
  const [newSizeChartSizes, setNewSizeChartSizes] = useState('');

  // Queries
  const { data: brands = [] } = useQuery<any[]>({ queryKey: ['/api/brands'] });
  const { data: sizeCharts = [] } = useQuery<any[]>({ queryKey: ['/api/size-charts'] });
  const { data: currencies = [] } = useQuery<any[]>({ queryKey: ['/api/currencies'] });

  // ============================================================================
  // STATE PERSISTENCE (localStorage)
  // ============================================================================

  // Clear all upload state and localStorage - used for cancel and completion
  const clearUploadState = useCallback(() => {
    localStorage.removeItem(UPLOAD_STATE_KEY);
    setMode(null);
    setStep('mode');
    setSelectedBrandId('');
    setSelectedBrandName('');
    setFile(null);
    setRestoredFileName(null);
    setCurrentJobId(null);
    setJobProgress(null);
    setRawPreview(null);
    setPreview(null);
    setSelectedHeaderRow(0);
    setMapping({
      sku: '', barcode: '', name: '', brand: '', category: '', division: '', gender: '', ageGroup: '',
      size: '', image1: '', image2: '', image3: '', image4: '', description: '', 
      wholesalePrice: '', retailPrice: '', cost: '', colourway: '', stock: '', currency: ''
    });
    setDetectedGenders([]);
    setCategoryMappings({});
    setGenderNormalizationMap({});
    setDivisionMappings({});
    setDetectedDivisions([]);
    setSelectedSizeChartId('');
    setGenderCartonConfig({});
    setCartonConfigMode('upload');
    setCartonExcelFile(null);
    setManualSizesInput({});
    setSizeChartExcelFile(null);
    setImageSource('none');
    setImageUploadJobId(null);
    setImageUploadProgress(null);
    setUrlPatternConfig({
      findPattern: '',
      replaceImage2: '',
      replaceImage3: '',
      replaceImage4: ''
    });
    setCollectionName('');
    setCollectionImage('');
    setProcessingJobId(null);
    setProcessingResult(null);
    setLiveProgress(null);
    setStepTimings([]);
    setUploadStartTime(null);
  }, []);

  // Restore state from localStorage on mount
  useEffect(() => {
    const restoreState = async () => {
      try {
        const saved = localStorage.getItem(UPLOAD_STATE_KEY);
        if (!saved) return;

        const parsed: PersistedUploadState = JSON.parse(saved);
        
        // Only restore if uploadType matches and state is less than 24 hours old
        const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
        if (parsed.uploadType !== uploadType || Date.now() - parsed.savedAt > MAX_AGE) {
          localStorage.removeItem(UPLOAD_STATE_KEY);
          return;
        }

        // Don't restore if we're in processing or complete steps (can't resume those)
        if (parsed.step === 'processing' || parsed.step === 'complete' || parsed.step === 'uploading') {
          localStorage.removeItem(UPLOAD_STATE_KEY);
          return;
        }

        // Steps that don't require preview data
        const earlySteps: Step[] = ['mode', 'brand', 'upload'];
        const needsPreviewRehydration = !earlySteps.includes(parsed.step) && parsed.tempDataId;

        // Restore basic state first
        setMode(parsed.mode);
        setSelectedBrandId(parsed.selectedBrandId);
        setSelectedBrandName(parsed.selectedBrandName);
        setSelectedHeaderRow(parsed.selectedHeaderRow);
        setMapping(parsed.mapping);
        setDetectedGenders(parsed.detectedGenders);
        setDetectedDivisions(parsed.detectedDivisions || []);
        setCategoryMappings(parsed.categoryMappings);
        setGenderNormalizationMap(parsed.genderNormalizationMap);
        setDivisionMappings(parsed.divisionMappings || {});
        setSelectedSizeChartId(parsed.selectedSizeChartId || '');
        setGenderCartonConfig(parsed.genderCartonConfig || {});
        setCartonConfigMode(parsed.cartonConfigMode || 'upload');
        setManualSizesInput(parsed.manualSizesInput || {});
        setIndividualSizeChartMappings(parsed.individualSizeChartMappings || []);
        setGenderToSizeChartRowMap(parsed.genderToSizeChartRowMap || {});
        setImageSource(parsed.imageSource);
        setUrlPatternConfig(parsed.urlPatternConfig);
        setCollectionName(parsed.collectionName);
        setCollectionImage(parsed.collectionImage);
        
        // Restore file name for display
        if (parsed.fileName) {
          setRestoredFileName(parsed.fileName);
        }

        // If we need to restore to a step past upload, rehydrate preview from server
        if (needsPreviewRehydration && parsed.tempDataId) {
          try {
            // Use processHeaderRow with options to rehydrate state
            // suppressAutoDetect: true if mapping.sku exists (user already mapped)
            // targetStep: the saved step to restore to
            await processHeaderRow(
              parsed.selectedHeaderRow,
              [], // rawRows will be populated from server response
              parsed.tempDataId,
              {
                suppressAutoDetect: !!parsed.mapping.sku, // Skip auto-detect if user already mapped
                targetStep: parsed.step,
                fileName: parsed.fileName || 'Unknown'
              }
            );
            
            toast({
              title: "Upload Session Restored",
              description: `Resuming from the ${parsed.step} step`,
            });
          } catch (error) {
            console.error('Failed to rehydrate preview:', error);
            // Session expired on server - fall back to upload step
            setStep('upload');
            toast({
              title: "Session Expired",
              description: `Your upload session expired. Please re-upload ${parsed.fileName || 'your file'} to continue.`,
              variant: "destructive",
            });
          }
        } else {
          // For early steps, just restore directly
          setStep(earlySteps.includes(parsed.step) ? parsed.step : 'upload');
          toast({
            title: "Upload Session Restored",
            description: `Resuming from the ${earlySteps.includes(parsed.step) ? parsed.step : 'upload'} step`,
          });
        }
      } catch (error) {
        console.error('Failed to restore upload state:', error);
        localStorage.removeItem(UPLOAD_STATE_KEY);
      }
    };
    
    restoreState();
  }, [uploadType, toast]);

  // Save state to localStorage when key values change (debounced)
  useEffect(() => {
    // Don't save during processing, complete, or initial mode step
    if (step === 'mode' || step === 'processing' || step === 'complete' || step === 'uploading') {
      return;
    }

    const stateToSave: PersistedUploadState = {
      uploadType,
      mode,
      step,
      selectedBrandId,
      selectedBrandName,
      tempDataId: preview?.tempDataId || rawPreview?.tempDataId || null,
      selectedHeaderRow,
      mapping,
      detectedGenders,
      detectedDivisions,
      categoryMappings,
      genderNormalizationMap,
      divisionMappings,
      selectedSizeChartId,
      genderCartonConfig,
      cartonConfigMode,
      manualSizesInput,
      individualSizeChartMappings,
      genderToSizeChartRowMap,
      imageSource,
      urlPatternConfig,
      collectionName,
      collectionImage,
      fileName: file?.name || rawPreview?.fileName || preview?.fileName || null,
      savedAt: Date.now(),
    };

    localStorage.setItem(UPLOAD_STATE_KEY, JSON.stringify(stateToSave));
  }, [
    uploadType, mode, step, selectedBrandId, selectedBrandName, preview, rawPreview, file,
    selectedHeaderRow, mapping, detectedGenders, detectedDivisions, categoryMappings,
    genderNormalizationMap, divisionMappings, selectedSizeChartId, genderCartonConfig,
    cartonConfigMode, manualSizesInput, individualSizeChartMappings, genderToSizeChartRowMap,
    imageSource, urlPatternConfig,
    collectionName, collectionImage
  ]);

  // ============================================================================
  // STEP NAVIGATION
  // ============================================================================

  const steps = mode ? getSteps(mode, uploadType) : getSteps('individual', uploadType);
  const currentStepIndex = steps.findIndex(s => s.id === step);

  const canGoNext = useCallback(() => {
    switch (step) {
      case 'mode': return mode !== null;
      case 'brand': return selectedBrandId !== '';
      case 'upload': return preview !== null;
      case 'mapping': 
        // For stock upload, both SKU and Stock are required
        if (isStockUpload) {
          return mapping.sku !== '' && mapping.stock !== '';
        }
        return mapping.sku !== '';
      case 'gender': {
        // Check if all detected genders are mapped with Gender and Age Group
        if (detectedGenders.length === 0) return true;
        return detectedGenders.every(g => {
          const mapping = categoryMappings[g];
          return !!mapping?.mainCategory && !!mapping?.kidsAgeGroup;
        });
      }
      case 'sizes': 
        if (mode === 'carton') {
          return Object.keys(genderCartonConfig).length > 0 && 
            Object.values(genderCartonConfig).every(c => c.sizes.length > 0);
        }
        // Individual mode: allow if size chart selected, sizes mapped, OR gender-based mappings loaded
        // If using gender-based size chart, all detected genders must have a selection (including "skip")
        if (individualSizeChartMappings.length > 0 && detectedGenders.length > 0) {
          const allGendersMapped = detectedGenders.every(g => genderToSizeChartRowMap[g] && genderToSizeChartRowMap[g] !== '');
          return allGendersMapped;
        }
        return selectedSizeChartId !== '' || mapping.size !== '' || individualSizeChartMappings.length > 0;
      case 'images': return true;
      case 'review': return true;
      case 'collection': return collectionName.trim() !== '';
      default: return false;
    }
  }, [step, mode, selectedBrandId, preview, mapping, detectedGenders, categoryMappings, genderNormalizationMap, genderCartonConfig, selectedSizeChartId, collectionName, isStockUpload, individualSizeChartMappings, genderToSizeChartRowMap]);

  // Start embedded image extraction and upload to Cloudinary
  const startEmbeddedImageExtraction = async () => {
    if (!preview?.tempDataId) {
      toast({ title: "Error", description: "Upload session not found", variant: "destructive" });
      return false;
    }
    
    setImageUploadProgress({
      status: 'running',
      percent: 0,
      message: 'Starting image extraction...',
      imagesProcessed: 0,
      totalImages: 0
    });
    
    try {
      const response = await fetch('/api/preorder/extract-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tempDataId: preview.tempDataId,
          headerRowIndex: selectedHeaderRow
        }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to start image extraction');
      }
      
      const data = await response.json();
      setImageUploadJobId(data.jobId);
      return true;
    } catch (error) {
      console.error('Image extraction error:', error);
      setImageUploadProgress({
        status: 'failed',
        percent: 0,
        message: 'Failed to start image extraction',
        imagesProcessed: 0,
        totalImages: 0
      });
      toast({ title: "Error", description: "Failed to extract images from Excel", variant: "destructive" });
      return false;
    }
  };
  
  // Poll for image upload progress
  useEffect(() => {
    if (!imageUploadJobId) return;
    
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/preorder/extract-images/${imageUploadJobId}`, {
          credentials: 'include'
        });
        
        if (!response.ok) {
          clearInterval(pollInterval);
          return;
        }
        
        const jobStatus = await response.json();
        
        setImageUploadProgress({
          status: jobStatus.status,
          percent: jobStatus.progress?.percent || 0,
          message: jobStatus.progress?.message || '',
          imagesProcessed: jobStatus.progress?.imagesProcessed || 0,
          totalImages: jobStatus.progress?.totalImages || 0
        });
        
        if (jobStatus.status === 'completed') {
          clearInterval(pollInterval);
          setImageUploadJobId(null);
          const uploadedCount = jobStatus.uploadedImages?.length ?? jobStatus.progress?.imagesProcessed ?? 0;
          setImageUploadProgress(prev => {
            const totalCount = jobStatus.progress?.totalImages ?? prev?.totalImages ?? uploadedCount;
            return prev ? {
              ...prev,
              status: 'completed',
              percent: 100,
              message: jobStatus.progress?.message || 'Upload complete',
              imagesProcessed: uploadedCount,
              totalImages: totalCount
            } : { status: 'completed', percent: 100, message: 'Upload complete', imagesProcessed: uploadedCount, totalImages: totalCount } as any;
          });
          toast({ 
            title: "Images Uploaded", 
            description: `Successfully uploaded ${jobStatus.uploadedImages?.length || 0} images to Cloudinary` 
          });
        } else if (jobStatus.status === 'stopped') {
          clearInterval(pollInterval);
          setImageUploadJobId(null);
          setImageUploadProgress(prev => prev ? { ...prev, status: 'stopped' as const, message: 'Upload paused' } : null);
        } else if (jobStatus.status === 'failed') {
          clearInterval(pollInterval);
          setImageUploadJobId(null);
          setImageUploadProgress(null);
          toast({ 
            title: "Image Upload Failed", 
            description: jobStatus.error || 'Unknown error',
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error('Error polling image job:', error);
      }
    }, 1000);
    
    return () => clearInterval(pollInterval);
  }, [imageUploadJobId]);

  // Reset embedded upload view when switching away from embedded
  useEffect(() => {
    if (imageSource !== 'embedded') {
      setEmbeddedUploadView('source');
    }
  }, [imageSource]);

  // Check if embedded images were already uploaded (user went back and returns) - avoid re-extraction
  useEffect(() => {
    const tempDataId = preview?.tempDataId || rawPreview?.tempDataId;
    if (step !== 'images' || imageSource !== 'embedded' || !tempDataId) {
      setEmbeddedImagesPreUploaded(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/preorder/embedded-images-status?tempDataId=${encodeURIComponent(tempDataId)}`, {
          credentials: 'include'
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.exists && data.uploadedCount > 0) {
          setEmbeddedImagesPreUploaded({
            uploadedCount: data.uploadedCount,
            totalInExcel: data.totalInExcel ?? null
          });
        } else {
          setEmbeddedImagesPreUploaded(null);
        }
      } catch {
        if (!cancelled) setEmbeddedImagesPreUploaded(null);
      }
    })();
    return () => { cancelled = true; };
  }, [step, imageSource, preview?.tempDataId, rawPreview?.tempDataId]);

  const goNext = async () => {
    // Catalogue uploads skip collection step (products stay hidden until assigned to a collection)
    const stepOrder: Step[] = isCatalogueUpload 
      ? ['mode', 'brand', 'upload', 'uploading', 'mapping', 'sizes', 'gender', 'division', 'images', 'review', 'processing', 'complete']
      : ['mode', 'brand', 'upload', 'uploading', 'mapping', 'sizes', 'gender', 'division', 'images', 'review', 'collection', 'processing', 'complete'];
    const currentIndex = stepOrder.indexOf(step);
    console.log(`[goNext] Current step: ${step}, index: ${currentIndex}, uploadType: ${uploadType}`);
    
    if (currentIndex < stepOrder.length - 1) {
      let nextStep = stepOrder[currentIndex + 1];
      // Skip uploading step when going next (it's auto-triggered)
      if (nextStep === 'uploading') nextStep = stepOrder[currentIndex + 2];
      
      console.log(`[goNext] Moving to: ${nextStep}`);
      
      // When moving from mapping to sizes (carton setup), analyze data to detect genders
      if (step === 'mapping' && nextStep === 'sizes') {
        setIsAnalyzing(true);
        try {
          await analyzeData();
        } finally {
          setIsAnalyzing(false);
        }
        
        // For individual mode: skip sizes step if size column is already mapped from Excel
        if (mode === 'individual' && mapping.size !== '') {
          console.log(`[goNext] Individual mode with size mapped - skipping sizes step`);
          nextStep = 'gender';
        }
      }
      
      // When moving from images step with embedded source: always go to Upload Progress screen
      if (step === 'images' && imageSource === 'embedded') {
        setEmbeddedUploadView('progress');
        const tempDataId = preview?.tempDataId || rawPreview?.tempDataId;
        let uploadCount = embeddedImagesPreUploaded?.uploadedCount ?? 0;
        let totalInExcel = embeddedImagesPreUploaded?.totalInExcel ?? null;
        let shouldSkipExtraction = uploadCount > 0 && totalInExcel != null && uploadCount === totalInExcel;
        if (!shouldSkipExtraction && tempDataId) {
          try {
            const res = await fetch(`/api/preorder/embedded-images-status?tempDataId=${encodeURIComponent(tempDataId)}`, { credentials: 'include' });
            if (res.ok) {
              const data = await res.json();
              if (data.exists && data.uploadedCount > 0) {
                uploadCount = data.uploadedCount;
                totalInExcel = data.totalInExcel ?? null;
                setEmbeddedImagesPreUploaded({ uploadedCount: uploadCount, totalInExcel });
                shouldSkipExtraction = totalInExcel != null && uploadCount === totalInExcel;
              }
            }
          } catch {}
        }
        if (shouldSkipExtraction) {
          setImageUploadProgress({
            status: 'completed',
            percent: 100,
            message: 'Upload complete',
            imagesProcessed: uploadCount,
            totalImages: totalInExcel ?? uploadCount
          });
          return;
        }
        const started = await startEmbeddedImageExtraction();
        if (started) {
          return;
        }
      }
      
      // For catalogue uploads: show choice dialog before processing (In Stock, Pre-order, or Catalogue)
      if (isCatalogueUpload && step === 'review' && nextStep === 'processing') {
        setCatalogueProcessingChoice(null);
        setCatalogueCollectionName('');
        setShowCatalogueContinueDialog(true);
        return;
      }
      
      setStep(nextStep);
    }
  };

  const goBack = () => {
    // Catalogue uploads skip collection step (products stay hidden until assigned to a collection)
    const stepOrder: Step[] = isCatalogueUpload 
      ? ['mode', 'brand', 'upload', 'mapping', 'sizes', 'gender', 'division', 'images', 'review']
      : ['mode', 'brand', 'upload', 'mapping', 'sizes', 'gender', 'division', 'images', 'review', 'collection'];
    const currentIndex = stepOrder.indexOf(step);
    if (currentIndex > 0) {
      let prevStep = stepOrder[currentIndex - 1];
      // From review: go back to Upload Progress when embedded
      if (step === 'review' && prevStep === 'images' && imageSource === 'embedded') {
        setEmbeddedUploadView('progress');
      }
      // Reset image upload state when navigating back (except embedded progress view)
      if (step === 'review' && imageSource !== 'embedded') {
        setImageUploadProgress(null);
        setImageUploadJobId(null);
      }
      // For individual mode: skip sizes step when going back if size was mapped
      if (step === 'gender' && prevStep === 'sizes' && mode === 'individual' && mapping.size !== '') {
        prevStep = 'mapping';
      }
      setStep(prevStep);
    }
  };

  // ============================================================================
  // FILE UPLOAD MUTATIONS
  // ============================================================================

  // Use ref to track if we've already processed the header to prevent race conditions
  const headerProcessedRef = useRef(false);
  // Use ref to prevent duplicate completion handling (toast showing multiple times)
  const processingCompletedRef = useRef(false);

  const uploadMutation = useMutation({
    mutationFn: async (uploadFile: File) => {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('brandId', selectedBrandId);
      
      const response = await fetch('/api/preorder/upload/start', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Upload failed');
      return response.json();
    },
    onSuccess: (data) => {
      headerProcessedRef.current = false; // Reset for new upload
      processingCompletedRef.current = false; // Reset for new upload
      setCurrentJobId(data.jobId);
      setStep('uploading');
    },
    onError: (error) => {
      toast({ title: "Upload failed", description: String(error), variant: "destructive" });
    }
  });

  // Reset create confirm dialog when leaving collection step
  useEffect(() => {
    if (step !== 'collection') setShowCreateConfirm(false);
  }, [step]);

  // Catalogue continue dialog - choose In Stock, Pre-order, or Catalogue
  const [showCatalogueContinueDialog, setShowCatalogueContinueDialog] = useState(false);
  const [catalogueProcessingChoice, setCatalogueProcessingChoice] = useState<'stock' | 'preorder' | 'catalogue' | null>(null);
  const [catalogueCollectionName, setCatalogueCollectionName] = useState('');

  // Track step timings for Job Monitor
  useEffect(() => {
    if (step === 'mode') {
      // Initialize or reset timings when starting
      setUploadStartTime(Date.now());
      setStepTimings([]);
      return;
    }
    
    setStepTimings(prev => {
      const updated = [...prev];
      
      // Mark previous step as completed
      const prevStepIndex = updated.findIndex(s => s.status === 'in-progress');
      if (prevStepIndex !== -1) {
        updated[prevStepIndex] = {
          ...updated[prevStepIndex],
          status: 'completed',
          completedAt: Date.now()
        };
      }
      
      // Add current step as in-progress if not already tracked
      const currentExists = updated.find(s => s.stepId === step);
      if (!currentExists) {
        updated.push({
          stepId: step,
          startedAt: Date.now(),
          status: 'in-progress'
        });
      }
      
      return updated;
    });
  }, [step]);

  // Poll for job status
  useEffect(() => {
    if (!currentJobId || step !== 'uploading') return;

    let failCount = 0;
    const maxFails = 10; // Allow ~10s of server busy/unresponsive before failing

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/preorder/jobs/${currentJobId}`);
        failCount = 0; // Reset on success
        const jobStatus = await response.json();

        setJobProgress(jobStatus.progress);

        if (jobStatus.status === 'completed' && jobStatus.result) {
          clearInterval(pollInterval);
          setRawPreview({
            totalRows: jobStatus.result.totalRows,
            rawRows: jobStatus.result.rawRows,
            fileName: file?.name || 'Unknown',
            tempDataId: jobStatus.tempDataId
          });
          // Process header row selection
          processHeaderRow(0, jobStatus.result.rawRows, jobStatus.tempDataId);
        } else if (jobStatus.status === 'failed') {
          clearInterval(pollInterval);
          toast({ 
            title: "Processing failed", 
            description: jobStatus.error || 'An error occurred', 
            variant: "destructive",
            duration: 15000
          });
          setStep('upload');
        }
      } catch (error) {
        failCount++;
        console.error('Error polling job status:', error);
        const errMsg = error instanceof Error ? error.message : 'Connection error';
        if (failCount >= maxFails) {
          clearInterval(pollInterval);
          toast({ 
            title: "Connection error", 
            description: errMsg === 'Failed to fetch' ? 'Server may be busy or unresponsive. Please try again.' : errMsg, 
            variant: "destructive",
            duration: 15000
          });
          setStep('upload');
        }
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [currentJobId, step, file]);

  // Poll for processing job status (final step)
  useEffect(() => {
    if (!processingJobId || step !== 'processing') return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/preorder/jobs/${processingJobId}`);
        const jobStatus = await response.json();

        // Update live progress with real-time data
        if (jobStatus.progress) {
          setLiveProgress({
            productsProcessed: jobStatus.progress.productsProcessed || 0,
            totalProducts: jobStatus.progress.totalProducts || 0,
            productsCreated: jobStatus.progress.productsCreated || 0,
            productsUpdated: jobStatus.progress.productsUpdated || 0,
            percent: jobStatus.progress.percent || 0,
            message: jobStatus.progress.message || 'Processing...',
            elapsed: jobStatus.elapsed || 0
          });
        }

        if (jobStatus.status === 'completed') {
          clearInterval(pollInterval);
          
          // Prevent duplicate completion handling
          if (processingCompletedRef.current) {
            return;
          }
          processingCompletedRef.current = true;
          
          // Set progress to 100% for completion
          setLiveProgress(prev => prev ? {
            ...prev,
            percent: 100,
            productsProcessed: prev.totalProducts
          } : null);
          
          // Use processingResult if available, otherwise construct from progress data
          const elapsedMs = jobStatus.elapsed || 0;
          const elapsedSeconds = Math.floor(elapsedMs / 1000);
          const elapsedTimeStr = elapsedSeconds < 60 
            ? `${elapsedSeconds}s` 
            : `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`;
          
          const result = jobStatus.processingResult || {
            collectionId: '',
            collectionName: collectionName,
            productCount: jobStatus.progress?.productsProcessed || 0,
            productsCreated: jobStatus.progress?.productsCreated || 0,
            productsUpdated: jobStatus.progress?.productsUpdated || 0,
            errors: [],
            totalErrors: 0,
            processingTime: elapsedTimeStr
          };
          
          setProcessingResult(result);
          localStorage.removeItem(UPLOAD_STATE_KEY); // Clear persisted state on success
          setStep('complete');
          setProcessingJobId(null);
          
          // Invalidate caches
          queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
          queryClient.invalidateQueries({ queryKey: ['/api/preorder/collections'] });
          queryClient.invalidateQueries({ queryKey: ['/api/products'] });
          
          setProcessingError(null);
          toast({ 
            title: "Success!", 
            description: `Created ${result.productsCreated} products, updated ${result.productsUpdated}` 
          });
        } else if (jobStatus.status === 'failed') {
          clearInterval(pollInterval);
          setProcessingJobId(null);
          setLiveProgress(null);
          const errMsg = jobStatus.error || 'An unexpected error occurred';
          setProcessingError(errMsg);
          toast({ 
            title: "Processing failed", 
            description: errMsg, 
            variant: "destructive",
            duration: 15000
          });
          setStep('collection');
        }
      } catch (error) {
        console.error('Error polling processing job status:', error);
        const errMsg = error instanceof Error ? error.message : 'Connection error - server may be unavailable';
        setProcessingError(errMsg);
        toast({ 
          title: "Connection error", 
          description: errMsg, 
          variant: "destructive",
          duration: 15000
        });
        clearInterval(pollInterval);
        setStep('collection');
      }
    }, 500); // Poll every 500ms for more responsive updates

    return () => clearInterval(pollInterval);
  }, [processingJobId, step]);

  interface ProcessHeaderOptions {
    suppressAutoDetect?: boolean;  // Skip auto-detect mappings (for restoration)
    targetStep?: Step;             // Override target step (for restoration)
    fileName?: string;             // Override file name (for restoration)
  }

  const processHeaderRow = async (
    headerRow: number, 
    rawRows: any[][], 
    tempDataId: string,
    options?: ProcessHeaderOptions
  ) => {
    const isRestore = !!options?.targetStep;
    
    // Prevent duplicate processing (skip check if restoring)
    if (headerProcessedRef.current && !isRestore) {
      console.log('[processHeaderRow] Already processed, skipping');
      return;
    }
    
    // Only set the ref for non-restore calls to allow header re-selection after restore
    if (!isRestore) {
      headerProcessedRef.current = true;
    }
    
    try {
      console.log('[processHeaderRow] Processing header row:', headerRow, options ? '(with options)' : '');
      // First, set the header row to parse the data
      const response = await apiRequest('/api/preorder/upload/set-header', 'POST', {
        tempDataId,
        headerRowIndex: headerRow
      });
      const data = await response.json();

      const fileName = options?.fileName || file?.name || 'Unknown';
      
      setPreview({
        totalRows: data.totalRows,
        previewRows: data.previewRows,
        columns: data.columns,
        fileName,
        tempDataId
      });
      
      // Set rawPreview with data from response
      // Use provided rawRows if available, otherwise use rawPreviewRows from server, fallback to previewRows
      setRawPreview({
        totalRows: data.totalRows,
        rawRows: rawRows.length > 0 ? rawRows : (data.rawPreviewRows || data.previewRows || []),
        fileName,
        tempDataId
      });

      // Auto-detect column mappings (unless suppressed for restoration)
      if (!options?.suppressAutoDetect) {
        autoDetectMappings(data.columns);
      } else {
        // When restoring, validate that persisted mappings still match server columns
        // If any mapped columns don't exist in server's column list, clear them
        const serverColumns = new Set(data.columns || []);
        setMapping(prev => {
          const validatedMapping = { ...prev };
          let hasInvalidMappings = false;
          
          for (const [field, column] of Object.entries(validatedMapping)) {
            if (column && !serverColumns.has(column)) {
              console.warn(`[processHeaderRow] Clearing stale mapping for ${field}: "${column}" not in server columns`);
              validatedMapping[field] = '';
              hasInvalidMappings = true;
            }
          }
          
          // If critical mappings are now empty, run auto-detect
          if (hasInvalidMappings && !validatedMapping.sku) {
            console.log('[processHeaderRow] Running auto-detect after clearing stale mappings');
            autoDetectMappings(data.columns);
            return prev; // autoDetectMappings will update mapping state
          }
          
          return validatedMapping;
        });
      }

      // Set step to mapping or target step
      const nextStep = options?.targetStep || 'mapping';
      console.log('[processHeaderRow] Setting step to', nextStep);
      setStep(nextStep);
      
      return data; // Return data for callers that need it
    } catch (error) {
      headerProcessedRef.current = false; // Allow retry on error
      toast({ title: "Processing failed", description: String(error), variant: "destructive" });
      throw error; // Re-throw for callers to handle
    }
  };

  // Analyze data after mapping is complete to detect genders and categories
  const analyzeData = async () => {
    if (!preview?.tempDataId || !mapping.sku) return;
    
    try {
      const response = await apiRequest('/api/preorder/analyze', 'POST', {
        tempDataId: preview.tempDataId,
        mapping,
        brandId: selectedBrandId
      });
      const data = await response.json();

      // Extract detected genders
      if (data.detectedGenders && data.detectedGenders.length > 0) {
        setDetectedGenders(data.detectedGenders);
      }
      
      // Extract detected divisions for division mapping
      if (data.detectedDivisions && data.detectedDivisions.length > 0) {
        setDetectedDivisions(data.detectedDivisions);
        // Auto-suggest mapping based on division value keywords
        const autoMappings: Record<string, ProductDivision> = {};
        data.detectedDivisions.forEach((div: string) => {
          const divLower = div.toLowerCase();
          if (divLower.includes('footwear') || divLower.includes('shoe') || divLower.includes('boot') || 
              divLower.includes('sneaker') || divLower.includes('sandal') || divLower.includes('slipper')) {
            autoMappings[div] = 'Footwear';
          } else if (divLower.includes('apparel') || divLower.includes('cloth') || divLower.includes('wear') ||
                     divLower.includes('shirt') || divLower.includes('pant') || divLower.includes('dress')) {
            autoMappings[div] = 'Apparel';
          } else if (divLower.includes('accessor')) {
            autoMappings[div] = 'Accessories';
          }
          // No default - user must manually select if not auto-detected
        });
        setDivisionMappings(autoMappings);
      }
    } catch (error) {
      console.error('Analysis error:', error);
    }
  };

  const autoDetectMappings = (columns: string[]) => {
    // Auto-mapping disabled - user must manually map all columns
    console.log('[autoDetectMappings] Auto-mapping disabled, user must map columns manually');
    return;
  };

  // ============================================================================
  // PROCESSING MUTATION
  // ============================================================================

  const processMutation = useMutation({
    mutationFn: async (overrides?: { overrideCollectionType?: 'stock' | 'preorder' | 'catalogue'; overrideCollectionName?: string }) => {
      // Build size chart data based on mode
      let sizeChartData: any = undefined;
      let mappingType: 'gender-based' | 'uniform' = 'uniform';

      if (mode === 'carton') {
        mappingType = 'gender-based';
        sizeChartData = {
          type: 'gender-based',
          mappings: Object.entries(genderCartonConfig).map(([gender, config]) => ({
            key: gender,
            sizes: config.sizes,
            unitsPerSize: config.unitsPerSize,
            mappedGender: config.mappedGender,
            mappedAgeGroup: config.mappedAgeGroup
          }))
        };
      } else if (mode === 'individual' && individualSizeChartMappings.length > 0) {
        // Individual mode with gender-based size chart uploaded
        // Apply the gender-to-size-chart-row mapping
        mappingType = 'gender-based';
        
        // Build mappings using the user's mapping of product genders to size chart rows
        // Skip genders mapped to "__skip__" - they won't get any sizes assigned
        const appliedMappings: Array<{ key: string; sizes: string[] }> = [];
        for (const [productGender, sizeChartRowKey] of Object.entries(genderToSizeChartRowMap)) {
          // Skip if user selected "No sizes (skip)"
          if (sizeChartRowKey === '__skip__') continue;
          
          const sizeChartRow = individualSizeChartMappings.find(m => m.key === sizeChartRowKey);
          if (sizeChartRow) {
            // Use productGender as the key, so products with this gender get these sizes
            appliedMappings.push({
              key: productGender,
              sizes: sizeChartRow.sizes
            });
          }
        }
        
        sizeChartData = {
          type: 'gender-based',
          mappings: appliedMappings.length > 0 ? appliedMappings : individualSizeChartMappings
        };
      }

      // First, create a processing job to enable progress tracking
      const totalProducts = preview?.totalRows || 0;
      // Resolve collection type and name: use overrides when provided (from catalogue continue dialog)
      const effectiveCollectionType = overrides?.overrideCollectionType ?? uploadType;
      const effectiveCollectionName = overrides?.overrideCollectionName 
        ?? (isCatalogueUpload && !overrides?.overrideCollectionType 
          ? `Catalogue-${new Date().toISOString().split('T')[0]}-${Date.now()}`
          : collectionName);
      const isEffectivelyCatalogue = effectiveCollectionType === 'catalogue';
      const jobResponse = await apiRequest('/api/preorder/process-job', 'POST', {
        collectionName: effectiveCollectionName,
        totalProducts
      });
      const { jobId } = await jobResponse.json();
      
      // Set the jobId immediately to start polling
      setProcessingJobId(jobId);
      setProcessingError(null);
      setLiveProgress({
        productsProcessed: 0,
        totalProducts,
        productsCreated: 0,
        productsUpdated: 0,
        percent: 0,
        message: 'Starting product processing...',
        elapsed: 0
      });

      // Now call the actual process endpoint with the jobId
      const response = await apiRequest('/api/preorder/process', 'POST', {
        tempDataId: preview?.tempDataId,
        mapping,
        collectionName: effectiveCollectionName,
        collectionType: effectiveCollectionType, // 'stock', 'preorder', or 'catalogue'
        collectionImage: isEffectivelyCatalogue ? '' : (collectionImage || 'https://via.placeholder.com/400x400?text=Collection'),
        brandId: selectedBrandId,
        baseCurrency: selectedCurrency, // Currency for product prices
        imageSource,
        urlPatternConfig: imageSource === 'column' && urlPatternConfig.findPattern ? urlPatternConfig : undefined,
        sizeChartId: mode === 'individual' && !individualSizeChartMappings.length ? selectedSizeChartId : undefined,
        sizeChartMappingType: mappingType,
        sizeChartMappingData: sizeChartData,
        genderNormalizationMap: Object.keys(genderNormalizationMap).length > 0 ? genderNormalizationMap : undefined,
        categoryMappings: Object.keys(categoryMappings).length > 0 ? categoryMappings : undefined,
        divisionMappings: Object.keys(divisionMappings).length > 0 ? divisionMappings : undefined,
        jobId // Pass the jobId to enable server-side progress updates
      });

      return response.json();
    },
    onSuccess: (data) => {
      // Check if processing is happening in background
      if (data.isBackground) {
        // Background processing - just let polling handle completion
        console.log('Background processing started, waiting for completion via polling...');
        // Keep jobId set so polling continues
        return;
      }
      
      // Processing complete - polling will also catch this, but handle it here too for reliability
      setProcessingResult(data);
      localStorage.removeItem(UPLOAD_STATE_KEY); // Clear persisted state on success
      setStep('complete');
      setProcessingJobId(null);
      setLiveProgress(null);
      queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
      queryClient.invalidateQueries({ queryKey: ['/api/preorder/collections'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({ title: "Success!", description: `Created ${data.productsCreated} products` });
    },
    onError: (error) => {
      setProcessingJobId(null);
      setLiveProgress(null);
      const errMsg = String(error);
      setProcessingError(errMsg);
      // Go back to collection step so user can fix and retry (catalogue skips collection, so go to review)
      setStep(isCatalogueUpload ? 'review' : 'collection');
      toast({ 
        title: "Processing failed", 
        description: errMsg, 
        variant: "destructive",
        duration: 15000
      });
    }
  });

  // ============================================================================
  // BRAND MUTATION
  // ============================================================================

  const createBrandMutation = useMutation({
    mutationFn: async () => {
      // Generate slug from brand name
      const slug = newBrandName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const response = await apiRequest('/api/brands', 'POST', {
        name: newBrandName,
        slug,
        isActive: true
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/brands'] });
      setSelectedBrandId(data.id);
      setSelectedBrandName(data.name);
      setNewBrandName('');
      setIsCreatingBrand(false);
      toast({ title: "Brand created" });
    }
  });

  // ============================================================================
  // SIZE CHART MUTATION
  // ============================================================================

  const createSizeChartMutation = useMutation({
    mutationFn: async () => {
      const sizes = newSizeChartSizes.split(',').map(s => s.trim()).filter(s => s);
      const response = await apiRequest('/api/size-charts', 'POST', {
        name: newSizeChartName,
        sizes
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/size-charts'] });
      setSelectedSizeChartId(data.id);
      setNewSizeChartName('');
      setNewSizeChartSizes('');
      setIsCreatingSizeChart(false);
      toast({ title: "Size chart created" });
    }
  });

  // ============================================================================
  // RENDER FUNCTIONS
  // ============================================================================

  const renderStepper = () => (
    <div className="w-full border-b bg-gray-50 dark:bg-gray-900 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center overflow-x-auto flex-1">
          {steps.map((s, index) => {
            const isActive = s.id === step;
            const isPast = currentStepIndex > index;
            const isLast = index === steps.length - 1;

            return (
              <div key={s.id} className="flex items-center">
                <div className="flex flex-col items-center min-w-[60px]">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium mb-1 ${
                    isActive ? 'bg-blue-600 text-white ring-2 ring-blue-300' :
                    isPast ? 'bg-green-500 text-white' :
                    'bg-gray-200 dark:bg-gray-700 text-gray-500'
                  }`}>
                    {isPast ? <Check className="w-4 h-4" /> : index + 1}
                  </div>
                  <span className={`text-xs font-medium text-center whitespace-nowrap ${
                    isActive ? 'text-blue-600 dark:text-blue-400' :
                    isPast ? 'text-green-600 dark:text-green-400' :
                    'text-gray-400'
                  }`}>
                    {s.label}
                  </span>
                </div>
                {!isLast && (
                  <div className={`w-8 h-0.5 mx-1 mt-[-12px] ${
                    isPast ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={clearUploadState}
          className="flex-shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
          data-testid="button-cancel-upload"
        >
          <X className="w-4 h-4 mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  );

  const renderModeStep = () => (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Choose Upload Type</h2>
        <p className="text-muted-foreground">
          Select how your products are sold
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card
          onClick={() => setMode('individual')}
          className={`p-6 cursor-pointer transition-all hover:shadow-lg ${
            mode === 'individual' ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950' : ''
          }`}
          data-testid="mode-individual"
        >
          <div className="text-center">
            <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
              mode === 'individual' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800'
            }`}>
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Individual Products</h3>
            <p className="text-sm text-muted-foreground">
              Products sold as single units. Upload your product list with a size chart.
            </p>
          </div>
        </Card>

        <Card
          onClick={() => setMode('carton')}
          className={`p-6 cursor-pointer transition-all hover:shadow-lg ${
            mode === 'carton' ? 'ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-950' : ''
          }`}
          data-testid="mode-carton"
        >
          <div className="text-center">
            <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
              mode === 'carton' ? 'bg-purple-500 text-white' : 'bg-gray-100 dark:bg-gray-800'
            }`}>
              <Box className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Carton Products</h3>
            <p className="text-sm text-muted-foreground">
              Products sold by carton. Each carton contains fixed sizes and quantities.
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-8 text-center">
        <Button 
          onClick={goNext} 
          disabled={!canGoNext()}
          className="px-8"
          data-testid="button-next"
        >
          Continue <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  const renderBrandStep = () => (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-8">
        <Heart className="w-12 h-12 text-pink-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Select Brand</h2>
        <p className="text-muted-foreground">
          Choose the brand for your pre-order collection
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Brand</Label>
          <Select 
            value={selectedBrandId} 
            onValueChange={(value) => {
              setSelectedBrandId(value);
              const brand = brands.find((b: any) => b.id === value);
              if (brand) setSelectedBrandName(brand.name);
            }}
          >
            <SelectTrigger data-testid="select-brand">
              <SelectValue placeholder="Select a brand" />
            </SelectTrigger>
            <SelectContent>
              {brands.filter((b: any) => b.isActive).map((brand: any) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Base Currency</Label>
          <Select 
            value={selectedCurrency} 
            onValueChange={setSelectedCurrency}
          >
            <SelectTrigger data-testid="select-currency">
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              {currencies.filter((c: any) => c.isActive).map((currency: any) => (
                <SelectItem key={currency.id} value={currency.code}>
                  {currency.symbol} {currency.code} - {currency.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">Currency for product prices in this upload</p>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <Dialog open={isCreatingBrand} onOpenChange={setIsCreatingBrand}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full" data-testid="button-create-brand">
              <Plus className="w-4 h-4 mr-2" /> Create New Brand
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Brand</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Label>Brand Name</Label>
              <Input
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                placeholder="Enter brand name"
                data-testid="input-new-brand"
              />
            </div>
            <DialogFooter>
              <Button onClick={() => createBrandMutation.mutate()} disabled={!newBrandName.trim()}>
                Create Brand
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-8 flex justify-between">
        <Button variant="outline" onClick={goBack} data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button onClick={goNext} disabled={!canGoNext()} data-testid="button-next">
          Continue <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  const renderUploadStep = () => (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-8">
        <Upload className="w-12 h-12 text-blue-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Upload Product File</h2>
        <p className="text-muted-foreground">
          Upload your Excel or CSV file with product data
        </p>
        {selectedBrandName && (
          <Badge variant="outline" className="mt-2">{selectedBrandName}</Badge>
        )}
      </div>

      <div
        className="border-2 border-dashed rounded-xl p-12 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20"
      >
        <FileSpreadsheet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Drop your file here</h3>
        <p className="text-muted-foreground mb-4">Supports .xlsx, .xls, .csv — up to 30MB, 200k rows</p>
        <Input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => {
            const selectedFile = e.target.files?.[0];
            if (selectedFile) {
              setFile(selectedFile);
              uploadMutation.mutate(selectedFile);
            }
          }}
          className="hidden"
          id="file-upload"
          data-testid="input-file"
        />
        <label htmlFor="file-upload">
          <Button variant="outline" asChild data-testid="button-browse">
            <span>Browse Files</span>
          </Button>
        </label>
      </div>

      {uploadMutation.isPending && (
        <div className="flex items-center justify-center gap-2 mt-4 text-blue-600">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Uploading file...</span>
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <Button variant="outline" onClick={goBack} data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
      </div>
    </div>
  );

  const renderUploadingStep = () => {
    // Cap at 99% while still on uploading step - avoids showing 100% before we actually transition
    const rawPercent = jobProgress?.percent || 0;
    const displayPercent = rawPercent >= 100 ? 99 : rawPercent;
    const displayMessage = rawPercent >= 100 ? 'Finalizing...' : (jobProgress?.message || '');
    return (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-8">
        <RefreshCw className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
        <h2 className="text-2xl font-bold mb-2">Processing File</h2>
        <p className="text-muted-foreground">{file?.name || restoredFileName || 'Unknown file'}</p>
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm font-bold text-blue-600">{displayPercent}%</span>
            </div>
            <Progress value={displayPercent} className="h-3" />
          </div>

          {(displayMessage || jobProgress?.message) && (
            <p className="text-sm text-muted-foreground text-center">
              {displayMessage}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
  };

  const renderMappingStep = () => {
    const mappingOptions = [
      { value: 'none', label: '- Not Mapped -' },
      { value: 'sku', label: 'SKU/UPC *' },
      { value: 'barcode', label: 'Barcode' },
      { value: 'name', label: 'Product Name' },
      { value: 'brand', label: 'Brand' },
      { value: 'category', label: 'Category' },
      { value: 'division', label: 'Division' },
      { value: 'gender', label: 'Gender' },
      { value: 'ageGroup', label: 'Age Group' },
      { value: 'size', label: 'Size' },
      { value: 'stock', label: isStockUpload ? 'Stock/Quantity *' : 'Stock/Quantity' },
      { value: 'image1', label: 'Image 1 (Primary)' },
      { value: 'image2', label: 'Image 2' },
      { value: 'image3', label: 'Image 3' },
      { value: 'image4', label: 'Image 4' },
      { value: 'wholesalePrice', label: 'Wholesale Price' },
      { value: 'retailPrice', label: 'Retail Price' },
      { value: 'cost', label: 'Cost' },
      { value: 'currency', label: 'Currency' },
      { value: 'colourway', label: 'Colourway' },
      { value: 'description', label: 'Description' },
      { value: 'limitOrder', label: 'Limit Order' },
    ];

    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <Settings className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Map Columns</h2>
          <p className="text-muted-foreground">
            Match your file columns to product fields
          </p>
        </div>

        <Card className="p-4">
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">Your Column</TableHead>
                  <TableHead className="w-48">Maps To</TableHead>
                  <TableHead>Sample Values</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview?.columns.map((col, index) => {
                  const currentMapping = Object.entries(mapping).find(([_, v]) => v === col)?.[0] || 'none';
                  const sampleValues = preview.previewRows
                    .slice(0, 3)
                    .map(row => row[col])
                    .filter(v => v)
                    .join(', ');

                  return (
                    <TableRow key={col}>
                      <TableCell className="font-medium">{col}</TableCell>
                      <TableCell>
                        <Select
                          value={currentMapping}
                          onValueChange={(value) => {
                            const newMapping = { ...mapping };
                            // Detect which field was previously mapped to this column before clearing
                            const previousField = Object.keys(newMapping).find(k => newMapping[k] === col);
                            // Clear old mapping for this column
                            Object.keys(newMapping).forEach(k => {
                              if (newMapping[k] === col) newMapping[k] = '';
                            });
                            // Set new mapping
                            if (value !== 'none') {
                              newMapping[value] = col;
                            }
                            setMapping(newMapping);
                            
                            // If division was unmapped, clear detected divisions and division mappings
                            if (previousField === 'division' && value !== 'division') {
                              setDetectedDivisions([]);
                              setDivisionMappings({});
                            }
                            
                            // If gender was unmapped, clear gender-related states
                            if (previousField === 'gender' && value !== 'gender') {
                              setDetectedGenders([]);
                              setCategoryMappings({});
                              setGenderNormalizationMap({});
                            }
                            
                            // If division column changed, re-extract unique division values
                            if (value === 'division' && preview?.previewRows) {
                              const allDivisions = preview.previewRows
                                .map(row => row[col])
                                .filter(v => v && String(v).trim())
                                .map(v => String(v).trim());
                              const uniqueDivisions = Array.from(new Set(allDivisions));
                              setDetectedDivisions(uniqueDivisions);
                              // Clear old division mappings since values changed
                              setDivisionMappings({});
                            }
                          }}
                        >
                          <SelectTrigger className="w-40" data-testid={`select-mapping-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {mappingOptions.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-xs">
                        {sampleValues || '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>

        {(!mapping.sku || (isStockUpload && !mapping.stock)) && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>
              {!mapping.sku && !mapping.stock && isStockUpload
                ? 'SKU/UPC and Stock columns are required'
                : !mapping.sku
                  ? 'SKU/UPC column is required'
                  : 'Stock column is required'}
            </AlertDescription>
          </Alert>
        )}

        <div className="mt-6 flex justify-between">
          <Button variant="outline" onClick={goBack} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button onClick={goNext} disabled={!canGoNext() || isAnalyzing} data-testid="button-next">
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing data...
              </>
            ) : (
              <>
                Continue <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    );
  };

  const renderGenderStep = () => {
    if (detectedGenders.length === 0) {
      return (
        <div className="max-w-md mx-auto text-center">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Category Mapping</h2>
          <p className="text-muted-foreground mb-6">
            No gender column detected. Products will use default category.
          </p>
          <div className="flex justify-between">
            <Button variant="outline" onClick={goBack} data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <Button onClick={goNext} data-testid="button-next">
              Continue <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      );
    }

    // Check if all mappings are complete
    const allMapped = detectedGenders.every(g => {
      const mapping = categoryMappings[g];
      return !!mapping?.mainCategory && !!mapping?.kidsAgeGroup;
    });

    return (
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <Users className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Gender & Age Group Mapping</h2>
          <p className="text-muted-foreground">
            Map detected values to Gender and Age Group
          </p>
        </div>

        {/* Legend */}
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm">
          <p className="font-medium text-blue-800 dark:text-blue-200 mb-1">Category System:</p>
          <ul className="text-blue-700 dark:text-blue-300 space-y-0.5">
            <li><strong>Gender:</strong> Male, Female, Unisex</li>
            <li><strong>Age Group:</strong> Adult, Junior, Kids, Infant</li>
          </ul>
        </div>

        <Card className="p-6">
          <div className="space-y-6">
            {detectedGenders.map((gender) => {
              const mapping = categoryMappings[gender] || {} as CategoryMapping;

              return (
                <div key={gender} className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
                  <div className="flex items-center gap-3 mb-3">
                    <Badge variant="outline" className="font-mono text-sm">
                      {gender}
                    </Badge>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-muted-foreground">Map to standard categories</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Gender */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Gender *</Label>
                      <Select
                        value={mapping.mainCategory || ''}
                        onValueChange={(value) => {
                          setCategoryMappings(prev => ({
                            ...prev,
                            [gender]: {
                              ...prev[gender],
                              mainCategory: value as MainCategory
                            }
                          }));
                          // Also update legacy map for backward compatibility
                          setGenderNormalizationMap(prev => ({
                            ...prev,
                            [gender]: value as StandardizedGender
                          }));
                        }}
                      >
                        <SelectTrigger data-testid={`select-main-category-${gender}`}>
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {MAIN_CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Age Group */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Age Group *</Label>
                      <Select
                        value={mapping.kidsAgeGroup || ''}
                        onValueChange={(value) => {
                          setCategoryMappings(prev => ({
                            ...prev,
                            [gender]: {
                              ...prev[gender],
                              kidsAgeGroup: value as KidsAgeGroup,
                              ageGroup: value // FIXED: Also set ageGroup field for backend carton config matching
                            }
                          }));
                        }}
                      >
                        <SelectTrigger data-testid={`select-age-group-${gender}`}>
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {KIDS_AGE_GROUPS.map((age) => (
                            <SelectItem key={age} value={age}>{age}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Mapping Summary */}
                  {mapping.mainCategory && mapping.kidsAgeGroup && (
                    <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                      ✓ Mapped to: {mapping.mainCategory} + {mapping.kidsAgeGroup}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Validation Alert - show which fields are incomplete */}
        {!allMapped && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>
              <span className="font-medium">Please complete all required mappings:</span>
              <ul className="mt-1 ml-4 list-disc text-sm">
                {detectedGenders.map(g => {
                  const m = categoryMappings[g];
                  const missing = [];
                  if (!m?.mainCategory) missing.push('Gender');
                  if (!m?.kidsAgeGroup) missing.push('Age Group');
                  if (missing.length > 0) {
                    return <li key={g}>"{g}" - {missing.join(' and ')} required</li>;
                  }
                  return null;
                }).filter(Boolean)}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="mt-6 flex justify-between">
          <Button variant="outline" onClick={goBack} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button onClick={goNext} disabled={!canGoNext()} data-testid="button-next">
            Continue <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  };

  const renderSizesStep = () => {
    if (mode === 'individual') {
      return renderIndividualSizesStep();
    }
    return renderCartonSizesStep();
  };

  // Division classification step - map division values to system divisions (Footwear, Apparel, Accessories)
  const renderDivisionStep = () => {
    // If no division values detected, allow user to set a default division for all products (file-level mapping)
    if (detectedDivisions.length === 0) {
      return (
        <div className="max-w-md mx-auto text-center">
          <Layers className="w-12 h-12 text-purple-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Product Division</h2>
          <p className="text-muted-foreground mb-6">
            No Division column detected. Select a default division for all products.
          </p>
          <div className="mb-6">
            <Select
              value={divisionMappings['__default'] || ''}
              onValueChange={(value) => {
                setDivisionMappings({ '__default': value as ProductDivision });
              }}
            >
              <SelectTrigger data-testid="select-default-division">
                <SelectValue placeholder="Select division..." />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_DIVISIONS.map((div) => (
                  <SelectItem key={div} value={div}>{div}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={goBack} data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <Button onClick={goNext} disabled={!divisionMappings['__default']} data-testid="button-next">
              Continue <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      );
    }

    // Check if all division values are mapped
    const allMapped = detectedDivisions.every(div => !!divisionMappings[div]);

    return (
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <Layers className="w-12 h-12 text-purple-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Division Value Mapping</h2>
          <p className="text-muted-foreground">
            Map each division value from your file to the system divisions
          </p>
        </div>

        {/* Legend */}
        <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-950 rounded-lg text-sm">
          <p className="font-medium text-purple-800 dark:text-purple-200 mb-1">System Division Types:</p>
          <ul className="text-purple-700 dark:text-purple-300 space-y-0.5">
            <li><strong>Footwear:</strong> Shoes, boots, sneakers, sandals, slippers</li>
            <li><strong>Apparel:</strong> Shirts, tops, jackets, pants, dresses, skirts</li>
            <li><strong>Accessories:</strong> Bags, hats, belts, socks, other items</li>
          </ul>
        </div>

        <Card className="p-6">
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-4">
              {detectedDivisions.map((divisionValue) => (
                <div key={divisionValue} className="flex items-center gap-4 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
                  <Badge variant="outline" className="font-mono text-sm min-w-[150px] truncate">
                    {divisionValue}
                  </Badge>
                  <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <Select
                    value={divisionMappings[divisionValue] || ''}
                    onValueChange={(value) => {
                      setDivisionMappings(prev => ({
                        ...prev,
                        [divisionValue]: value as ProductDivision
                      }));
                    }}
                  >
                    <SelectTrigger className="w-[180px]" data-testid={`select-division-${divisionValue}`}>
                      <SelectValue placeholder="Select division..." />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_DIVISIONS.map((div) => (
                        <SelectItem key={div} value={div}>{div}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {divisionMappings[divisionValue] && (
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>

        {/* Validation Alert */}
        {!allMapped && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>
              Please assign a division to all values ({detectedDivisions.filter(d => !divisionMappings[d]).length} remaining)
            </AlertDescription>
          </Alert>
        )}

        <div className="mt-6 flex justify-between">
          <Button variant="outline" onClick={goBack} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button onClick={goNext} disabled={!allMapped} data-testid="button-next">
            Continue <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  };

  const renderIndividualSizesStep = () => {
    const hasSizesMapped = mapping.size !== '';
    
    const handleSizeChartExcelUpload = async (uploadedFile: File) => {
      setSizeChartExcelFile(uploadedFile);
      setIsParsingSizeChartExcel(true);
      
      try {
        const formData = new FormData();
        formData.append('file', uploadedFile);
        formData.append('mappingType', 'gender-based');
        
        // Parse as gender-based mapping to get sizes per gender
        const response = await fetch('/api/size-charts/parse-mapping', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to parse file');
        }
        
        const data = await response.json();
        
        if (data.mappings && data.mappings.length > 0) {
          // Store the gender->sizes mappings for processing
          setIndividualSizeChartMappings(data.mappings);
          
          // Show success with gender breakdown
          const genderSummary = data.mappings.map((m: any) => `${m.key}: ${m.sizes.length} sizes`).join(', ');
          toast({ 
            title: "Size chart loaded", 
            description: `Found ${data.mappings.length} gender groups (${genderSummary})`
          });
        } else {
          throw new Error('No size mappings found in the file');
        }
      } catch (error) {
        toast({ title: "Upload failed", description: String(error), variant: "destructive" });
        setSizeChartExcelFile(null);
      } finally {
        setIsParsingSizeChartExcel(false);
      }
    };
    
    return (
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <Ruler className="w-12 h-12 text-purple-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Select Size Chart</h2>
          <p className="text-muted-foreground">
            Choose a size chart for your products
          </p>
        </div>

        {hasSizesMapped && (
          <Card className="p-4 mb-6 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Sizes mapped from Excel
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  You mapped the "{mapping.size}" column to sizes. You can skip this step or select a size chart for validation.
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              className="w-full mt-3 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900"
              onClick={goNext}
              data-testid="button-skip-sizes"
            >
              Skip to Next <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Card>
        )}

        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-3">Create a new size chart:</p>
            
            <Card className="p-4 border-dashed">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-3">
                  Upload an Excel file with size chart data
                </p>
                <div className="text-xs text-muted-foreground mb-4 p-3 bg-muted rounded-lg overflow-x-auto">
                  <p className="font-medium mb-2">Example format:</p>
                  <table className="mx-auto text-left border-collapse">
                    <tbody>
                      <tr className="bg-blue-50 dark:bg-blue-950">
                        <td className="px-2 py-1 border font-medium">Men Size</td>
                        <td className="px-2 py-1 border">38</td>
                        <td className="px-2 py-1 border">39</td>
                        <td className="px-2 py-1 border">40</td>
                        <td className="px-2 py-1 border">42</td>
                        <td className="px-2 py-1 border">44</td>
                      </tr>
                      <tr>
                        <td className="px-2 py-1 border font-medium">Women Size</td>
                        <td className="px-2 py-1 border">35</td>
                        <td className="px-2 py-1 border">36</td>
                        <td className="px-2 py-1 border">37</td>
                        <td className="px-2 py-1 border">38</td>
                        <td className="px-2 py-1 border">39</td>
                      </tr>
                      <tr className="bg-blue-50 dark:bg-blue-950">
                        <td className="px-2 py-1 border font-medium">Kids Size</td>
                        <td className="px-2 py-1 border">19.5</td>
                        <td className="px-2 py-1 border">23.5</td>
                        <td className="px-2 py-1 border">24</td>
                        <td className="px-2 py-1 border">27</td>
                        <td className="px-2 py-1 border">30</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs italic">Each row: gender label + sizes</p>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  id="size-chart-excel-upload"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile) handleSizeChartExcelUpload(selectedFile);
                  }}
                />
                <label htmlFor="size-chart-excel-upload">
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={isParsingSizeChartExcel}
                    asChild
                  >
                    <span>
                      {isParsingSizeChartExcel ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Parsing...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Size Chart Excel
                        </>
                      )}
                    </span>
                  </Button>
                </label>
                {sizeChartExcelFile && individualSizeChartMappings.length > 0 && (
                  <div className="mt-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-300">
                        Size chart loaded from {sizeChartExcelFile.name}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {individualSizeChartMappings.map((m, idx) => (
                        <div key={idx} className="text-xs text-green-600 dark:text-green-400">
                          <span className="font-medium">{m.key}:</span> {m.sizes.join(', ')}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
            
            {/* Gender to Size Chart Row Mapping */}
            {sizeChartExcelFile && individualSizeChartMappings.length > 0 && detectedGenders.length > 0 && (
              <Card className="p-4 mt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4" />
                  Map Product Genders to Size Chart Rows
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Each product gender will get sizes from the mapped size chart row
                </p>
                <div className="space-y-3">
                  {detectedGenders.map((productGender) => {
                    const selectedRow = genderToSizeChartRowMap[productGender] || '';
                    const matchedSizes = individualSizeChartMappings.find(m => m.key === selectedRow)?.sizes || [];
                    
                    return (
                      <div key={productGender} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{productGender}</div>
                          <div className="text-xs text-muted-foreground">Product gender from Excel</div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1">
                          <Select
                            value={selectedRow}
                            onValueChange={(value) => {
                              setGenderToSizeChartRowMap(prev => ({
                                ...prev,
                                [productGender]: value
                              }));
                            }}
                          >
                            <SelectTrigger className="w-full" data-testid={`select-size-chart-row-${productGender}`}>
                              <SelectValue placeholder="Select size chart row" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__skip__" className="text-muted-foreground">
                                No sizes (skip)
                              </SelectItem>
                              {individualSizeChartMappings.map((row) => (
                                <SelectItem key={row.key} value={row.key}>
                                  {row.key} ({row.sizes.length} sizes)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedRow === '__skip__' && (
                            <div className="text-xs text-muted-foreground mt-1 italic">
                              Products with this gender will have no sizes
                            </div>
                          )}
                          {selectedRow && selectedRow !== '__skip__' && matchedSizes.length > 0 && (
                            <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                              Sizes: {matchedSizes.slice(0, 6).join(', ')}{matchedSizes.length > 6 ? '...' : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>

          <Dialog open={isCreatingSizeChart} onOpenChange={setIsCreatingSizeChart}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Size Chart</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={newSizeChartName}
                    onChange={(e) => setNewSizeChartName(e.target.value)}
                    placeholder="e.g., US Men's Footwear"
                    data-testid="input-size-chart-name"
                  />
                </div>
                <div>
                  <Label>Sizes (comma-separated)</Label>
                  <Input
                    value={newSizeChartSizes}
                    onChange={(e) => setNewSizeChartSizes(e.target.value)}
                    placeholder="e.g., 6, 7, 8, 9, 10, 11, 12"
                    data-testid="input-size-chart-sizes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button 
                  onClick={() => createSizeChartMutation.mutate()} 
                  disabled={!newSizeChartName.trim() || !newSizeChartSizes.trim()}
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mt-8 flex justify-between">
          <Button variant="outline" onClick={goBack} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button onClick={goNext} disabled={!canGoNext()} data-testid="button-next">
            Continue <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  };

  const renderCartonSizesStep = () => {
    // Show genders from the uploaded config
    const configGenders = Object.keys(genderCartonConfig);
    const normalizedGenders = Object.values(genderNormalizationMap);
    
    // Show genders from the uploaded Excel config, or detected genders if no config yet
    const gendersToShow = configGenders.length > 0
      ? configGenders
      : normalizedGenders.length > 0 
        ? Array.from(new Set(normalizedGenders))
        : [...STANDARDIZED_GENDERS];

    const updateGenderConfig = (gender: string, update: Partial<CartonConfig>) => {
      setGenderCartonConfig(prev => ({
        ...prev,
        [gender]: {
          ...prev[gender] || { sizes: [], unitsPerSize: {} },
          ...update
        }
      }));
    };

    const handleCartonExcelUpload = async (uploadedFile: File) => {
      setCartonExcelFile(uploadedFile);
      setIsParsingCartonExcel(true);
      
      try {
        const formData = new FormData();
        formData.append('file', uploadedFile);
        
        const response = await fetch('/api/preorder/parse-carton-config', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to parse file');
        }
        
        const data = await response.json();
        
        // Data format: { genderConfigs: { [gender]: { sizes: string[], unitsPerSize: Record<string, number> } } }
        if (data.genderConfigs) {
          setGenderCartonConfig(data.genderConfigs);
          toast({ title: "Configuration loaded", description: `Loaded carton config for ${Object.keys(data.genderConfigs).length} gender(s)` });
        }
      } catch (error) {
        toast({ title: "Parse failed", description: String(error), variant: "destructive" });
      } finally {
        setIsParsingCartonExcel(false);
      }
    };

    const hasAnyConfig = Object.keys(genderCartonConfig).length > 0 && 
      Object.values(genderCartonConfig).some(c => c.sizes.length > 0);

    return (
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <Box className="w-12 h-12 text-purple-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Configure Cartons</h2>
          <p className="text-muted-foreground">
            Define sizes and quantities per carton for each gender
          </p>
        </div>

        <Card className="p-6 mb-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Upload an Excel file with <span className="font-medium">sizes in columns</span> and <span className="font-medium">genders in rows</span>
              </p>
              <div className="text-xs text-muted-foreground mb-4 p-3 bg-muted rounded-lg overflow-x-auto">
                <p className="font-medium mb-2">Example format (horizontal layout):</p>
                <table className="mx-auto text-left border-collapse">
                  <tbody>
                    <tr className="bg-blue-50 dark:bg-blue-950">
                      <td className="px-2 py-1 border font-medium">Size</td>
                      <td className="px-2 py-1 border">40</td>
                      <td className="px-2 py-1 border">41</td>
                      <td className="px-2 py-1 border">42</td>
                      <td className="px-2 py-1 border">43</td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 border font-medium">MEN Units</td>
                      <td className="px-2 py-1 border">1</td>
                      <td className="px-2 py-1 border">2</td>
                      <td className="px-2 py-1 border">2</td>
                      <td className="px-2 py-1 border">3</td>
                    </tr>
                    <tr className="bg-blue-50 dark:bg-blue-950">
                      <td className="px-2 py-1 border font-medium">Size</td>
                      <td className="px-2 py-1 border">36</td>
                      <td className="px-2 py-1 border">37</td>
                      <td className="px-2 py-1 border">38</td>
                      <td className="px-2 py-1 border">39</td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 border font-medium">WOMEN Units</td>
                      <td className="px-2 py-1 border">1</td>
                      <td className="px-2 py-1 border">2</td>
                      <td className="px-2 py-1 border">2</td>
                      <td className="px-2 py-1 border">2</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-2 text-xs italic">Multiple genders can share the same Size row</p>
              </div>
              
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCartonExcelUpload(f);
                }}
                className="hidden"
                id="carton-config-upload"
                data-testid="input-carton-config-file"
              />
              <label htmlFor="carton-config-upload">
                <Button asChild disabled={isParsingCartonExcel} className="cursor-pointer">
                  <span>
                    {isParsingCartonExcel ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Parsing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" /> 
                        {cartonExcelFile ? 'Upload Different File' : 'Upload Carton Config'}
                      </>
                    )}
                  </span>
                </Button>
              </label>
              
              {cartonExcelFile && !isParsingCartonExcel && (
                <p className="text-sm text-green-600 mt-2 flex items-center justify-center gap-1">
                  <Check className="w-4 h-4" /> {cartonExcelFile.name}
                </p>
              )}
            </div>
          </Card>

        {/* Show configuration from upload */}
        {hasAnyConfig && (
          <Tabs defaultValue={gendersToShow[0]} className="w-full">
            <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${gendersToShow.length}, 1fr)` }}>
              {gendersToShow.map((gender) => (
                <TabsTrigger key={gender} value={gender} className="text-sm">
                  {gender}
                  {genderCartonConfig[gender]?.mappedGender && (
                    <Check className="w-3 h-3 ml-1 text-green-500" />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {gendersToShow.map((gender) => {
              const config = genderCartonConfig[gender] || { sizes: [], unitsPerSize: {} };
              const totalUnits = Object.values(config.unitsPerSize).reduce((sum, n) => sum + (n || 0), 0);

              return (
                <TabsContent key={gender} value={gender} className="mt-4">
                  <Card className="p-6">
                    <div className="space-y-4">
                      {config.sizes.length > 0 && (
                        <>
                          {/* Gender + Age Group Mapping Section */}
                          <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                            <Label className="mb-3 block text-blue-800 dark:text-blue-300 font-semibold">
                              Map "{gender}" to Product Classification
                            </Label>
                            <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
                              This mapping tells the system which products should use this carton configuration
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label className="text-sm">Gender</Label>
                                <Select 
                                  value={config.mappedGender || ''} 
                                  onValueChange={(val) => updateGenderConfig(gender, { mappedGender: val })}
                                >
                                  <SelectTrigger data-testid={`select-mapped-gender-${gender}`}>
                                    <SelectValue placeholder="Select gender..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {MAIN_CATEGORIES.map((cat) => (
                                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-sm">Age Group</Label>
                                <Select 
                                  value={config.mappedAgeGroup || ''} 
                                  onValueChange={(val) => updateGenderConfig(gender, { mappedAgeGroup: val })}
                                >
                                  <SelectTrigger data-testid={`select-mapped-age-${gender}`}>
                                    <SelectValue placeholder="Select age group..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {KIDS_AGE_GROUPS.map((age) => (
                                      <SelectItem key={age} value={age}>{age}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            {config.mappedGender && config.mappedAgeGroup && (
                              <div className="mt-3 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                                <Check className="w-4 h-4" />
                                <span>Products classified as <strong>{config.mappedGender} + {config.mappedAgeGroup}</strong> will use this carton config</span>
                              </div>
                            )}
                          </div>

                          <div>
                            <Label className="mb-3 block">Units per Size in Carton</Label>
                            <div className="grid grid-cols-4 gap-3">
                              {config.sizes.map((size) => (
                                <div key={size} className="space-y-1">
                                  <Label className="text-xs text-center block">{size}</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={config.unitsPerSize[size] || ''}
                                    onChange={(e) => {
                                      const units = parseInt(e.target.value) || 0;
                                      updateGenderConfig(gender, {
                                        unitsPerSize: { ...config.unitsPerSize, [size]: units }
                                      });
                                    }}
                                    placeholder="0"
                                    className="text-center"
                                    data-testid={`input-units-${gender}-${size}`}
                                  />
                                </div>
                              ))}
                            </div>
                            
                            <div className="mt-4 p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medium">Total Units per Carton:</span>
                                <span className="text-lg font-bold text-purple-600">{totalUnits}</span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {config.sizes.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No configuration loaded for this gender yet
                        </p>
                      )}
                    </div>
                  </Card>
                </TabsContent>
              );
            })}
          </Tabs>
        )}

        <div className="mt-6 flex justify-between">
          <Button variant="outline" onClick={goBack} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button onClick={goNext} disabled={!canGoNext()} data-testid="button-next">
            Continue <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  };

  const renderImagesStep = () => {
    const isUploading = imageUploadProgress?.status === 'running';
    const isUploadStopped = imageUploadProgress?.status === 'stopped';
    const isUploadCompleted = imageUploadProgress?.status === 'completed';
    const showEmbeddedProgressDiv = imageSource === 'embedded' && embeddedUploadView === 'progress'
      && (isUploading || isUploadStopped || isUploadCompleted);
    
    // Get sample image URL from the first row of uploaded data
    const sampleImageUrl = preview?.previewRows?.[0]?.[mapping.image1] || '';
    
    // Generate preview URLs based on pattern replacement
    const getPreviewUrl = (imageNum: 2 | 3 | 4) => {
      if (!sampleImageUrl || !urlPatternConfig.findPattern) return '';
      const replacement = imageNum === 2 ? urlPatternConfig.replaceImage2 
        : imageNum === 3 ? urlPatternConfig.replaceImage3 
        : urlPatternConfig.replaceImage4;
      if (!replacement) return '';
      return sampleImageUrl.replace(urlPatternConfig.findPattern, replacement);
    };
    
    // Handle ZIP file upload
    const handleZipFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const zipFile = e.target.files?.[0];
      const uploadTempDataId = preview?.tempDataId || rawPreview?.tempDataId;
      if (!zipFile || !uploadTempDataId) return;
      
      setZipFileName(zipFile.name);
      setZipUploading(true);
      
      try {
        const formData = new FormData();
        formData.append('file', zipFile);
        formData.append('tempDataId', uploadTempDataId);
        formData.append('matchColumn', mapping.barcode || 'barcode');
        
        const response = await fetch('/api/preorder/upload-images-zip', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to upload ZIP');
        }
        
        const data = await response.json();
        setZipUploading(false);
        setZipUploadJobId(data.jobId);
        
        // Start polling for progress
        const pollProgress = async () => {
          try {
            const statusRes = await fetch(`/api/preorder/extract-images/${data.jobId}`, {
              credentials: 'include'
            });
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              const progressWithError = { ...statusData.progress, error: statusData.error || statusData.progress?.error };
              setZipUploadProgress(progressWithError);
              
              if (statusData.status === 'running') {
                setTimeout(pollProgress, 1000);
              }
            }
          } catch (err) {
            console.error('Error polling ZIP progress:', err);
          }
        };
        
        pollProgress();
        toast({ title: "ZIP upload started", description: "Processing images..." });
      } catch (error) {
        toast({ title: "Upload failed", description: String(error), variant: "destructive" });
        setZipFileName(null);
        setZipUploading(false);
      }
    };
    
    return (
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6">
          <Image className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Image Source</h2>
          <p className="text-muted-foreground">
            Choose where product images come from
          </p>
        </div>

        {showEmbeddedProgressDiv ? (
          <Card className="p-6">
            <div className="text-center">
              {isUploadCompleted ? (
                <>
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Images Uploaded to Cloudinary</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {imageUploadProgress?.imagesProcessed ?? 0} / {imageUploadProgress?.totalImages ?? 0} images
                  </p>
                  <div className="flex justify-center gap-3 mt-4 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (imageUploadJobId) {
                          fetch(`/api/preorder/extract-images/${imageUploadJobId}/stop`, { method: 'POST', credentials: 'include' }).catch(console.error);
                        }
                        setImageUploadJobId(null);
                        setImageUploadProgress(null);
                        setEmbeddedUploadView('source');
                      }}
                    >
                      <ArrowLeft className="w-4 h-4 mr-1" />
                      Go Back
                    </Button>
                    <Button size="sm" onClick={() => setStep('review')}>
                      Continue to Review <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <RefreshCw className="w-12 h-12 text-red-500 mx-auto mb-4 animate-spin" />
                  <h3 className="text-lg font-semibold mb-2">Uploading Images to Cloudinary</h3>
                  <p className="text-sm text-muted-foreground mb-4">{imageUploadProgress?.message}</p>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-2">
                    <div className="bg-red-500 h-3 rounded-full transition-all duration-300" style={{ width: `${imageUploadProgress?.percent ?? 0}%` }} />
                  </div>
                  <p className="text-sm font-medium mb-4">
                    {imageUploadProgress?.imagesProcessed ?? 0} / {imageUploadProgress?.totalImages ?? 0} images
                  </p>
                  <div className="flex justify-center gap-3 mt-4 pt-4 border-t">
                    <Button variant="outline" size="sm" onClick={() => {
                      if (imageUploadJobId) fetch(`/api/preorder/extract-images/${imageUploadJobId}/stop`, { method: 'POST', credentials: 'include' }).catch(console.error);
                      setImageUploadJobId(null);
                      setImageUploadProgress(prev => prev ? { ...prev, status: 'stopped' as const, message: 'Upload paused' } : null);
                      setEmbeddedUploadView('source');
                    }}>
                      <ArrowLeft className="w-4 h-4 mr-1" /> Go Back
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      data-testid={isUploadStopped ? 'button-resume-upload' : undefined}
                      onClick={isUploadStopped ? () => startEmbeddedImageExtraction() : async () => {
                        if (imageUploadJobId) {
                          try {
                            await fetch(`/api/preorder/extract-images/${imageUploadJobId}/stop`, { method: 'POST', credentials: 'include' });
                            setImageUploadProgress(prev => prev ? { ...prev, status: 'stopped' as const, message: 'Upload paused' } : null);
                            setImageUploadJobId(null);
                            toast({ title: "Upload paused", description: `${imageUploadProgress?.imagesProcessed ?? 0} images uploaded` });
                          } catch (err) { console.error('Failed to pause upload:', err); }
                        }
                      }}
                    >
                      {isUploadStopped ? <><RefreshCw className="w-4 h-4 mr-1" /> Resume</> : <><StopCircle className="w-4 h-4 mr-1" /> Stop</>}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={async () => {
                      if (imageUploadJobId) await fetch(`/api/preorder/extract-images/${imageUploadJobId}/stop`, { method: 'POST', credentials: 'include' }).catch(console.error);
                      setImageUploadJobId(null);
                      setImageUploadProgress(null);
                      setImageSource('none');
                      setEmbeddedUploadView('source');
                      toast({ title: "Skipped image upload", description: "Products will have no images from Excel" });
                      goNext();
                    }}>
                      Skip Images <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {[
              { value: 'embedded', label: 'Embedded in Excel', desc: 'Images are inside your Excel file' },
              { value: 'column', label: 'From URL', desc: 'Generate image URLs using pattern replacement' },
              { value: 'zip', label: 'ZIP Upload', desc: 'Upload a ZIP file with images' },
              { value: 'none', label: 'No Images', desc: 'Skip image processing' },
            ].map((option) => (
              <Card
                key={option.value}
                onClick={() => setImageSource(option.value as any)}
                className={`p-4 cursor-pointer transition-all ${
                  imageSource === option.value ? 'ring-2 ring-red-500 bg-red-50 dark:bg-red-950' : ''
                }`}
                data-testid={`image-source-${option.value}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    imageSource === option.value ? 'border-red-500' : 'border-gray-300'
                  }`}>
                    {imageSource === option.value && <div className="w-2 h-2 rounded-full bg-red-500" />}
                  </div>
                  <div>
                    <p className="font-medium">{option.label}</p>
                    <p className="text-xs text-muted-foreground">{option.desc}</p>
                  </div>
                </div>
              </Card>
            ))}
            
            {/* ZIP Upload Configuration - shown when "ZIP Upload" is selected */}
            {imageSource === 'zip' && (
              <Card className="p-4 mt-4 border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/50">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  ZIP File Upload
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Upload a ZIP file containing product images. Image filenames should match the UPC/barcode 
                  of the products (e.g., "123456789012.jpg" will match product with UPC "123456789012").
                </p>
                
                {!zipUploadJobId ? (
                  <div className="space-y-4">
                    <div 
                      className="border-2 border-dashed border-red-300 dark:border-red-700 rounded-lg p-6 text-center hover:border-red-400 transition-colors cursor-pointer"
                      onClick={() => document.getElementById('zip-file-input')?.click()}
                    >
                      <Upload className="w-8 h-8 mx-auto text-red-400 mb-2" />
                      <p className="text-sm font-medium">Click to select ZIP file</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Contains images named by UPC/barcode
                      </p>
                      <input
                        id="zip-file-input"
                        type="file"
                        accept=".zip"
                        className="hidden"
                        onChange={handleZipFileUpload}
                        data-testid="input-zip-file"
                      />
                    </div>
                    {zipFileName && (
                      <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-800">
                        {zipUploading ? (
                          <Loader2 className="w-4 h-4 text-green-500 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        )}
                        <span className="text-sm font-medium text-green-700 dark:text-green-300">{zipFileName}</span>
                        {zipUploading && (
                          <span className="text-xs text-green-600 dark:text-green-400 ml-auto">Uploading...</span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{zipUploadProgress?.message || 'Processing...'}</span>
                      <span className="font-bold text-red-600">{zipUploadProgress?.percent || 0}%</span>
                    </div>
                    <Progress value={zipUploadProgress?.percent || 0} className="h-2" />
                    {zipUploadProgress?.stage === 'completed' && (
                      <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-800">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-sm text-green-700 dark:text-green-300">
                          {zipUploadProgress?.imagesProcessed || 0} images uploaded and ready for matching
                        </span>
                      </div>
                    )}
                    {zipUploadProgress?.stage === 'failed' && (
                      <div className="flex flex-col gap-2 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          <span className="text-sm font-medium text-red-700 dark:text-red-300">Upload failed. Please try again.</span>
                        </div>
                        {zipUploadProgress?.error && (
                          <p className="text-xs text-red-600 dark:text-red-400 pl-6">{zipUploadProgress.error}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}
            
            {/* URL Pattern Configuration - shown when "From URL" is selected */}
            {imageSource === 'column' && (
              <Card className="p-4 mt-4 border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/50">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  URL Pattern Configuration
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Define a pattern to automatically generate image2, image3, and image4 URLs from image1.
                  This pattern will be applied to all products in your upload.
                </p>
                
                {/* Sample URL from first row */}
                {sampleImageUrl && (
                  <div className="mb-4 p-3 bg-white dark:bg-gray-900 rounded-lg border">
                    <Label className="text-xs text-muted-foreground">Sample Image URL (from first row):</Label>
                    <p className="text-xs font-mono break-all mt-1 text-blue-600 dark:text-blue-400">
                      {sampleImageUrl}
                    </p>
                  </div>
                )}
                
                {/* Pattern to find */}
                <div className="mb-4">
                  <Label className="text-sm font-medium">Pattern to Find in URL</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Enter the text in the URL that identifies the first image (e.g., "first", "_1", "_A")
                  </p>
                  <Input
                    value={urlPatternConfig.findPattern}
                    onChange={(e) => setUrlPatternConfig(prev => ({ ...prev, findPattern: e.target.value }))}
                    placeholder="e.g., first"
                    className="font-mono"
                    data-testid="input-pattern-find"
                  />
                </div>
                
                {/* Replacement patterns */}
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Replace for Image 2</Label>
                      <Input
                        value={urlPatternConfig.replaceImage2}
                        onChange={(e) => setUrlPatternConfig(prev => ({ ...prev, replaceImage2: e.target.value }))}
                        placeholder="e.g., second"
                        className="font-mono text-sm"
                        data-testid="input-pattern-image2"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Replace for Image 3</Label>
                      <Input
                        value={urlPatternConfig.replaceImage3}
                        onChange={(e) => setUrlPatternConfig(prev => ({ ...prev, replaceImage3: e.target.value }))}
                        placeholder="e.g., third"
                        className="font-mono text-sm"
                        data-testid="input-pattern-image3"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Replace for Image 4</Label>
                      <Input
                        value={urlPatternConfig.replaceImage4}
                        onChange={(e) => setUrlPatternConfig(prev => ({ ...prev, replaceImage4: e.target.value }))}
                        placeholder="e.g., fourth"
                        className="font-mono text-sm"
                        data-testid="input-pattern-image4"
                      />
                    </div>
                  </div>
                </div>
                
                {/* Preview generated URLs */}
                {urlPatternConfig.findPattern && sampleImageUrl && (
                  <div className="mt-4 p-3 bg-white dark:bg-gray-900 rounded-lg border">
                    <Label className="text-xs font-medium mb-2 block">Preview Generated URLs:</Label>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex items-start gap-2">
                        <Badge variant="outline" className="shrink-0">1</Badge>
                        <span className="break-all text-green-600 dark:text-green-400">{sampleImageUrl}</span>
                      </div>
                      {urlPatternConfig.replaceImage2 && (
                        <div className="flex items-start gap-2">
                          <Badge variant="outline" className="shrink-0">2</Badge>
                          <span className="break-all text-blue-600 dark:text-blue-400">{getPreviewUrl(2)}</span>
                        </div>
                      )}
                      {urlPatternConfig.replaceImage3 && (
                        <div className="flex items-start gap-2">
                          <Badge variant="outline" className="shrink-0">3</Badge>
                          <span className="break-all text-purple-600 dark:text-purple-400">{getPreviewUrl(3)}</span>
                        </div>
                      )}
                      {urlPatternConfig.replaceImage4 && (
                        <div className="flex items-start gap-2">
                          <Badge variant="outline" className="shrink-0">4</Badge>
                          <span className="break-all text-red-600 dark:text-red-400">{getPreviewUrl(4)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {!showEmbeddedProgressDiv && (
          <div className="mt-8 flex justify-between">
            <Button variant="outline" onClick={goBack} data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <Button onClick={goNext} data-testid="button-next">
              Continue <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderReviewStep = () => (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-6">
        <Eye className="w-12 h-12 text-blue-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Review Products</h2>
        <p className="text-muted-foreground">
          Preview your products before creating the collection
        </p>
      </div>

      <Card className="p-6 mb-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Upload Type:</span>
            <span className="ml-2 font-medium">{mode === 'carton' ? 'Carton Products' : 'Individual Products'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Brand:</span>
            <span className="ml-2 font-medium">{selectedBrandName}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Total Rows:</span>
            <span className="ml-2 font-medium">{preview?.totalRows || 0}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Image Source:</span>
            <span className="ml-2 font-medium capitalize">{imageSource}</span>
          </div>
        </div>

        {mode === 'carton' && Object.keys(genderCartonConfig).length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm font-medium mb-2">Carton Configuration:</p>
            <div className="space-y-2">
              {Object.entries(genderCartonConfig).map(([gender, config]) => {
                const total = Object.values(config.unitsPerSize).reduce((s, n) => s + (n || 0), 0);
                return (
                  <div key={gender} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline">{gender}</Badge>
                    <span>{config.sizes.join(', ')}</span>
                    <span className="text-muted-foreground">({total} units/carton)</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <p className="text-sm font-medium mb-3">Sample Products:</p>
        <ScrollArea className="h-[200px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Sizes</TableHead>
                <TableHead>Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(preview?.previewRows ?? []).slice(0, 10).map((row, idx) => {
                const rawGender = row[mapping.gender] || '';
                const normalizedGender = genderNormalizationMap[rawGender] || rawGender;
                
                // For individual mode with size column mapped, use the size from the row
                let sizeDisplay: string | null = null;
                if (mode === 'individual' && mapping.size) {
                  const sizeValue = row[mapping.size];
                  sizeDisplay = sizeValue ? String(sizeValue) : null;
                }
                
                // For carton mode or individual without size column, try size chart lookups
                let sizes: string[] = [];
                if (!sizeDisplay) {
                  if (mode === 'carton') {
                    // For carton mode, use genderCartonConfig
                    // Try to match product gender to carton config keys
                    const productGender = normalizedGender || rawGender;
                    
                    // Try exact match first (case-insensitive)
                    let matchedConfigKey: string | undefined;
                    for (const configKey of Object.keys(genderCartonConfig)) {
                      if (configKey.toLowerCase() === productGender.toLowerCase()) {
                        matchedConfigKey = configKey;
                        break;
                      }
                    }
                    
                    // If no exact match, try matching against mappedGender in config
                    if (!matchedConfigKey) {
                      for (const [configKey, config] of Object.entries(genderCartonConfig)) {
                        if (config.mappedGender?.toLowerCase() === productGender.toLowerCase()) {
                          matchedConfigKey = configKey;
                          break;
                        }
                      }
                    }
                    
                    if (matchedConfigKey && genderCartonConfig[matchedConfigKey]) {
                      sizes = genderCartonConfig[matchedConfigKey].sizes || [];
                    }
                  } else {
                    // For individual mode, use individualSizeChartMappings
                    // Try multiple lookups to find sizes:
                    // 1. Explicit mapping by raw gender
                    // 2. Explicit mapping by normalized gender
                    // 3. Direct match: find size chart row that contains the gender name
                    let sizeChartRowKey = genderToSizeChartRowMap[rawGender] || genderToSizeChartRowMap[normalizedGender];
                    
                    // If no explicit mapping, try to find a matching size chart row by exact gender name (case-insensitive, no partial matching)
                    if (!sizeChartRowKey && normalizedGender && individualSizeChartMappings.length > 0) {
                      const genderLower = normalizedGender.toLowerCase();
                      const matchingRow = individualSizeChartMappings.find(m => 
                        m.key.toLowerCase() === genderLower
                      );
                      if (matchingRow) sizeChartRowKey = matchingRow.key;
                    }
                    
                    sizes = sizeChartRowKey && sizeChartRowKey !== '__skip__'
                      ? individualSizeChartMappings.find(m => m.key === sizeChartRowKey)?.sizes || []
                      : [];
                  }
                }
                
                return (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs">{row[mapping.sku] || '-'}</TableCell>
                    <TableCell className="truncate max-w-[200px]">{row[mapping.name] || '-'}</TableCell>
                    <TableCell>{normalizedGender || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {sizeDisplay 
                        ? sizeDisplay
                        : sizes.length > 0 
                          ? sizes.slice(0, 4).join(', ') + (sizes.length > 4 ? '...' : '')
                          : <span className="italic">None</span>
                      }
                    </TableCell>
                    <TableCell>{row[mapping.wholesalePrice] || '-'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      <div className="mt-6 flex justify-between">
        <Button variant="outline" onClick={goBack} data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button onClick={goNext} data-testid="button-next">
          Continue <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* Catalogue continue dialog - choose In Stock, Pre-order, or Catalogue */}
      {isCatalogueUpload && (
        <Dialog open={showCatalogueContinueDialog} onOpenChange={setShowCatalogueContinueDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>How would you like to add these products?</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Select how these products should be added to your catalog.
              </p>
              <div className="space-y-2">
                {mapping.stock && mapping.stock !== '' && (
                  <button
                    type="button"
                    onClick={() => setCatalogueProcessingChoice('stock')}
                    className={`w-full flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-colors ${
                      catalogueProcessingChoice === 'stock'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                        : 'border-gray-200 hover:border-emerald-300 dark:border-gray-700'
                    }`}
                    data-testid="option-in-stock"
                  >
                    <Warehouse className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-medium">In Stock</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Add to a Stock collection (in-warehouse inventory)</p>
                    </div>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCatalogueProcessingChoice('preorder')}
                  className={`w-full flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-colors ${
                    catalogueProcessingChoice === 'preorder'
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30'
                      : 'border-gray-200 hover:border-purple-300 dark:border-gray-700'
                  }`}
                  data-testid="option-preorder"
                >
                  <Heart className="w-5 h-5 text-purple-600 shrink-0" />
                  <div>
                    <span className="font-medium">Pre-Order</span>
                    <p className="text-xs text-muted-foreground mt-0.5">Add to a Pre-Order collection (upcoming release)</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogueProcessingChoice('catalogue')}
                  className={`w-full flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-colors ${
                    catalogueProcessingChoice === 'catalogue'
                      ? 'border-slate-500 bg-slate-50 dark:bg-slate-950/30'
                      : 'border-gray-200 hover:border-slate-300 dark:border-gray-700'
                  }`}
                  data-testid="option-catalogue"
                >
                  <BookOpen className="w-5 h-5 text-slate-600 shrink-0" />
                  <div>
                    <span className="font-medium">Continue with Catalogue</span>
                    <p className="text-xs text-muted-foreground mt-0.5">Add to Catalogue (unassigned, assign to a collection later)</p>
                  </div>
                </button>
              </div>
              {(catalogueProcessingChoice === 'stock' || catalogueProcessingChoice === 'preorder') && (
                <div className="pt-2">
                  <Label>Collection Name *</Label>
                  <Input
                    value={catalogueCollectionName}
                    onChange={(e) => setCatalogueCollectionName(e.target.value)}
                    placeholder={catalogueProcessingChoice === 'stock' ? 'e.g., Q1 2025 Stock' : 'e.g., Spring 2025 Collection'}
                    className="mt-2"
                    data-testid="input-catalogue-collection-name"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCatalogueContinueDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (catalogueProcessingChoice === 'catalogue') {
                    setShowCatalogueContinueDialog(false);
                    setStep('processing');
                    processMutation.mutate();
                  } else if ((catalogueProcessingChoice === 'stock' || catalogueProcessingChoice === 'preorder') && catalogueCollectionName.trim()) {
                    setShowCatalogueContinueDialog(false);
                    setStep('processing');
                    processMutation.mutate({
                      overrideCollectionType: catalogueProcessingChoice,
                      overrideCollectionName: catalogueCollectionName.trim()
                    });
                  }
                }}
                disabled={
                  !catalogueProcessingChoice ||
                  ((catalogueProcessingChoice === 'stock' || catalogueProcessingChoice === 'preorder') && !catalogueCollectionName.trim())
                }
                data-testid="button-catalogue-continue-confirm"
              >
                Continue
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );

  const renderCollectionStep = () => (
    <div className="max-w-md mx-auto">
      {processingError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-semibold">Processing failed: </span>
            {processingError}
          </AlertDescription>
        </Alert>
      )}
      <div className="text-center mb-6">
        <ShoppingBag className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Collection Details</h2>
        <p className="text-muted-foreground">
          {isStockUpload ? 'Name your stock collection' : 'Name your pre-order collection'}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Collection Name *</Label>
          <Input
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
            placeholder={isStockUpload ? "e.g., Q1 2025 Stock" : "e.g., Spring 2025 Collection"}
            data-testid="input-collection-name"
          />
        </div>

        <div>
          <Label>Collection Image URL (optional)</Label>
          <Input
            value={collectionImage}
            onChange={(e) => setCollectionImage(e.target.value)}
            placeholder="https://example.com/image.jpg"
            data-testid="input-collection-image"
          />
        </div>
      </div>

      <div className="mt-8 flex justify-between">
        <Button variant="outline" onClick={goBack} data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button 
          disabled={!canGoNext() || processMutation.isPending}
          className="bg-green-600 hover:bg-green-700"
          data-testid="button-create"
          onClick={() => setShowCreateConfirm(true)}
        >
          {processMutation.isPending ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              {isStockUpload ? 'Create Stock Collection' : 'Create Collection'}
            </>
          )}
        </Button>
        {showCreateConfirm && (
        <AlertDialog open={showCreateConfirm} onOpenChange={setShowCreateConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Confirm {isStockUpload ? 'Stock' : 'Pre-Order'} Collection
              </AlertDialogTitle>
              <AlertDialogDescription>
                You are about to create a <strong>{isStockUpload ? 'Stock' : 'Pre-Order'}</strong> collection named &quot;{collectionName}&quot;.
                <br /><br />
                <span className={isStockUpload ? 'text-emerald-600 dark:text-emerald-400' : 'text-purple-600 dark:text-purple-400'}>
                  Products will appear in the <strong>{isStockUpload ? 'Stock' : 'Pre-Order'}</strong> section.
                </span>
                <br /><br />
                {isStockUpload 
                  ? 'Stock products have inventory and are ready for immediate sale.' 
                  : 'Pre-order products are for upcoming collections that customers can order in advance.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-green-600 hover:bg-green-700"
                onClick={() => {
                  setShowCreateConfirm(false);
                  setStep('processing');
                  processMutation.mutate();
                }}
              >
                Yes, Create {isStockUpload ? 'Stock' : 'Pre-Order'} Collection
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        )}
      </div>
    </div>
  );

  // Helper to format duration
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Get total elapsed time
  const getTotalElapsed = () => {
    if (!uploadStartTime) return '0s';
    return formatDuration(Date.now() - uploadStartTime);
  };

  // Job Monitor step definitions with friendly names
  const jobMonitorSteps = [
    { id: 'brand', label: 'Brand Selection', icon: <Heart className="w-4 h-4" /> },
    { id: 'upload', label: 'File Upload', icon: <Upload className="w-4 h-4" /> },
    { id: 'uploading', label: 'File Processing', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'mapping', label: 'Column Mapping', icon: <Settings className="w-4 h-4" /> },
    { id: 'gender', label: 'Gender Normalization', icon: <Users className="w-4 h-4" /> },
    { id: 'sizes', label: mode === 'carton' ? 'Carton Configuration' : 'Size Chart', icon: mode === 'carton' ? <Box className="w-4 h-4" /> : <Ruler className="w-4 h-4" /> },
    { id: 'images', label: 'Image Configuration', icon: <Image className="w-4 h-4" /> },
    { id: 'review', label: 'Product Review', icon: <Eye className="w-4 h-4" /> },
    { id: 'collection', label: 'Collection Details', icon: <ShoppingBag className="w-4 h-4" /> },
    { id: 'processing', label: 'Creating Products', icon: <Zap className="w-4 h-4" /> },
  ];

  const renderProcessingStep = () => {
    const remaining = liveProgress ? liveProgress.totalProducts - liveProgress.productsProcessed : 0;
    const rawPercent = liveProgress?.percent || 0;
    // Cap at 99% while still on processing step - avoids jumping to 100% and waiting during finalization
    const progressPercent = rawPercent >= 100 ? 99 : rawPercent;
    const displayMessage = rawPercent >= 100 ? 'Finalizing...' : (liveProgress?.message || 'Processing your products... This may take a few moments.');
    
    return (
      <div className="max-w-2xl mx-auto">
        {processingError && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <span className="font-semibold">Processing failed: </span>
              {processingError}
            </AlertDescription>
          </Alert>
        )}
        <div className="text-center mb-8">
          <div className="relative inline-block">
            <RefreshCw className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-spin" />
            <div className="absolute -bottom-1 -right-1 bg-blue-100 dark:bg-blue-900 rounded-full p-1">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Creating Collection</h2>
          <p className="text-muted-foreground">
            {displayMessage}
          </p>
        </div>

        {/* Live Progress KPIs */}
        <Card className="p-6 mb-6 border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-gray-900">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-500" />
              Live Progress
            </h3>
            <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950">
              <Clock className="w-3 h-3 mr-1" />
              {liveProgress ? formatDuration(liveProgress.elapsed) : '0s'}
            </Badge>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600 dark:text-gray-400">Progress</span>
              <span className="font-bold text-blue-600">{progressPercent}%</span>
            </div>
            <div className="w-full h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* KPI Stats Grid */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm border border-gray-100 dark:border-gray-700" data-testid="kpi-total-products">
              <div className="text-3xl font-bold text-gray-800 dark:text-gray-200">
                {liveProgress?.totalProducts || preview?.totalRows || 0}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center justify-center gap-1">
                <Package className="w-3 h-3" />
                Total
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm border border-green-200 dark:border-green-800" data-testid="kpi-imported">
              <div className="text-3xl font-bold text-green-600">
                {liveProgress ? liveProgress.productsCreated + liveProgress.productsUpdated : 0}
              </div>
              <div className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Imported
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm border border-red-200 dark:border-red-800" data-testid="kpi-remaining">
              <div className="text-3xl font-bold text-red-600">
                {remaining > 0 ? remaining : 0}
              </div>
              <div className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" />
                Remaining
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm border border-blue-200 dark:border-blue-800" data-testid="kpi-processed">
              <div className="text-3xl font-bold text-blue-600">
                {liveProgress?.productsProcessed || 0}
              </div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center justify-center gap-1">
                <RefreshCw className="w-3 h-3" />
                Processed
              </div>
            </div>
          </div>

          {/* Breakdown Row */}
          <div className="mt-4 flex justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-gray-600 dark:text-gray-400">New: <span className="font-semibold text-green-600">{liveProgress?.productsCreated || 0}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-gray-600 dark:text-gray-400">Updated: <span className="font-semibold text-blue-600">{liveProgress?.productsUpdated || 0}</span></span>
            </div>
          </div>
        </Card>

        {/* Job Monitor Overview */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-500" />
              Workflow Steps
            </h3>
            <Badge variant="outline" className="text-gray-600 border-gray-300 bg-gray-50 dark:bg-gray-800">
              {stepTimings.filter(s => s.status === 'completed').length}/{jobMonitorSteps.length}
            </Badge>
          </div>

          {/* Step Timeline */}
          <div className="space-y-2">
            {jobMonitorSteps.map((monitorStep, index) => {
              const timing = stepTimings.find(t => t.stepId === monitorStep.id);
              const isCompleted = timing?.status === 'completed';
              const isInProgress = timing?.status === 'in-progress' || monitorStep.id === 'processing';
              const isPending = !timing;
              
              const duration = timing?.completedAt && timing?.startedAt 
                ? formatDuration(timing.completedAt - timing.startedAt)
                : timing?.startedAt && isInProgress
                ? 'Running...'
                : '-';

              return (
                <div 
                  key={monitorStep.id}
                  className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                    isInProgress ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-200 dark:ring-blue-800' :
                    isCompleted ? 'bg-green-50/50 dark:bg-green-900/20' :
                    'bg-gray-50/50 dark:bg-gray-800/50'
                  }`}
                >
                  {/* Status Icon */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isCompleted ? 'bg-green-500 text-white' :
                    isInProgress ? 'bg-blue-500 text-white' :
                    'bg-gray-200 dark:bg-gray-700 text-gray-400'
                  }`}>
                    {isCompleted ? (
                      <Check className="w-4 h-4" />
                    ) : isInProgress ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <span className="text-xs">{index + 1}</span>
                    )}
                  </div>

                  {/* Step Info */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${
                      isInProgress ? 'text-blue-700 dark:text-blue-300' :
                      isCompleted ? 'text-green-700 dark:text-green-300' :
                      'text-gray-500'
                    }`}>
                      {monitorStep.label}
                    </div>
                  </div>

                  {/* Duration */}
                  <div className={`text-xs font-mono flex-shrink-0 ${
                    isInProgress ? 'text-blue-600 dark:text-blue-400' :
                    isCompleted ? 'text-green-600 dark:text-green-400' :
                    'text-gray-400'
                  }`}>
                    {isPending ? '-' : duration}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* File Info */}
        <Card className="p-4 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-10 h-10 text-green-600" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{file?.name || restoredFileName || 'Unknown file'}</p>
              <p className="text-sm text-muted-foreground">
                {preview?.totalRows || 0} rows • {mode === 'carton' ? 'Carton Mode' : 'Individual Mode'} • Brand: {selectedBrandName}
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  };

  const renderCompleteStep = () => (
    <div className="max-w-md mx-auto text-center">
      <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900 mx-auto mb-6 flex items-center justify-center">
        <CheckCircle2 className="w-10 h-10 text-green-600" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Collection Created!</h2>
      <p className="text-muted-foreground mb-6">
        Your pre-order collection is ready
      </p>

      {processingResult && (
        <Card className="p-4 mb-6 text-left">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Collection:</div>
            <div className="font-medium">{processingResult.collectionName}</div>
            <div>Products Created:</div>
            <div className="font-medium text-green-600">{processingResult.productsCreated}</div>
            <div>Products Updated:</div>
            <div className="font-medium text-blue-600">{processingResult.productsUpdated}</div>
            <div>Processing Time:</div>
            <div className="font-medium">{processingResult.processingTime}</div>
          </div>
        </Card>
      )}

      <Button 
        onClick={clearUploadState}
        data-testid="button-new-upload"
      >
        Start New Upload
      </Button>
    </div>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 'mode': return renderModeStep();
      case 'brand': return renderBrandStep();
      case 'upload': return renderUploadStep();
      case 'uploading': return renderUploadingStep();
      case 'mapping': return renderMappingStep();
      case 'gender': return renderGenderStep();
      case 'sizes': return renderSizesStep();
      case 'division': return renderDivisionStep();
      case 'images': return renderImagesStep();
      case 'review': return renderReviewStep();
      case 'collection': return renderCollectionStep();
      case 'processing': return renderProcessingStep();
      case 'complete': return renderCompleteStep();
      default: return null;
    }
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className="flex flex-col min-h-[600px] bg-background rounded-lg border overflow-hidden">
      {step !== 'mode' && step !== 'complete' && mode && renderStepper()}
      
      {/* Persistent upload type indicator - prevents accidental wrong selection */}
      {step !== 'mode' && step !== 'complete' && (
        <div className={`px-6 py-2 border-b flex items-center gap-2 ${
          isCatalogueUpload
            ? 'bg-slate-50 border-slate-200 dark:bg-slate-950/30 dark:border-slate-800'
            : isStockUpload 
            ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800' 
            : 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800'
        }`}>
          {isCatalogueUpload ? (
            <>
              <BookOpen className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">Catalogue Upload</span>
              <span className="text-sm text-slate-600 dark:text-slate-400">— Products will appear in Catalogue (All Products)</span>
            </>
          ) : isStockUpload ? (
            <>
              <Warehouse className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">Stock Upload</span>
              <span className="text-sm text-emerald-600 dark:text-emerald-400">— Products will appear in Stock</span>
            </>
          ) : (
            <>
              <Heart className="w-4 h-4 text-purple-600" />
              <span className="font-semibold text-purple-700 dark:text-purple-300">Pre-Order Upload</span>
              <span className="text-sm text-purple-600 dark:text-purple-400">— Products will appear in Pre-Order</span>
            </>
          )}
        </div>
      )}
      
      <div className="flex-1 p-8 overflow-y-auto">
        {renderCurrentStep()}
      </div>
    </div>
  );
}
