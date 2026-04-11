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
  Upload, FileSpreadsheet, CheckCircle2, Heart, RefreshCw, ArrowRight, ArrowLeft, 
  Plus, X, AlertCircle, Image, Clock, Package, Check, Box, ShoppingBag, Layers,
  Users, Ruler, Settings, Eye, Zap, FileUp, Loader2, Warehouse
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

type UploadMode = 'individual' | 'carton';

type Step = 
  | 'mode'           // Choose carton vs individual
  | 'brand'          // Select brand
  | 'upload'         // Upload Excel file
  | 'uploading'      // Processing file
  | 'mapping'        // Map columns
  | 'gender'         // Gender normalization
  | 'division'       // Division classification (Footwear, Apparel, Accessories)
  | 'sizes'          // Size configuration (different for each mode)
  | 'images'         // Image source configuration
  | 'review'         // Review products
  | 'processing'     // Final processing
  | 'complete';      // Done

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

const KIDS_GENDERS = ['Male', 'Female', 'Unisex'] as const;
type KidsGender = typeof KIDS_GENDERS[number];

const KIDS_AGE_GROUPS = ['Adult', 'Junior', 'Kids', 'Infant'] as const;
type KidsAgeGroup = typeof KIDS_AGE_GROUPS[number];

// Product division types - must match FILTER_OPTIONS.divisions in filterConstants.ts
const PRODUCT_DIVISIONS = ['Footwear', 'Apparel', 'Accessories'] as const;
type ProductDivision = typeof PRODUCT_DIVISIONS[number];

interface CategoryMapping {
  mainCategory: MainCategory;
  kidsGender?: KidsGender;
  kidsAgeGroup?: KidsAgeGroup;
}

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
  stock: string;  // Stock is mandatory for stock upload
  currency: string;
  [key: string]: string;
}

interface CartonConfig {
  sizes: string[];
  unitsPerSize: Record<string, number>;
  mappedGender?: string;  // Maps to: Male, Female, Unisex
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
  productsCreated: number;
  productsUpdated: number;
  stockUpdated: number;
  errors: string[];
  processingTime: string;
}

interface StepTiming {
  stepId: Step;
  startedAt?: number;
  completedAt?: number;
  status: 'pending' | 'in-progress' | 'completed' | 'skipped';
}

// Local storage key for session recovery
const STOCK_UPLOAD_STORAGE_KEY = 'stockUploadV2Session';

// ============================================================================
// STEP DEFINITIONS
// ============================================================================

const getSteps = (mode: UploadMode): StepInfo[] => {
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

  return [...baseSteps, sizeStep, genderStep, divisionStep, ...finalSteps];
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StockUploadV2() {
  const { toast } = useToast();

  // Initialization state - prevents flash while restoring session
  const [isInitializing, setIsInitializing] = useState(true);

  // Core state
  const [mode, setMode] = useState<UploadMode | null>(null);
  const [step, setStep] = useState<Step>('mode');
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [selectedBrandName, setSelectedBrandName] = useState<string>('');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('USD');

  // File & upload state
  const [file, setFile] = useState<File | null>(null);
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

  // Gender normalization state
  const [detectedGenders, setDetectedGenders] = useState<string[]>([]);
  const [categoryMappings, setCategoryMappings] = useState<Record<string, CategoryMapping>>({});
  const [genderNormalizationMap, setGenderNormalizationMap] = useState<Record<string, StandardizedGender>>({});

  // Division mapping state - classify products by division (Footwear, Apparel, Accessories)
  const [divisionMappings, setDivisionMappings] = useState<Record<string, ProductDivision>>({});
  const [detectedDivisions, setDetectedDivisions] = useState<string[]>([]);

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

  // Image state
  const [imageSource, setImageSource] = useState<'embedded' | 'column' | 'zip' | 'none'>('none');
  const [imageUploadJobId, setImageUploadJobId] = useState<string | null>(null);
  const [imageUploadProgress, setImageUploadProgress] = useState<{
    status: 'idle' | 'running' | 'completed' | 'failed';
    percent: number;
    message: string;
    imagesProcessed: number;
    totalImages: number;
  } | null>(null);
  
  // URL pattern configuration for column mode
  const [urlPatternConfig, setUrlPatternConfig] = useState<{
    findPattern: string;
    replaceImage2: string;
    replaceImage3: string;
    replaceImage4: string;
  }>({
    findPattern: '',
    replaceImage2: '',
    replaceImage3: '',
    replaceImage4: ''
  });
  
  // ZIP image upload state
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipUploadProgress, setZipUploadProgress] = useState<{
    status: 'idle' | 'uploading' | 'completed' | 'failed';
    percent: number;
    message: string;
    imagesUploaded: number;
    totalImages: number;
  } | null>(null);

  // Processing state
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null);
  const [liveProgress, setLiveProgress] = useState<{
    productsProcessed: number;
    totalProducts: number;
    productsCreated: number;
    productsUpdated: number;
    stockUpdated: number;
    percent: number;
    message: string;
    elapsed: number;
  } | null>(null);
  
  // Step timing
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

  // Refs
  const headerProcessedRef = useRef(false);
  const processingCompletedRef = useRef(false);

  // ============================================================================
  // SESSION RECOVERY
  // ============================================================================

  // Save session to localStorage
  const saveSession = useCallback(() => {
    const session = {
      step,
      mode,
      selectedBrandId,
      selectedBrandName,
      currentJobId,
      rawPreview,
      preview,
      selectedHeaderRow,
      mapping,
      detectedGenders,
      detectedDivisions,
      categoryMappings,
      genderNormalizationMap,
      divisionMappings,
      selectedSizeChartId,
      genderCartonConfig,
      imageSource,
      urlPatternConfig,
      uploadStartTime,
      savedAt: Date.now()
    };
    localStorage.setItem(STOCK_UPLOAD_STORAGE_KEY, JSON.stringify(session));
  }, [step, mode, selectedBrandId, selectedBrandName, currentJobId, rawPreview, preview, selectedHeaderRow, 
      mapping, detectedGenders, detectedDivisions, categoryMappings, genderNormalizationMap, divisionMappings,
      selectedSizeChartId, genderCartonConfig, imageSource, urlPatternConfig, uploadStartTime]);

  // Helper to normalize transitional steps to visible steps
  const normalizeStep = (savedStep: Step): Step => {
    // Map transitional steps to their visible counterparts
    const stepMapping: Record<string, Step> = {
      'uploading': 'upload',
      'processing': 'review', 
      'complete': 'review'
    };
    return stepMapping[savedStep] || savedStep;
  };

  // Load session from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STOCK_UPLOAD_STORAGE_KEY);
      if (saved) {
        const session = JSON.parse(saved);
        // Only restore if saved within last 24 hours
        if (session.savedAt && Date.now() - session.savedAt < 24 * 60 * 60 * 1000) {
          if (session.mode) setMode(session.mode);
          if (session.step) setStep(normalizeStep(session.step));
          if (session.selectedBrandId) setSelectedBrandId(session.selectedBrandId);
          if (session.selectedBrandName) setSelectedBrandName(session.selectedBrandName);
          if (session.currentJobId) setCurrentJobId(session.currentJobId);
          if (session.rawPreview) setRawPreview(session.rawPreview);
          if (session.preview) setPreview(session.preview);
          if (session.selectedHeaderRow !== undefined) setSelectedHeaderRow(session.selectedHeaderRow);
          if (session.mapping) setMapping(session.mapping);
          if (session.detectedGenders) setDetectedGenders(session.detectedGenders);
          if (session.detectedDivisions) setDetectedDivisions(session.detectedDivisions);
          if (session.categoryMappings) setCategoryMappings(session.categoryMappings);
          if (session.genderNormalizationMap) setGenderNormalizationMap(session.genderNormalizationMap);
          if (session.divisionMappings) setDivisionMappings(session.divisionMappings);
          if (session.selectedSizeChartId) setSelectedSizeChartId(session.selectedSizeChartId);
          if (session.genderCartonConfig) setGenderCartonConfig(session.genderCartonConfig);
          if (session.imageSource) setImageSource(session.imageSource);
          if (session.urlPatternConfig) setUrlPatternConfig(session.urlPatternConfig);
          if (session.uploadStartTime) setUploadStartTime(session.uploadStartTime);
          
          toast({
            title: "Session Restored",
            description: "Your previous upload session has been restored. Continue where you left off.",
          });
        } else {
          localStorage.removeItem(STOCK_UPLOAD_STORAGE_KEY);
        }
      }
    } catch (e) {
      console.error('Failed to restore session:', e);
      localStorage.removeItem(STOCK_UPLOAD_STORAGE_KEY);
    } finally {
      setIsInitializing(false);
    }
  }, []);

  // Save session on step change
  useEffect(() => {
    if (step !== 'mode' && step !== 'complete') {
      saveSession();
    }
    if (step === 'complete') {
      localStorage.removeItem(STOCK_UPLOAD_STORAGE_KEY);
    }
  }, [step, saveSession]);

  // ============================================================================
  // STEP NAVIGATION
  // ============================================================================

  const steps = mode ? getSteps(mode) : getSteps('individual');
  const currentStepIndex = steps.findIndex(s => s.id === step);

  const canGoNext = useCallback(() => {
    switch (step) {
      case 'mode': return mode !== null;
      case 'brand': return selectedBrandId !== '';
      case 'upload': return preview !== null;
      case 'mapping': 
        // SKU and Stock are required for stock upload
        return mapping.sku !== '' && mapping.stock !== '';
      case 'gender': {
        if (detectedGenders.length === 0) return true;
        return detectedGenders.every(g => {
          const m = categoryMappings[g];
          if (!m?.mainCategory) return false;
          return !!m.kidsAgeGroup;
        });
      }
      case 'division': {
        if (detectedDivisions.length === 0) return !!divisionMappings['__default'];
        return detectedDivisions.every(d => !!divisionMappings[d]);
      }
      case 'sizes': 
        if (mode === 'carton') {
          return Object.keys(genderCartonConfig).length > 0 && 
            Object.values(genderCartonConfig).every(c => c.sizes.length > 0);
        }
        return selectedSizeChartId !== '' || mapping.size !== '';
      case 'images': return true;
      case 'review': return true;
      default: return false;
    }
  }, [step, mode, selectedBrandId, preview, mapping, detectedGenders, detectedDivisions, categoryMappings, divisionMappings, genderCartonConfig, selectedSizeChartId]);

  // Start embedded image extraction
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
      const response = await fetch('/api/stock/extract-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tempDataId: preview.tempDataId,
          headerRowIndex: selectedHeaderRow
        }),
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to start image extraction');
      
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
        const response = await fetch(`/api/stock/extract-images/${imageUploadJobId}`, {
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
          setImageUploadProgress(null);
          toast({ 
            title: "Images Uploaded", 
            description: `Successfully uploaded ${jobStatus.uploadedImages?.length || 0} images to Cloudinary` 
          });
          setStep('review');
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

  const goNext = async () => {
    const stepOrder: Step[] = ['mode', 'brand', 'upload', 'uploading', 'mapping', 'sizes', 'gender', 'division', 'images', 'review', 'processing', 'complete'];
    const currentIndex = stepOrder.indexOf(step);
    
    if (currentIndex < stepOrder.length - 1) {
      let nextStep = stepOrder[currentIndex + 1];
      if (nextStep === 'uploading') nextStep = stepOrder[currentIndex + 2];
      
      // Analyze data when moving to sizes step
      if (step === 'mapping' && nextStep === 'sizes') {
        await analyzeData();
      }
      
      // Handle embedded image extraction
      if (step === 'images' && imageSource === 'embedded') {
        const started = await startEmbeddedImageExtraction();
        if (started) return;
      }
      
      setStep(nextStep);
    }
  };

  const goBack = () => {
    const stepOrder: Step[] = ['mode', 'brand', 'upload', 'mapping', 'sizes', 'gender', 'division', 'images', 'review'];
    const currentIndex = stepOrder.indexOf(step);
    if (currentIndex > 0) {
      if (step === 'review') {
        setImageUploadProgress(null);
        setImageUploadJobId(null);
      }
      setStep(stepOrder[currentIndex - 1]);
    }
  };

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  const createBrandMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/brands', 'POST', { name: newBrandName, isActive: true });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/brands'] });
      setSelectedBrandId(data.id);
      setSelectedBrandName(data.name);
      setNewBrandName('');
      setIsCreatingBrand(false);
      toast({ title: "Brand created", description: `${data.name} has been added` });
    },
    onError: (error) => {
      toast({ title: "Failed to create brand", description: String(error), variant: "destructive" });
    }
  });

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
      toast({ title: "Size chart created", description: `${data.name} has been added` });
    },
    onError: (error) => {
      toast({ title: "Failed to create size chart", description: String(error), variant: "destructive" });
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (uploadFile: File) => {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('brandId', selectedBrandId);
      
      const response = await fetch('/api/stock/upload/start', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Upload failed');
      return response.json();
    },
    onSuccess: (data) => {
      headerProcessedRef.current = false;
      processingCompletedRef.current = false;
      setCurrentJobId(data.jobId);
      setStep('uploading');
    },
    onError: (error) => {
      toast({ title: "Upload failed", description: String(error), variant: "destructive" });
    }
  });

  const processMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview data");
      
      // Build size chart data based on mode
      let sizeChartData: any = undefined;
      if (mode === 'carton') {
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
      }
      
      const sizeChart = sizeCharts.find((sc: any) => sc.id === selectedSizeChartId);
      
      const response = await fetch('/api/stock/v2/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tempDataId: preview.tempDataId,
          brandId: selectedBrandId,
          baseCurrency: selectedCurrency,
          mapping,
          headerRowIndex: selectedHeaderRow,
          categoryMappings,
          genderNormalizationMap,
          divisionMappings: Object.keys(divisionMappings).length > 0 ? divisionMappings : undefined,
          sizeChartId: mode === 'individual' ? selectedSizeChartId : undefined,
          sizeChartSizes: sizeChart?.sizes || [],
          sizeChartMappingType: mode === 'carton' ? 'gender-based' : 'uniform',
          sizeChartMappingData: sizeChartData,
          imageSource,
          urlPatternConfig: imageSource === 'column' && urlPatternConfig.findPattern ? urlPatternConfig : undefined,
          mode
        }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Processing failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      if (data.jobId) {
        setProcessingJobId(data.jobId);
        setProcessingError(null);
      } else {
        setProcessingResult(data);
        setStep('complete');
        queryClient.invalidateQueries({ queryKey: ['/api/products'] });
        toast({ title: "Success!", description: `Processed ${data.productsCreated + data.productsUpdated} products` });
      }
    },
    onError: (error) => {
      const errMsg = String(error);
      setProcessingError(errMsg);
      toast({ 
        title: "Processing failed", 
        description: errMsg, 
        variant: "destructive",
        duration: 15000
      });
      setStep('review');
    }
  });

  // Track step timings
  useEffect(() => {
    if (step === 'mode') {
      setUploadStartTime(Date.now());
      setStepTimings([]);
      return;
    }
    
    setStepTimings(prev => {
      const updated = [...prev];
      const prevStepIndex = updated.findIndex(s => s.status === 'in-progress');
      if (prevStepIndex !== -1) {
        updated[prevStepIndex] = {
          ...updated[prevStepIndex],
          status: 'completed',
          completedAt: Date.now()
        };
      }
      
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
        const response = await fetch(`/api/stock/jobs/${currentJobId}`);
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

  // Poll for processing job status
  useEffect(() => {
    if (!processingJobId || step !== 'processing') return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/stock/jobs/${processingJobId}`);
        const jobStatus = await response.json();

        if (jobStatus.progress) {
          setLiveProgress({
            productsProcessed: jobStatus.progress.productsProcessed || 0,
            totalProducts: jobStatus.progress.totalProducts || 0,
            productsCreated: jobStatus.progress.productsCreated || 0,
            productsUpdated: jobStatus.progress.productsUpdated || 0,
            stockUpdated: jobStatus.progress.stockUpdated || 0,
            percent: jobStatus.progress.percent || 0,
            message: jobStatus.progress.message || 'Processing...',
            elapsed: jobStatus.elapsed || 0
          });
        }

        if (jobStatus.status === 'completed') {
          clearInterval(pollInterval);
          
          if (processingCompletedRef.current) return;
          processingCompletedRef.current = true;
          
          setLiveProgress(prev => prev ? {
            ...prev,
            percent: 100,
            productsProcessed: prev.totalProducts
          } : null);
          
          const elapsedMs = jobStatus.elapsed || 0;
          const elapsedSeconds = Math.floor(elapsedMs / 1000);
          const elapsedTimeStr = elapsedSeconds < 60 
            ? `${elapsedSeconds}s` 
            : `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`;
          
          const result = jobStatus.processingResult || {
            productsCreated: liveProgress?.productsCreated || 0,
            productsUpdated: liveProgress?.productsUpdated || 0,
            stockUpdated: liveProgress?.stockUpdated || 0,
            processingTime: elapsedTimeStr,
            errors: []
          };
          
          setProcessingError(null);
          setProcessingResult(result);
          setStep('complete');
          setProcessingJobId(null);
          setLiveProgress(null);
          queryClient.invalidateQueries({ queryKey: ['/api/products'] });
          toast({ title: "Success!", description: `Processed ${result.productsCreated + result.productsUpdated} products` });
        } else if (jobStatus.status === 'failed') {
          clearInterval(pollInterval);
          setProcessingJobId(null);
          setLiveProgress(null);
          const errMsg = jobStatus.error || 'Unknown error';
          setProcessingError(errMsg);
          toast({ 
            title: "Processing failed", 
            description: errMsg, 
            variant: "destructive",
            duration: 15000
          });
          setStep('review');
        }
      } catch (error) {
        console.error('Error polling processing job:', error);
        const errMsg = error instanceof Error ? error.message : 'Connection error - server may be unavailable';
        setProcessingError(errMsg);
        toast({ 
          title: "Connection error", 
          description: errMsg, 
          variant: "destructive",
          duration: 15000
        });
        clearInterval(pollInterval);
        setStep('review');
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [processingJobId, step, liveProgress]);

  // ============================================================================
  // DATA ANALYSIS
  // ============================================================================

  const analyzeData = async () => {
    if (!preview) return;
    
    try {
      // Extract unique genders when gender column is mapped
      if (mapping.gender) {
        const genderColumn = mapping.gender;
        const uniqueGenders = new Set<string>();
        preview.previewRows.forEach(row => {
          const value = row[genderColumn];
          if (value && typeof value === 'string') {
            uniqueGenders.add(value.trim().toUpperCase());
          }
        });
        const genderArray = Array.from(uniqueGenders).filter(g => g);
        setDetectedGenders(genderArray);
        const emptyMappings: Record<string, CategoryMapping> = {};
        genderArray.forEach(g => {
          emptyMappings[g] = { mainCategory: '' as MainCategory, kidsAgeGroup: '' as KidsAgeGroup };
        });
        setCategoryMappings(emptyMappings);
      } else {
        setDetectedGenders([]);
        setCategoryMappings({});
      }

      // Extract unique divisions when division column is mapped
      if (mapping.division) {
        const divisionColumn = mapping.division;
        const uniqueDivisions = new Set<string>();
        preview.previewRows.forEach(row => {
          const value = row[divisionColumn];
          if (value && typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed && !uniqueDivisions.has(trimmed)) uniqueDivisions.add(trimmed);
          }
        });
        const divisionArray = Array.from(uniqueDivisions).sort();
        setDetectedDivisions(divisionArray);
        // Auto-suggest division mapping based on keywords
        const autoMappings: Record<string, ProductDivision> = {};
        divisionArray.forEach((div: string) => {
          const lower = div.toLowerCase();
          if (lower.includes('foot') || lower.includes('shoe') || lower.includes('boot') || lower.includes('sandal') || lower.includes('sneaker')) {
            autoMappings[div] = 'Footwear';
          } else if (lower.includes('apparel') || lower.includes('cloth') || lower.includes('shirt') || lower.includes('jacket') || lower.includes('pant')) {
            autoMappings[div] = 'Apparel';
          } else if (lower.includes('accessor') || lower.includes('bag') || lower.includes('hat') || lower.includes('belt')) {
            autoMappings[div] = 'Accessories';
          }
        });
        setDivisionMappings(autoMappings);
      } else {
        setDetectedDivisions([]);
        setDivisionMappings({});
      }
    } catch (error) {
      console.error('Error analyzing data:', error);
    }
  };

  const processHeaderRow = (rowIndex: number, rawRows: any[][], tempDataId: string) => {
    if (headerProcessedRef.current) return;
    headerProcessedRef.current = true;
    
    const headerRow = rawRows[rowIndex];
    const columns = headerRow.map((cell: any) => String(cell || '').trim());
    
    const dataRows = rawRows.slice(rowIndex + 1);
    const previewRows = dataRows.slice(0, 100).map((row: any[]) => {
      const obj: Record<string, any> = {};
      columns.forEach((col: string, idx: number) => {
        obj[col] = row[idx];
      });
      return obj;
    });
    
    setPreview({
      totalRows: dataRows.length,
      previewRows,
      columns,
      fileName: file?.name || 'Unknown',
      tempDataId
    });
    
    // Auto-detect mappings
    const newMapping = { ...mapping };
    const exactMatches: Record<string, keyof ColumnMapping> = {
      'sku': 'sku', 'upc': 'sku', 'articlenumber': 'sku', 'article': 'sku',
      'barcode': 'barcode', 'ean': 'barcode', 'gtin': 'barcode',
      'name': 'name', 'productname': 'name', 'title': 'name',
      'brand': 'brand',
      'category': 'category',
      'gender': 'gender', 'sex': 'gender',
      'agegroup': 'ageGroup', 'age': 'ageGroup',
      'size': 'size',
      'image': 'image1', 'image1': 'image1', 'imageurl': 'image1',
      'image2': 'image2', 'image3': 'image3', 'image4': 'image4',
      'wholesaleprice': 'wholesalePrice', 'wholesale': 'wholesalePrice',
      'retailprice': 'retailPrice', 'retail': 'retailPrice', 'price': 'retailPrice',
      'cost': 'cost',
      'colourway': 'colourway', 'colorway': 'colourway', 'color': 'colourway', 'colour': 'colourway',
      'stock': 'stock', 'quantity': 'stock', 'qty': 'stock', 'inventory': 'stock',
      'description': 'description',
      'division': 'division',
    };
    
    columns.forEach((col: string) => {
      const normalizedCol = col.toLowerCase().replace(/[\s_-]/g, '');
      if (exactMatches[normalizedCol]) {
        newMapping[exactMatches[normalizedCol]] = col;
      }
    });
    
    setMapping(newMapping);
    setStep('mapping');
    
    toast({
      title: "File processed",
      description: `${dataRows.length} rows ready for mapping`,
    });
  };

  // Helper to format duration
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // ============================================================================
  // RENDER FUNCTIONS
  // ============================================================================

  const renderStepper = () => (
    <div className="w-full border-b bg-gray-50 dark:bg-gray-900 px-4 py-3">
      <div className="flex items-center justify-between overflow-x-auto">
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
    </div>
  );

  const renderModeStep = () => (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-8">
        <Warehouse className="w-16 h-16 text-blue-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Stock Upload Type</h2>
        <p className="text-muted-foreground">
          Choose how your stock products are organized
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card
          onClick={() => setMode('individual')}
          className={`p-6 cursor-pointer transition-all hover:shadow-md ${
            mode === 'individual' ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950' : ''
          }`}
          data-testid="mode-individual"
        >
          <div className="text-center">
            <ShoppingBag className="w-12 h-12 mx-auto mb-4 text-blue-500" />
            <h3 className="text-lg font-semibold mb-2">Individual Products</h3>
            <p className="text-sm text-muted-foreground">
              Each row represents one product with one size. Stock is tracked per size.
            </p>
          </div>
        </Card>

        <Card
          onClick={() => setMode('carton')}
          className={`p-6 cursor-pointer transition-all hover:shadow-md ${
            mode === 'carton' ? 'ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-950' : ''
          }`}
          data-testid="mode-carton"
        >
          <div className="text-center">
            <Box className="w-12 h-12 mx-auto mb-4 text-purple-500" />
            <h3 className="text-lg font-semibold mb-2">Carton Products</h3>
            <p className="text-sm text-muted-foreground">
              Each row is a style. Carton contains multiple sizes with different quantities.
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-8 flex justify-center">
        <Button onClick={goNext} disabled={!canGoNext()} size="lg" data-testid="button-next">
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
          Choose the brand for your stock upload
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
        <h2 className="text-2xl font-bold mb-2">Upload Stock File</h2>
        <p className="text-muted-foreground">
          Upload your Excel or CSV file with stock data
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
        <p className="text-muted-foreground mb-4">Supports .xlsx, .xls, .csv</p>
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
        <p className="text-muted-foreground">{file?.name}</p>
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
      { value: 'image1', label: 'Image 1 (Primary)' },
      { value: 'image2', label: 'Image 2' },
      { value: 'image3', label: 'Image 3' },
      { value: 'image4', label: 'Image 4' },
      { value: 'wholesalePrice', label: 'Wholesale Price' },
      { value: 'retailPrice', label: 'Retail Price' },
      { value: 'cost', label: 'Cost' },
      { value: 'currency', label: 'Currency' },
      { value: 'colourway', label: 'Colourway' },
      { value: 'stock', label: 'Stock/Quantity *' },
      { value: 'description', label: 'Description' },
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
                            Object.keys(newMapping).forEach(k => {
                              if (newMapping[k] === col) newMapping[k] = '';
                            });
                            if (value !== 'none') {
                              newMapping[value] = col;
                            }
                            setMapping(newMapping);
                            
                            // If gender was unmapped, clear gender-related states
                            if (previousField === 'gender' && value !== 'gender') {
                              setDetectedGenders([]);
                              setCategoryMappings({});
                              setGenderNormalizationMap({});
                            }
                            // If division was unmapped, clear division-related states
                            if (previousField === 'division' && value !== 'division') {
                              setDetectedDivisions([]);
                              setDivisionMappings({});
                            }
                            // If division column changed, re-extract from preview when moving to next step
                            if (value === 'division' && preview?.previewRows) {
                              const allDivisions = preview.previewRows
                                .map((r: any) => r[col] && String(r[col]).trim())
                                .filter(Boolean);
                              const uniqueDivisions = Array.from(new Set(allDivisions));
                              setDetectedDivisions(uniqueDivisions);
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

        {(!mapping.sku || !mapping.stock) && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>
              {!mapping.sku && !mapping.stock 
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
          <Button onClick={goNext} disabled={!canGoNext()} data-testid="button-next">
            Continue <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  };

  // Division classification step - map division values to system divisions (Footwear, Apparel, Accessories)
  const renderDivisionStep = () => {
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

  const renderGenderStep = () => {
    if (detectedGenders.length === 0) {
      return (
        <div className="max-w-md mx-auto text-center">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Category Mapping</h2>
          <p className="text-muted-foreground mb-6">
            No gender column detected. Products will use default category.
          </p>
          <Button onClick={goNext} data-testid="button-next">
            Continue <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      );
    }

    const allMapped = detectedGenders.every(g => {
      const m = categoryMappings[g];
      return !!m?.mainCategory && !!m?.kidsAgeGroup;
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

        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm">
          <p className="font-medium text-blue-800 dark:text-blue-200 mb-1">Category System:</p>
          <ul className="text-blue-700 dark:text-blue-300 space-y-0.5">
            <li><strong>Gender:</strong> Male, Female</li>
            <li><strong>Age Group:</strong> Adult, Junior, Kids, Infant</li>
          </ul>
        </div>

        <Card className="p-6">
          <div className="space-y-6">
            {detectedGenders.map((gender) => {
              const m = categoryMappings[gender] || {} as CategoryMapping;

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
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Gender *</Label>
                      <Select
                        value={m.mainCategory || ''}
                        onValueChange={(value) => {
                          setCategoryMappings(prev => ({
                            ...prev,
                            [gender]: {
                              ...prev[gender],
                              mainCategory: value as MainCategory
                            }
                          }));
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

                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Age Group *</Label>
                      <Select
                        value={m.kidsAgeGroup || ''}
                        onValueChange={(value) => {
                          setCategoryMappings(prev => ({
                            ...prev,
                            [gender]: {
                              ...prev[gender],
                              kidsAgeGroup: value as KidsAgeGroup
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

                  {m.mainCategory && m.kidsAgeGroup && (
                    <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                      ✓ Mapped to: {m.mainCategory} + {m.kidsAgeGroup}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

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

  const renderIndividualSizesStep = () => {
    const hasSizesMapped = mapping.size !== '';
    
    const handleSizeChartExcelUpload = async (uploadedFile: File) => {
      setSizeChartExcelFile(uploadedFile);
      setIsParsingSizeChartExcel(true);
      
      try {
        const formData = new FormData();
        formData.append('file', uploadedFile);
        
        const response = await fetch('/api/size-charts/parse-excel', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to parse file');
        }
        
        const data = await response.json();
        
        if (data.name && data.sizes) {
          setNewSizeChartName(data.name);
          setNewSizeChartSizes(data.sizes.join(', '));
          setIsCreatingSizeChart(true);
          toast({ title: "Size chart loaded", description: `Found ${data.sizes.length} sizes` });
        }
      } catch (error) {
        toast({ title: "Parse failed", description: String(error), variant: "destructive" });
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
            <Label>Size Chart</Label>
            <Select value={selectedSizeChartId} onValueChange={setSelectedSizeChartId}>
              <SelectTrigger data-testid="select-size-chart">
                <SelectValue placeholder="Select a size chart" />
              </SelectTrigger>
              <SelectContent>
                {sizeCharts.map((chart: any) => (
                  <SelectItem key={chart.id} value={chart.id}>
                    {chart.name} ({chart.sizes?.length || 0} sizes)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedSizeChartId && (
            <Card className="p-4 bg-purple-50 dark:bg-purple-950">
              <p className="text-sm font-medium mb-2">Sizes:</p>
              <div className="flex flex-wrap gap-2">
                {sizeCharts.find((c: any) => c.id === selectedSizeChartId)?.sizes?.map((size: string) => (
                  <Badge key={size} variant="secondary">{size}</Badge>
                ))}
              </div>
            </Card>
          )}

          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground mb-3">Or create a new size chart:</p>
            
            <Card className="p-4 border-dashed">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-3">
                  Upload an Excel file with size chart data
                </p>
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
                {sizeChartExcelFile && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Loaded: {sizeChartExcelFile.name}
                  </p>
                )}
              </div>
            </Card>
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
    const configGenders = Object.keys(genderCartonConfig);
    const normalizedGenders = Object.values(genderNormalizationMap);
    
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
    const sampleImageUrl = preview?.previewRows?.[0]?.[mapping.image1] || '';
    
    const getPreviewUrl = (imageNum: 2 | 3 | 4) => {
      if (!sampleImageUrl || !urlPatternConfig.findPattern) return '';
      const replacement = imageNum === 2 ? urlPatternConfig.replaceImage2 
        : imageNum === 3 ? urlPatternConfig.replaceImage3 
        : urlPatternConfig.replaceImage4;
      if (!replacement) return '';
      return sampleImageUrl.replace(urlPatternConfig.findPattern, replacement);
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

        {isUploading ? (
          <Card className="p-6">
            <div className="text-center">
              <RefreshCw className="w-12 h-12 text-red-500 mx-auto mb-4 animate-spin" />
              <h3 className="text-lg font-semibold mb-2">Uploading Images to Cloudinary</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {imageUploadProgress.message}
              </p>
              
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-2">
                <div 
                  className="bg-red-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${imageUploadProgress.percent}%` }}
                />
              </div>
              
              <p className="text-sm font-medium">
                {imageUploadProgress.imagesProcessed} / {imageUploadProgress.totalImages} images
              </p>
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
            
            {imageSource === 'column' && (
              <Card className="p-4 mt-4 border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/50">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  URL Pattern Configuration
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Define a pattern to automatically generate image2, image3, and image4 URLs from image1.
                </p>
                
                {sampleImageUrl && (
                  <div className="mb-4 p-3 bg-white dark:bg-gray-900 rounded-lg border">
                    <Label className="text-xs text-muted-foreground">Sample Image URL (from first row):</Label>
                    <p className="text-xs font-mono break-all mt-1 text-blue-600 dark:text-blue-400">
                      {sampleImageUrl}
                    </p>
                  </div>
                )}
                
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
                
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Replace for Image 2</Label>
                      <Input
                        value={urlPatternConfig.replaceImage2}
                        onChange={(e) => setUrlPatternConfig(prev => ({ ...prev, replaceImage2: e.target.value }))}
                        placeholder="e.g., second"
                        className="font-mono text-sm"
                        data-testid="input-pattern-replace2"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Replace for Image 3</Label>
                      <Input
                        value={urlPatternConfig.replaceImage3}
                        onChange={(e) => setUrlPatternConfig(prev => ({ ...prev, replaceImage3: e.target.value }))}
                        placeholder="e.g., third"
                        className="font-mono text-sm"
                        data-testid="input-pattern-replace3"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Replace for Image 4</Label>
                      <Input
                        value={urlPatternConfig.replaceImage4}
                        onChange={(e) => setUrlPatternConfig(prev => ({ ...prev, replaceImage4: e.target.value }))}
                        placeholder="e.g., fourth"
                        className="font-mono text-sm"
                        data-testid="input-pattern-replace4"
                      />
                    </div>
                  </div>
                  
                  {urlPatternConfig.findPattern && sampleImageUrl && (
                    <div className="mt-4 p-3 bg-white dark:bg-gray-900 rounded-lg border">
                      <Label className="text-xs text-muted-foreground mb-2 block">Preview Generated URLs:</Label>
                      <div className="space-y-1 text-xs font-mono">
                        <p className="text-green-600 dark:text-green-400 break-all">Image 1: {sampleImageUrl}</p>
                        {urlPatternConfig.replaceImage2 && (
                          <p className="text-blue-600 dark:text-blue-400 break-all">Image 2: {getPreviewUrl(2) || 'N/A'}</p>
                        )}
                        {urlPatternConfig.replaceImage3 && (
                          <p className="text-purple-600 dark:text-purple-400 break-all">Image 3: {getPreviewUrl(3) || 'N/A'}</p>
                        )}
                        {urlPatternConfig.replaceImage4 && (
                          <p className="text-red-600 dark:text-red-400 break-all">Image 4: {getPreviewUrl(4) || 'N/A'}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}
            
            {imageSource === 'zip' && (
              <Card className="p-4 mt-4 border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/50">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FileUp className="w-4 h-4" />
                  ZIP File Upload
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Upload a ZIP file containing your product images. Images should be named to match product SKUs.
                </p>
                
                <div className="text-center">
                  <input
                    type="file"
                    accept=".zip"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setZipFile(f);
                    }}
                    className="hidden"
                    id="zip-upload"
                    data-testid="input-zip-file"
                  />
                  <label htmlFor="zip-upload">
                    <Button asChild variant="outline" className="cursor-pointer">
                      <span>
                        <Upload className="w-4 h-4 mr-2" />
                        {zipFile ? 'Change ZIP File' : 'Select ZIP File'}
                      </span>
                    </Button>
                  </label>
                  
                  {zipFile && (
                    <p className="text-sm text-green-600 mt-2 flex items-center justify-center gap-1">
                      <Check className="w-4 h-4" /> {zipFile.name}
                    </p>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}

        {!isUploading && (
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
        <Eye className="w-12 h-12 text-blue-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Review Stock Upload</h2>
        <p className="text-muted-foreground">
          Preview your products before processing
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
                <TableHead>Stock</TableHead>
                <TableHead>Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview?.previewRows.slice(0, 10).map((row, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-xs">{row[mapping.sku] || '-'}</TableCell>
                  <TableCell className="truncate max-w-[200px]">{row[mapping.name] || '-'}</TableCell>
                  <TableCell>{row[mapping.gender] || '-'}</TableCell>
                  <TableCell>{row[mapping.stock] || '-'}</TableCell>
                  <TableCell>{row[mapping.wholesalePrice] || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      <div className="mt-6 flex justify-between">
        <Button variant="outline" onClick={goBack} data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button 
          onClick={() => {
            setStep('processing');
            processMutation.mutate();
          }} 
          disabled={processMutation.isPending}
          className="bg-green-600 hover:bg-green-700"
          data-testid="button-process"
        >
          {processMutation.isPending ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              Process Stock
            </>
          )}
        </Button>
      </div>
    </div>
  );

  const jobMonitorSteps = [
    { id: 'brand', label: 'Brand Selection', icon: <Heart className="w-4 h-4" /> },
    { id: 'upload', label: 'File Upload', icon: <Upload className="w-4 h-4" /> },
    { id: 'uploading', label: 'File Processing', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'mapping', label: 'Column Mapping', icon: <Settings className="w-4 h-4" /> },
    { id: 'gender', label: 'Gender Normalization', icon: <Users className="w-4 h-4" /> },
    { id: 'sizes', label: mode === 'carton' ? 'Carton Configuration' : 'Size Chart', icon: mode === 'carton' ? <Box className="w-4 h-4" /> : <Ruler className="w-4 h-4" /> },
    { id: 'images', label: 'Image Configuration', icon: <Image className="w-4 h-4" /> },
    { id: 'review', label: 'Product Review', icon: <Eye className="w-4 h-4" /> },
    { id: 'processing', label: 'Processing Stock', icon: <Zap className="w-4 h-4" /> },
  ];

  const renderProcessingStep = () => {
    const remaining = liveProgress ? liveProgress.totalProducts - liveProgress.productsProcessed : 0;
    const rawPercent = liveProgress?.percent || 0;
    // Cap at 99% while still on processing step - avoids jumping to 100% and waiting during finalization
    const progressPercent = rawPercent >= 100 ? 99 : rawPercent;
    const displayMessage = rawPercent >= 100 ? 'Finalizing...' : (liveProgress?.message || 'Processing your products... This may take a few moments.');
    
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="relative inline-block">
            <RefreshCw className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-spin" />
            <div className="absolute -bottom-1 -right-1 bg-blue-100 dark:bg-blue-900 rounded-full p-1">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Processing Stock</h2>
          <p className="text-muted-foreground">
            {displayMessage}
          </p>
        </div>

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

          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="text-3xl font-bold text-gray-800 dark:text-gray-200">
                {liveProgress?.totalProducts || preview?.totalRows || 0}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center justify-center gap-1">
                <Package className="w-3 h-3" />
                Total
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm border border-green-200 dark:border-green-800">
              <div className="text-3xl font-bold text-green-600">
                {liveProgress ? liveProgress.productsCreated + liveProgress.productsUpdated : 0}
              </div>
              <div className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Imported
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm border border-red-200 dark:border-red-800">
              <div className="text-3xl font-bold text-red-600">
                {remaining > 0 ? remaining : 0}
              </div>
              <div className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" />
                Remaining
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm border border-blue-200 dark:border-blue-800">
              <div className="text-3xl font-bold text-blue-600">
                {liveProgress?.stockUpdated || 0}
              </div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center justify-center gap-1">
                <Warehouse className="w-3 h-3" />
                Stock Updated
              </div>
            </div>
          </div>

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

                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${
                      isInProgress ? 'text-blue-700 dark:text-blue-300' :
                      isCompleted ? 'text-green-700 dark:text-green-300' :
                      'text-gray-500'
                    }`}>
                      {monitorStep.label}
                    </div>
                  </div>

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

        <Card className="p-4 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-10 h-10 text-green-600" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{file?.name || 'Unknown file'}</p>
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
      <h2 className="text-2xl font-bold mb-2">Stock Upload Complete!</h2>
      <p className="text-muted-foreground mb-6">
        Your stock has been successfully processed
      </p>

      {processingResult && (
        <Card className="p-4 mb-6 text-left">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Products Created:</div>
            <div className="font-medium text-green-600">{processingResult.productsCreated}</div>
            <div>Products Updated:</div>
            <div className="font-medium text-blue-600">{processingResult.productsUpdated}</div>
            <div>Stock Updated:</div>
            <div className="font-medium text-purple-600">{processingResult.stockUpdated}</div>
            <div>Processing Time:</div>
            <div className="font-medium">{processingResult.processingTime}</div>
          </div>
        </Card>
      )}

      <Button 
        onClick={() => {
          setMode(null);
          setStep('mode');
          setSelectedBrandId('');
          setSelectedBrandName('');
          setFile(null);
          setPreview(null);
          setRawPreview(null);
          setMapping({
            sku: '', barcode: '', name: '', brand: '', category: '', division: '', gender: '', ageGroup: '',
            size: '', image1: '', image2: '', image3: '', image4: '', description: '', 
            wholesalePrice: '', retailPrice: '', cost: '', colourway: '', stock: '', currency: ''
          });
          setDetectedGenders([]);
          setDetectedDivisions([]);
          setCategoryMappings({});
          setGenderNormalizationMap({});
          setDivisionMappings({});
          setGenderCartonConfig({});
          setSelectedSizeChartId('');
          setImageSource('none');
          setProcessingResult(null);
          setLiveProgress(null);
        }}
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
      case 'division': return renderDivisionStep();
      case 'sizes': return renderSizesStep();
      case 'images': return renderImagesStep();
      case 'review': return renderReviewStep();
      case 'processing': return renderProcessingStep();
      case 'complete': return renderCompleteStep();
      default: return null;
    }
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  // Show loading state while initializing to prevent flash
  if (isInitializing) {
    return (
      <div className="flex flex-col min-h-[600px] bg-background rounded-lg border overflow-hidden items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[600px] bg-background rounded-lg border overflow-hidden">
      {step !== 'mode' && step !== 'complete' && mode && renderStepper()}
      
      <div className="flex-1 p-8 overflow-y-auto">
        {renderCurrentStep()}
      </div>
    </div>
  );
}
