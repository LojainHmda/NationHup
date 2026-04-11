import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, FileSpreadsheet, CheckCircle2, Heart, RefreshCw, ArrowRight, ArrowLeft, Plus, X, AlertCircle, Sparkles, Image, Clock, Package, AlertTriangle, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

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

interface AnalyzedData {
  totalRows: number;
  newProducts: number;
  existingProducts: number;
  analyzedRows: any[];
  previewRows: any[];
  isLargeFile?: boolean;
  serverSideData?: boolean;
  detectedGenders?: string[];
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

interface ColumnMapping {
  sku: string;
  barcode: string;
  name: string;
  brand: string;
  category: string;
  gender: string;
  color: string;
  size: string;
  imageUrl: string;
  description: string;
  division: string;
  countryOfOrigin: string;
  wholesalePrice: string;
  retailPrice: string;
  minOrder: string;
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
  unitsPerCarton: string;
}

interface NamingToken {
  type: 'field' | 'text';
  value: string;
}

interface JobProgress {
  stage: 'queued' | 'uploading' | 'extracting' | 'processing-images' | 'building-preview' | 'completed' | 'failed';
  percent: number;
  message: string;
  imagesProcessed?: number;
  totalImages?: number;
  startedAt: number;
  completedAt?: number;
}

interface JobStatus {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: JobProgress;
  elapsed: number;
  tempDataId?: string;
  result?: {
    totalRows: number;
    rawRows: any[][];
    extractedImageUrls?: { row: number; imageUrl: string }[];
  };
  error?: string;
}

type Step = 'brand' | 'upload' | 'uploading' | 'mapping' | 'auto-naming' | 'gender-mapping' | 'size-chart' | 'preview-final' | 'collection-info' | 'processing' | 'complete';

// Steps that require image upload to be complete before advancing TO them
const STEPS_REQUIRING_IMAGE_UPLOAD: Step[] = ['auto-naming', 'gender-mapping', 'size-chart', 'preview-final', 'collection-info', 'processing'];

// Standardized gender types for the system
const STANDARDIZED_GENDERS = ['Men', 'Women', 'Adult Unisex', 'Boy', 'Girl', 'Kids Unisex'] as const;
type StandardizedGender = typeof STANDARDIZED_GENDERS[number];

export function PreOrderUpload() {
  const { toast } = useToast();
  
  // State management
  const [step, setStepRaw] = useState<Step>('brand');
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [selectedBrandName, setSelectedBrandName] = useState<string>('');
  const [isCreatingBrand, setIsCreatingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  
  // Job tracking for async uploads with localStorage persistence
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const [uploadElapsed, setUploadElapsed] = useState<number>(0);
  const [recoveredFileName, setRecoveredFileName] = useState<string | null>(null);
  
  const [file, setFile] = useState<File | null>(null);
  
  // LocalStorage key for job persistence
  const STORAGE_KEY = 'preorder_upload_job';
  const [rawPreview, setRawPreview] = useState<RawPreviewData | null>(null);
  const [selectedHeaderRow, setSelectedHeaderRow] = useState<number>(0);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [analyzedData, setAnalyzedData] = useState<AnalyzedData | null>(null);
  
  const [mapping, setMapping] = useState<ColumnMapping>({
    sku: '',
    barcode: '',
    name: '',
    brand: '',
    category: '',
    gender: '',
    color: '',
    size: '',
    imageUrl: '',
    description: '',
    division: '',
    countryOfOrigin: '',
    wholesalePrice: '',
    retailPrice: '',
    minOrder: '',
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
    discount: '',
    unitsPerCarton: ''
  });
  
  const [namingPattern, setNamingPattern] = useState<NamingToken[]>([
    { type: 'field', value: 'Brand' },
    { type: 'text', value: '-' },
    { type: 'field', value: 'UPC' }
  ]);
  
  const [editableRows, setEditableRows] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [collectionImage, setCollectionImage] = useState('');
  const [defaultValues, setDefaultValues] = useState({
    category: 'General',
    gender: 'Unisex',
  });
  const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [productsProcessed, setProductsProcessed] = useState<number>(0);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const [hasRestoredMapping, setHasRestoredMapping] = useState<boolean>(false);
  
  // Size chart selection
  const [selectedSizeChartId, setSelectedSizeChartId] = useState<string>('');
  const [isCreatingSizeChart, setIsCreatingSizeChart] = useState(false);
  const [newSizeChartName, setNewSizeChartName] = useState('');
  const [newSizeChartSizes, setNewSizeChartSizes] = useState('');
  const [newSizeChartUnitsPerSize, setNewSizeChartUnitsPerSize] = useState<Record<string, number>>({});
  const [sizeChartUploadMode, setSizeChartUploadMode] = useState<'manual' | 'excel'>('manual');
  const [excelSizesLoading, setExcelSizesLoading] = useState(false);
  const sizeChartFileInputRef = useRef<HTMLInputElement>(null);
  
  // Size chart mapping mode: 'uniform' = one chart for all, 'product-specific' = per SKU/product, 'gender-based' = per gender
  const [sizeChartMappingType, setSizeChartMappingType] = useState<'uniform' | 'product-specific' | 'gender-based'>('uniform');
  const [sizeChartMappingFile, setSizeChartMappingFile] = useState<File | null>(null);
  const [sizeChartMappingData, setSizeChartMappingData] = useState<{
    type: 'product-specific' | 'gender-based';
    mappings: Array<{ key: string; sizes: string[] }>;
    keyColumn?: string;
    parsedRows?: Array<{ key: string; sizes: string[]; rowIndex: number }>;
    sizeHeaders?: string[];
  } | null>(null);
  const [sizeChartMappingLoading, setSizeChartMappingLoading] = useState(false);
  const sizeChartMappingFileRef = useRef<HTMLInputElement>(null);
  
  // Detected genders from product sheet (for gender-based size mapping)
  const [detectedGenders, setDetectedGenders] = useState<string[]>([]);
  // Gender to size chart row mapping (for gender-based mode)
  const [genderSizeAssignments, setGenderSizeAssignments] = useState<Record<string, { key: string; sizes: string[] }>>({});
  // Gender to units per size mapping (for carton products in gender-based mode)
  const [genderUnitsPerSize, setGenderUnitsPerSize] = useState<Record<string, Record<string, number>>>({});
  // Gender normalization mapping: raw gender from file -> standardized gender type
  const [genderNormalizationMap, setGenderNormalizationMap] = useState<Record<string, StandardizedGender>>({});
  
  // Image source selection: 'embedded' = use extracted images from Excel, 'column' = use Image URL column, 'zip' = upload ZIP file, 'none' = no images
  const [imageSource, setImageSource] = useState<'embedded' | 'column' | 'zip' | 'none'>('embedded');
  
  // Image upload job tracking
  const [imageUploadJobId, setImageUploadJobId] = useState<string | null>(null);
  const [imageUploadProgress, setImageUploadProgress] = useState<{
    stage: string;
    percent: number;
    message: string;
    imagesProcessed?: number;
    totalImages?: number;
  } | null>(null);
  const [imageUploadComplete, setImageUploadComplete] = useState<boolean>(false);
  const [uploadedImagesCount, setUploadedImagesCount] = useState<number>(0);
  
  // Centralized navigation helper that validates image upload requirements
  const requiresImageUpload = useCallback(() => {
    // Check if image upload is required based on imageSource and available images
    if (imageSource === 'embedded') {
      // Only require if there are embedded images to upload
      return rawPreview?.imageColumnInfo && rawPreview.imageColumnInfo.imageCount > 0;
    } else if (imageSource === 'zip') {
      // ZIP always requires upload if selected
      return true;
    }
    // 'column' and 'none' don't require pre-upload
    return false;
  }, [imageSource, rawPreview]);
  
  // Safe step setter that validates image upload before advancing
  const setStep = useCallback((newStep: Step) => {
    // Check if the target step requires image upload to be complete
    if (STEPS_REQUIRING_IMAGE_UPLOAD.includes(newStep) && requiresImageUpload() && !imageUploadComplete) {
      console.warn(`[PreOrderUpload] Blocked navigation to ${newStep}: image upload not complete`);
      toast({
        title: "Image upload required",
        description: "Please complete the image upload before continuing.",
        variant: "destructive"
      });
      return;
    }
    setStepRaw(newStep);
  }, [requiresImageUpload, imageUploadComplete, toast]);
  
  // Persist imageSource, imageUploadComplete, and sizeChartId changes to localStorage
  useEffect(() => {
    const savedJob = localStorage.getItem(STORAGE_KEY);
    if (savedJob && imageSource) {
      try {
        const savedData = JSON.parse(savedJob);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          ...savedData,
          imageSource,
          imageUploadComplete,
          uploadedImagesCount,
          sizeChartId: selectedSizeChartId
        }));
      } catch (e) {}
    }
  }, [imageSource, imageUploadComplete, uploadedImagesCount, selectedSizeChartId]);
  const [recoveryMutationFired, setRecoveryMutationFired] = useState<boolean>(false);

  useEffect(() => {
    if (step === 'processing' && processingStartTime) {
      const interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - processingStartTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsedSeconds(0);
    }
  }, [step, processingStartTime]);

  // Recovery: Only reconnect to ACTIVE jobs (queued/running), not completed ones
  // This prevents auto-restoring old completed uploads when creating new collections
  useEffect(() => {
    const savedJob = localStorage.getItem(STORAGE_KEY);
    if (savedJob) {
      try {
        const { jobId, fileName, brandId, brandName, imageSource: savedImageSource, imageUploadComplete: savedImageUploadComplete, uploadedImagesCount: savedUploadedImagesCount, mapping: savedMapping, collectionName: savedCollectionName, collectionImage: savedCollectionImage, rawPreviewData: savedRawPreview, headerRowIndex: savedHeaderRow, sizeChartId: savedSizeChartId } = JSON.parse(savedJob);
        console.log('[PreOrderUpload] Checking for active job:', jobId);
        
        // Restore imageSource if it was saved (for session recovery)
        if (savedImageSource && (savedImageSource === 'embedded' || savedImageSource === 'column' || savedImageSource === 'zip' || savedImageSource === 'none')) {
          setImageSource(savedImageSource);
        }
        
        // Restore image upload status if it was saved
        if (savedImageUploadComplete) {
          setImageUploadComplete(true);
        }
        if (savedUploadedImagesCount) {
          setUploadedImagesCount(savedUploadedImagesCount);
        }
        
        // Restore size chart selection if it was saved
        if (savedSizeChartId) {
          setSelectedSizeChartId(savedSizeChartId);
        }
        
        // Restore mapping if available
        if (savedMapping) {
          setMapping(savedMapping);
          setHasRestoredMapping(true);
        }
        
        // Restore collection info if available
        if (savedCollectionName) setCollectionName(savedCollectionName);
        if (savedCollectionImage) setCollectionImage(savedCollectionImage);
        
        // Restore raw preview if available
        if (savedRawPreview) setRawPreview(savedRawPreview);
        
        // Restore header row selection
        if (savedHeaderRow !== undefined) setSelectedHeaderRow(savedHeaderRow);
        
        // Only check if job is still actively running
        fetch(`/api/preorder/jobs/${jobId}`, { credentials: 'include' })
          .then(res => res.json())
          .then(status => {
            if (status.status === 'queued' || status.status === 'running') {
              // Job is still active - reconnect to watch progress
              console.log('[PreOrderUpload] Reconnecting to active job:', jobId);
              setCurrentJobId(jobId);
              setRecoveredFileName(fileName);
              setSelectedBrandId(brandId || '');
              setSelectedBrandName(brandName || '');
              setStep('uploading');
              setJobProgress(status.progress);
              setUploadElapsed(status.elapsed);
              toast({
                title: "Reconnected to upload",
                description: "Found your previous upload in progress",
              });
            } else {
              // Job completed or failed - clear storage to allow new uploads
              console.log('[PreOrderUpload] Job no longer active, clearing storage');
              localStorage.removeItem(STORAGE_KEY);
            }
          })
          .catch(() => {
            // Job not found - clear storage
            console.log('[PreOrderUpload] Job not found on server, clearing storage');
            localStorage.removeItem(STORAGE_KEY);
          });
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Job polling for async uploads
  useEffect(() => {
    if (!currentJobId || step !== 'uploading') return;
    
    let isMounted = true;
    const pollInterval = 2000; // Poll every 2 seconds
    
    const pollJobStatus = async () => {
      try {
        const response = await fetch(`/api/preorder/jobs/${currentJobId}`, {
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch job status');
        }
        
        const status: JobStatus = await response.json();
        
        if (!isMounted) return;
        
        setJobProgress(status.progress);
        setUploadElapsed(status.elapsed);
        
        if (status.status === 'completed' && status.result && status.tempDataId) {
          console.log('[PreOrderUpload] Job completed! Transitioning to row-selection');
          console.log('[PreOrderUpload] Result:', { 
            totalRows: status.result.totalRows, 
            rawRowsCount: status.result.rawRows?.length,
            tempDataId: status.tempDataId 
          });
          
          // Job completed - save data to localStorage for recovery, then proceed
          const displayFileName = file?.name || recoveredFileName || 'uploaded-file';
          const rawPreviewData = {
            totalRows: status.result.totalRows,
            rawRows: status.result.rawRows,
            fileName: displayFileName,
            tempDataId: status.tempDataId,
            // Use imageColumnInfo directly from backend (images detected but not uploaded yet)
            imageColumnInfo: status.result.imageColumnInfo ? {
              columnIndex: -1,
              columnName: 'Images',
              imageCount: status.result.imageColumnInfo.imageCount
            } : undefined
          };
          
          // Save completed job data for recovery on refresh
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            jobId: currentJobId,
            fileName: displayFileName,
            brandId: selectedBrandId,
            brandName: selectedBrandName,
            tempDataId: status.tempDataId,
            rawPreviewData
          }));
          
          console.log('[PreOrderUpload] Setting rawPreview and auto-proceeding to mapping...');
          setRawPreview(rawPreviewData);
          setCurrentJobId(null);
          setRecoveredFileName(null);
          setSelectedHeaderRow(0); // Auto-set header as first row
          
          // Auto-call setHeader with row 0 to proceed directly to mapping
          setHeaderMutation.mutate({
            tempDataId: status.tempDataId,
            headerRowIndex: 0
          });
          
          toast({
            title: "Upload complete",
            description: `${status.result.totalRows} rows detected. Preparing column mapping...`,
          });
        } else if (status.status === 'failed') {
          // Job failed - clear localStorage
          localStorage.removeItem(STORAGE_KEY);
          setCurrentJobId(null);
          setRecoveredFileName(null);
          setStep('upload');
          toast({
            title: "Upload failed",
            description: status.error || "An error occurred during processing",
            variant: "destructive",
          });
        } else {
          // Still processing, poll again
          setTimeout(pollJobStatus, pollInterval);
        }
      } catch (error: any) {
        if (isMounted) {
          console.error('Job polling error:', error);
          setTimeout(pollJobStatus, pollInterval);
        }
      }
    };
    
    pollJobStatus();
    
    return () => {
      isMounted = false;
    };
  }, [currentJobId, step]);

  // Image upload job polling
  useEffect(() => {
    if (!imageUploadJobId) return;
    
    let isMounted = true;
    const pollInterval = 1500;
    
    const pollImageJobStatus = async () => {
      try {
        const response = await fetch(`/api/preorder/extract-images/${imageUploadJobId}`, {
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch image job status');
        }
        
        const status = await response.json();
        
        if (!isMounted) return;
        
        setImageUploadProgress(status.progress);
        
        if (status.status === 'completed') {
          setImageUploadComplete(true);
          setUploadedImagesCount(status.uploadedImages?.length || 0);
          setImageUploadJobId(null);
          toast({
            title: "Images uploaded",
            description: `${status.uploadedImages?.length || 0} images uploaded to Cloudinary`,
          });
        } else if (status.status === 'failed') {
          setImageUploadJobId(null);
          setImageUploadProgress(null);
          toast({
            title: "Image upload failed",
            description: status.error || "Failed to upload images",
            variant: "destructive",
          });
        } else {
          setTimeout(pollImageJobStatus, pollInterval);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Image job polling error:', error);
          setTimeout(pollImageJobStatus, pollInterval);
        }
      }
    };
    
    pollImageJobStatus();
    
    return () => {
      isMounted = false;
    };
  }, [imageUploadJobId]);

  // Poll for processing job progress
  useEffect(() => {
    if (!processingJobId || step !== 'processing') return;
    
    let isMounted = true;
    const pollInterval = 1000; // Poll every 1 second for snappy progress updates
    
    const pollProcessingJobStatus = async () => {
      try {
        const response = await fetch(`/api/preorder/jobs/${processingJobId}`, {
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch processing job status');
        }
        
        const status = await response.json();
        
        if (!isMounted) return;
        
        // Update progress
        if (status.progress) {
          setProductsProcessed(status.progress.productsProcessed || 0);
        }
        
        if (status.status === 'completed') {
          setProcessingJobId(null);
          console.log('✅ Processing job completed via polling');
        } else if (status.status === 'failed') {
          setProcessingJobId(null);
          console.error('❌ Processing job failed:', status.error);
        } else {
          setTimeout(pollProcessingJobStatus, pollInterval);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Processing job polling error:', error);
          setTimeout(pollProcessingJobStatus, pollInterval);
        }
      }
    };
    
    pollProcessingJobStatus();
    
    return () => {
      isMounted = false;
    };
  }, [processingJobId, step]);

  // No auto-mapping - user must manually select gender mappings
  // The "Auto-Map" button provides optional auto-suggestions via initializeGenderNormalization()

  // Data queries
  const { data: brands = [] } = useQuery<any[]>({
    queryKey: ['/api/brands'],
  });

  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ['/api/categories'],
  });

  const { data: sizeCharts = [] } = useQuery<any[]>({
    queryKey: ['/api/size-charts'],
  });

  // Create size chart mutation
  const createSizeChartMutation = useMutation({
    mutationFn: async (data: { name: string; sizes: string[]; unitsPerSize?: Record<string, number> }) => {
      const response = await apiRequest('/api/size-charts', 'POST', {
        name: data.name,
        sizes: data.sizes,
        unitsPerSize: data.unitsPerSize || {},
        isActive: true
      });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/size-charts'] });
      setSelectedSizeChartId(data.id);
      setIsCreatingSizeChart(false);
      setNewSizeChartName('');
      setNewSizeChartSizes('');
      setNewSizeChartUnitsPerSize({});
      setSizeChartUploadMode('manual');
      toast({
        title: "Size chart created",
        description: `${data.name} has been added`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create size chart",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    }
  });

  // Handle Excel file upload for size chart
  const handleSizeChartExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelSizesLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/size-charts/parse-excel', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to parse Excel file');
      }

      const data = await response.json();
      if (data.sizes && data.sizes.length > 0) {
        setNewSizeChartSizes(data.sizes.join(', '));
        if (data.suggestedName) {
          setNewSizeChartName(data.suggestedName);
        }
        toast({
          title: "Sizes extracted",
          description: `Found ${data.sizes.length} sizes from the Excel file`,
        });
      } else {
        toast({
          title: "No sizes found",
          description: "Could not find sizes in the Excel file. Please check the file format.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Failed to parse Excel",
        description: error.message || "An error occurred while parsing the file",
        variant: "destructive",
      });
    } finally {
      setExcelSizesLoading(false);
      if (sizeChartFileInputRef.current) {
        sizeChartFileInputRef.current.value = '';
      }
    }
  };

  useEffect(() => {
    if (categories.length > 0 && defaultValues.category === 'General') {
      const firstActiveCategory = categories.find((c: any) => c.isActive);
      if (firstActiveCategory) {
        setDefaultValues(prev => ({ ...prev, category: firstActiveCategory.name }));
      }
    }
  }, [categories]);

  // Create brand mutation
  const createBrandMutation = useMutation({
    mutationFn: async (brandName: string) => {
      const response = await apiRequest('/api/brands', 'POST', {
        name: brandName,
        slug: brandName.toLowerCase().replace(/\s+/g, '-'),
        isActive: true,
        priority: 0
      });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/brands'] });
      setSelectedBrandId(data.id);
      setSelectedBrandName(data.name);
      setIsCreatingBrand(false);
      setNewBrandName('');
      toast({
        title: "Brand created",
        description: `${data.name} has been added`,
      });
      setStep('upload');
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create brand",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    }
  });

  // Upload file mutation - uses async background processing
  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      // Use async upload endpoint that returns job ID immediately
      const response = await fetch('/api/preorder/upload/start', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }
      
      return await response.json() as { jobId: string; message: string };
    },
    onSuccess: (data) => {
      // Store job ID in localStorage for session recovery
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        jobId: data.jobId,
        fileName: file?.name || 'uploaded-file',
        brandId: selectedBrandId,
        brandName: selectedBrandName,
        startedAt: Date.now()
      }));
      
      // Store job ID and switch to uploading step for progress tracking
      setCurrentJobId(data.jobId);
      setJobProgress({
        stage: 'queued',
        percent: 0,
        message: 'Starting upload...',
        startedAt: Date.now()
      });
      setStep('uploading');
      
      toast({
        title: "Upload started",
        description: "Processing file in background...",
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

  // Set header row mutation
  const setHeaderMutation = useMutation({
    mutationFn: async ({ tempDataId, headerRowIndex }: { tempDataId: string, headerRowIndex: number }) => {
      const response = await apiRequest('/api/preorder/upload/set-header', 'POST', {
        tempDataId,
        headerRowIndex
      });
      return await response.json() as PreviewData;
    },
    onSuccess: (data) => {
      setPreview(data);
      
      // Auto-mapping disabled - user must manually map all columns
      // Only restore mapping if we have a saved session, otherwise use empty mapping
      if (!hasRestoredMapping) {
        // Keep default empty mapping - no auto-detection
      }
      setHasRestoredMapping(false); // Reset flag after use
      setStep('mapping');
      
      // Count mapped fields
      const mappedCount = Object.values(mapping).filter(v => v !== '').length;
      
      toast({
        title: hasRestoredMapping ? "Session restored" : "Header row set",
        description: `${data.totalRows} data rows ready. ${mappedCount} columns mapped.`,
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

  // Analyze UPC status mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview data");
      
      const response = await apiRequest('/api/preorder/analyze', 'POST', {
        tempDataId: preview.tempDataId,
        mapping,
        brandId: selectedBrandId
      });
      
      return await response.json() as AnalyzedData;
    },
    onSuccess: (data) => {
      setAnalyzedData(data);
      setEditableRows(data.analyzedRows);
      
      // Store detected genders for gender-based size mapping
      if (data.detectedGenders && data.detectedGenders.length > 0) {
        setDetectedGenders(data.detectedGenders);
        console.log('[PreOrderUpload] Detected genders:', data.detectedGenders);
        // If gender column is mapped, go to gender-mapping, otherwise size-chart
        setStep('gender-mapping');
      } else {
        setStep('size-chart');
      }
      
      if (data.isLargeFile && data.serverSideData) {
        toast({
          title: "Large file processed",
          description: `${data.totalRows.toLocaleString()} rows (${data.newProducts} new, ${data.existingProducts} existing).`,
        });
      } else {
        toast({
          title: "UPC analysis complete",
          description: `${data.newProducts} new products, ${data.existingProducts} existing`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze UPCs",
        variant: "destructive",
      });
    }
  });

  // Process pre-order mutation
  const processPreOrderMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview data");
      
      setProcessingStartTime(Date.now());
      setProductsProcessed(0);
      setStep('processing');
      
      // Use actual file row count, not preview rows
      const totalProducts = rawPreview?.totalRows || editableRows.length;
      
      console.log("🔍 Frontend sending process request:", {
        collectionName,
        collectionImage,
        brandId: selectedBrandId,
        hasMapping: !!mapping,
        hasTempDataId: !!preview.tempDataId,
        totalRows: totalProducts
      });
      
      // Create a processing job first for progress tracking
      const jobResponse = await apiRequest('/api/preorder/process-job', 'POST', {
        collectionName,
        totalProducts
      });
      const jobData = await jobResponse.json();
      const jobId = jobData.jobId;
      setProcessingJobId(jobId);
      console.log("📋 Processing job created:", jobId);
      
      // Build size chart mapping data based on mode
      let effectiveSizeChartMappingData = undefined;
      if (sizeChartMappingType === 'product-specific') {
        effectiveSizeChartMappingData = sizeChartMappingData;
      } else if (sizeChartMappingType === 'gender-based') {
        // Convert genderSizeAssignments to the format backend expects
        // Include unitsPerSize for each gender if carton products are being processed
        effectiveSizeChartMappingData = {
          type: 'gender-based',
          mappings: Object.entries(genderSizeAssignments).map(([gender, assignment]) => ({
            key: gender, // The detected gender from product sheet
            sizes: assignment.sizes, // The sizes from the mapped size chart row
            unitsPerSize: genderUnitsPerSize[gender] || {} // Units per size for carton products
          }))
        };
      }
      
      const response = await apiRequest('/api/preorder/process', 'POST', {
        tempDataId: preview.tempDataId,
        mapping,
        editedRows: editableRows,
        collectionName,
        collectionImage: collectionImage || 'https://via.placeholder.com/400x400?text=Collection',
        brandId: selectedBrandId,
        namingPattern,
        defaultCategory: defaultValues.category,
        defaultGender: defaultValues.gender,
        imageSource, // 'embedded' | 'column' | 'zip' | 'none'
        embeddedImageColumn: rawPreview?.imageColumnInfo?.columnName || 'Images', // Column name where embedded images are stored
        sizeChartId: sizeChartMappingType === 'uniform' ? selectedSizeChartId : undefined, // Size chart for uniform mode
        sizeChartMappingType, // 'uniform' | 'product-specific' | 'gender-based'
        sizeChartMappingData: effectiveSizeChartMappingData, // Mapping data for non-uniform modes
        genderNormalizationMap: Object.keys(genderNormalizationMap).length > 0 ? genderNormalizationMap : undefined, // Raw gender -> standardized gender mapping
        categoryMappings: Object.keys(categoryMappings).length > 0 ? categoryMappings : undefined, // FIXED: Send categoryMappings with ageGroup info
        jobId, // Include jobId for progress tracking
        collectionType: 'preorder', // Explicitly set collection type
      });
      
      return await response.json() as ProcessingResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      
      // Clear recovery storage - flow is complete
      localStorage.removeItem(STORAGE_KEY);
      
      setProcessingResult(data);
      setStep('complete');
      
      toast({
        title: "Collection created!",
        description: `Created ${data.productsCreated} products in "${data.collectionName}"`,
      });
    },
    onError: (error: any) => {
      setProcessingStartTime(null);
      toast({
        title: "Processing failed",
        description: error.message || "Failed to process collection",
        variant: "destructive",
      });
      setStep('collection-info');
    }
  });

  // Handlers
  const handleBrandSelect = (brandId: string) => {
    const brand = brands.find((b: any) => b.id === brandId);
    if (brand) {
      setSelectedBrandId(brand.id);
      setSelectedBrandName(brand.name);
    }
  };

  const handleCreateBrand = () => {
    if (!newBrandName.trim()) {
      toast({
        title: "Brand name required",
        description: "Please enter a brand name",
        variant: "destructive",
      });
      return;
    }
    createBrandMutation.mutate(newBrandName.trim());
  };

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    previewMutation.mutate(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleProceedToAutoNaming = () => {
    if (!mapping.sku) {
      toast({
        title: "Missing required field",
        description: "UPC field is required",
        variant: "destructive",
      });
      return;
    }
    setStep('auto-naming');
  };

  const handleAnalyzeUPCs = () => {
    analyzeMutation.mutate();
  };

  const addNamingToken = (token: NamingToken) => {
    setNamingPattern(prev => [...prev, token]);
  };

  const removeNamingToken = (index: number) => {
    setNamingPattern(prev => prev.filter((_, i) => i !== index));
  };

  const applyPreset = (preset: string) => {
    switch (preset) {
      case 'brand-upc':
        setNamingPattern([
          { type: 'field', value: 'Brand' },
          { type: 'text', value: '-' },
          { type: 'field', value: 'UPC' }
        ]);
        break;
      case 'brand-category-upc':
        setNamingPattern([
          { type: 'field', value: 'Brand' },
          { type: 'text', value: '-' },
          { type: 'field', value: 'Category' },
          { type: 'text', value: '-' },
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

  const handleCellEdit = (rowIndex: number, field: string, value: string) => {
    setEditableRows(prev => {
      const updated = [...prev];
      updated[rowIndex] = {
        ...updated[rowIndex],
        [`_${field}`]: value
      };
      return updated;
    });
  };

  const handleFillDown = (field: string, startIndex: number) => {
    if (startIndex >= editableRows.length) return;
    
    const value = editableRows[startIndex][`_${field}`] || editableRows[startIndex][mapping[field as keyof ColumnMapping]];
    
    setEditableRows(prev => {
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
      description: `Filled ${editableRows.length - startIndex - 1} cells`,
    });
  };

  const handleApplyToColumn = (field: string, value: string) => {
    setEditableRows(prev => prev.map(row => ({
      ...row,
      [`_${field}`]: value
    })));
    
    toast({
      title: "Applied to column",
      description: `Set ${editableRows.length} cells to "${value}"`,
    });
  };

  const handleClearColumn = (field: string) => {
    setEditableRows(prev => prev.map(row => {
      const updated = { ...row };
      delete updated[`_${field}`];
      return updated;
    }));
    
    toast({
      title: "Column cleared",
      description: `Cleared ${editableRows.length} cells`,
    });
  };

  const renderStepIndicator = () => {
    const steps: { key: Step; label: string }[] = [
      { key: 'brand', label: 'Brand' },
      { key: 'upload', label: 'Upload' },
      { key: 'mapping', label: 'Mapping' },
      { key: 'auto-naming', label: 'Auto-naming' },
      { key: 'size-chart', label: 'Size Chart' },
      { key: 'collection-info', label: 'Collection' },
      { key: 'complete', label: 'Complete' }
    ];

    // Treat 'uploading' as part of 'upload' step for indicator, 'processing' as part of 'collection-info', 'preview-final' as part of 'size-chart', 'gender-mapping' as part of 'auto-naming'
    const effectiveStep = step === 'uploading' ? 'upload' : step === 'processing' ? 'collection-info' : step === 'preview-final' ? 'size-chart' : step === 'gender-mapping' ? 'auto-naming' : step;
    const currentIndex = steps.findIndex(s => s.key === effectiveStep);

    return (
      <div className="flex items-center justify-center gap-2 mb-8">
        {steps.map((s, index) => (
          <div key={s.key} className="flex items-center">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-medium ${
              index < currentIndex ? 'bg-green-500 text-white' :
              index === currentIndex ? 'bg-blue-600 text-white' :
              'bg-gray-200 text-gray-500'
            }`}>
              {index < currentIndex ? <CheckCircle2 className="w-5 h-5" /> : index + 1}
            </div>
            {index < steps.length - 1 && (
              <div className={`w-12 h-0.5 ${index < currentIndex ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>
    );
  };

  // Render steps
  const renderBrandStep = () => (
    <Card className="p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Heart className="w-8 h-8 text-pink-600" />
          <h2 className="text-2xl font-bold">Select Brand</h2>
        </div>

        <p className="text-muted-foreground mb-6">
          Choose the brand for your pre-order collection, or create a new one.
        </p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="brand-select">Brand</Label>
            <Select value={selectedBrandId} onValueChange={handleBrandSelect}>
              <SelectTrigger id="brand-select" data-testid="select-brand">
                <SelectValue placeholder="Select a brand" />
              </SelectTrigger>
              <SelectContent>
                {brands.filter((b: any) => b.isActive).map((brand: any) => (
                  <SelectItem key={brand.id} value={brand.id} data-testid={`option-brand-${brand.id}`}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1 border-t" />
            <span className="text-sm text-muted-foreground">OR</span>
            <div className="flex-1 border-t" />
          </div>

          <Dialog open={isCreatingBrand} onOpenChange={setIsCreatingBrand}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full" data-testid="button-create-brand">
                <Plus className="w-4 h-4 mr-2" />
                Create New Brand
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Brand</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="new-brand-name">Brand Name</Label>
                  <Input
                    id="new-brand-name"
                    data-testid="input-brand-name"
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    placeholder="Enter brand name"
                  />
                </div>
                <Button 
                  onClick={handleCreateBrand} 
                  className="w-full"
                  data-testid="button-confirm-create-brand"
                  disabled={createBrandMutation.isPending}
                >
                  {createBrandMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Create Brand
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {selectedBrandId && (
            <Button 
              onClick={() => setStep('upload')} 
              className="w-full"
              data-testid="button-proceed-upload"
            >
              Continue with {selectedBrandName}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );

  const renderUploadStep = () => (
    <Card className="p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Upload className="w-8 h-8 text-blue-600" />
            <h2 className="text-2xl font-bold">Upload File</h2>
          </div>
          <Badge variant="outline">{selectedBrandName}</Badge>
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            isDragging ? 'border-blue-600 bg-blue-50' : 'border-gray-300'
          }`}
        >
          <FileSpreadsheet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Drop your file here</h3>
          <p className="text-muted-foreground mb-4">or click to browse</p>
          <Input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => {
              const selectedFile = e.target.files?.[0];
              if (selectedFile) handleFileSelect(selectedFile);
            }}
            className="hidden"
            id="file-upload"
            data-testid="input-file"
          />
          <label htmlFor="file-upload">
            <Button variant="outline" asChild data-testid="button-browse-file">
              <span>Browse Files</span>
            </Button>
          </label>
        </div>

        {previewMutation.isPending && (
          <div className="flex items-center justify-center gap-2 mt-4 text-blue-600">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Uploading file...</span>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <Button variant="outline" onClick={() => setStep('brand')} data-testid="button-back-brand">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
      </div>
    </Card>
  );

  const formatElapsed = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
  };

  const formatCellValue = (cell: any): string => {
    if (cell === null || cell === undefined) return '';
    if (cell instanceof Date) {
      return cell.toISOString().split('T')[0];
    }
    if (typeof cell === 'object') {
      if (cell.text !== undefined) return String(cell.text);
      if (cell.hyperlink !== undefined) return String(cell.hyperlink);
      if (cell.result !== undefined) return String(cell.result);
      if (cell.richText !== undefined) {
        return cell.richText.map((r: any) => r.text || '').join('');
      }
      if (cell.getTime && typeof cell.getTime === 'function') {
        return new Date(cell).toISOString().split('T')[0];
      }
      try {
        const str = JSON.stringify(cell);
        if (str.startsWith('"') && str.endsWith('"')) {
          return str.slice(1, -1);
        }
        return str;
      } catch {
        return String(cell);
      }
    }
    return String(cell);
  };

  const getStageLabel = (stage: string): string => {
    const labels: Record<string, string> = {
      'queued': 'Waiting to start...',
      'uploading': 'Uploading file...',
      'extracting': 'Reading Excel data...',
      'processing-images': 'Processing images...',
      'building-preview': 'Building preview...',
      'completed': 'Complete!',
      'failed': 'Failed'
    };
    return labels[stage] || stage;
  };

  const renderUploadingStep = () => (
    <Card className="p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
            <h2 className="text-2xl font-bold">Processing File</h2>
          </div>
          <Badge variant="outline">{file?.name || recoveredFileName || 'Processing...'}</Badge>
        </div>

        <div className="space-y-6">
          {/* Job Monitor Card */}
          <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-blue-900">Job Monitor</h3>
                <Badge variant="secondary" data-testid="job-monitor-badge">
                  Job ID: {currentJobId?.slice(0, 8)}...
                </Badge>
              </div>
              
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Progress</span>
                    <span className="text-sm font-bold text-blue-600" data-testid="job-monitor-percent">
                      {(jobProgress?.percent || 0) >= 100 ? 99 : (jobProgress?.percent || 0)}%
                    </span>
                  </div>
                  <Progress value={(jobProgress?.percent || 0) >= 100 ? 99 : (jobProgress?.percent || 0)} className="h-3" />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-white rounded p-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
                    <p className="text-sm font-semibold text-gray-800 data-testid='job-monitor-stage'" data-testid="job-monitor-stage">
                      {getStageLabel(jobProgress?.stage || 'queued')}
                    </p>
                  </div>
                  <div className="bg-white rounded p-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Elapsed</p>
                    <p className="text-sm font-semibold text-blue-600" data-testid="job-monitor-elapsed">
                      {formatElapsed(uploadElapsed)}
                    </p>
                  </div>
                </div>

                {((jobProgress?.percent ?? 0) >= 100 ? 'Finalizing...' : jobProgress?.message) && (
                  <div className="bg-white rounded p-3 border-l-2 border-blue-500">
                    <p className="text-sm text-gray-700" data-testid="job-monitor-message">
                      {(jobProgress?.percent ?? 0) >= 100 ? 'Finalizing...' : jobProgress?.message}
                    </p>
                  </div>
                )}

                {jobProgress?.stage === 'processing-images' && jobProgress.totalImages && (
                  <div className="bg-white rounded p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Image className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-gray-700">Image Processing</span>
                    </div>
                    <p className="text-sm text-gray-600" data-testid="job-monitor-images">
                      {jobProgress.imagesProcessed || 0} of {jobProgress.totalImages} images
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-white rounded p-3 border-l-2 border-amber-400">
                <p className="text-xs font-medium text-amber-900">💡 Test Tip</p>
                <p className="text-xs text-amber-800 mt-1">
                  Try refreshing this page to test session recovery. Your job will reconnect automatically!
                </p>
              </div>
            </div>
          </Card>

          <Alert>
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>
              Your file is being processed in the background. This may take several minutes for large files with many images.
              You can leave this page open - progress will continue automatically.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                setCurrentJobId(null);
                setRecoveredFileName(null);
                setJobProgress(null);
                setStep('upload');
              }} 
              data-testid="button-cancel-upload"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );

  const renderMappingStep = () => {
    const mappingOptions = [
      { value: 'none', label: '- Not Mapped -' },
      { value: 'sku', label: 'UPC/SKU *' },
      { value: 'barcode', label: 'Barcode' },
      { value: 'name', label: 'Product Name' },
      { value: 'brand', label: 'Brand' },
      { value: 'category', label: 'Category' },
      { value: 'gender', label: 'Gender' },
      { value: 'color', label: 'Color' },
      { value: 'size', label: 'Size' },
      { value: 'imageUrl', label: 'Image URL' },
      { value: 'description', label: 'Description' },
      { value: 'division', label: 'Division' },
      { value: 'countryOfOrigin', label: 'Country of Origin' },
      { value: 'wholesalePrice', label: 'Wholesale Price' },
      { value: 'retailPrice', label: 'Retail Price' },
      { value: 'minOrder', label: 'Min Order' },
      { value: 'keyCategory', label: 'Key Category' },
      { value: 'colourway', label: 'Colourway' },
      { value: 'ageGroup', label: 'Age Group' },
      { value: 'corporateMarketingLine', label: 'Corporate Marketing Line' },
      { value: 'productLine', label: 'Product Line' },
      { value: 'productType', label: 'Product Type' },
      { value: 'sportsCategory', label: 'Sports Category' },
      { value: 'moq', label: 'MOQ' },
      { value: 'conditions', label: 'Conditions' },
      { value: 'materialComposition', label: 'Material Composition' },
      { value: 'discount', label: 'Discount' },
      { value: 'unitsPerCarton', label: 'Units per Carton' },
    ];

    const handleMappingChange = (field: string, column: string) => {
      let newMapping: ColumnMapping;
      if (field === 'none') {
        const currentField = Object.entries(mapping).find(([_, col]) => col === column)?.[0];
        if (currentField) {
          newMapping = { ...mapping, [currentField]: '' };
          // If clearing imageUrl, don't change imageSource - let user control that via Image Source Selector
        } else {
          return;
        }
      } else {
        // Clear any existing mapping for this field first (to prevent duplicates)
        newMapping = { ...mapping, [field]: column };
        
        // If user selects Image URL in the main dropdown, automatically switch to 'column' image source
        if (field === 'imageUrl') {
          setImageSource('column');
        }
      }
      setMapping(newMapping);
      
      // Persist mapping to localStorage for recovery
      const savedJob = localStorage.getItem(STORAGE_KEY);
      if (savedJob) {
        try {
          const savedData = JSON.parse(savedJob);
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...savedData,
            mapping: newMapping
          }));
        } catch (e) {}
      }
    };

    const getFieldForColumn = (column: string): string => {
      const entry = Object.entries(mapping).find(([_, col]) => col === column);
      return entry ? entry[0] : 'none';
    };

    const mappedCount = Object.values(mapping).filter(v => v !== '').length;

    return (
      <Card className="p-8">
        <div className="max-w-full mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-blue-600" />
              <div>
                <h2 className="text-2xl font-bold">Column Mapping</h2>
                <p className="text-sm text-muted-foreground">Map Excel columns to database fields</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={mapping.sku ? 'default' : 'destructive'}>
                {mapping.sku ? 'Ready' : 'UPC Required'}
              </Badge>
              <Badge variant="outline">{preview?.totalRows} rows</Badge>
            </div>
          </div>

          {preview && (
            <div className="border rounded-lg overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px] text-center bg-gray-100 sticky left-0 z-10">#</TableHead>
                      {preview.columns.map((col, index) => {
                        const currentField = getFieldForColumn(col);
                        return (
                          <TableHead key={col} className="w-[150px] p-2">
                            <Select 
                              value={currentField} 
                              onValueChange={(v) => handleMappingChange(v, col)}
                            >
                              <SelectTrigger 
                                className={`h-8 text-xs ${currentField !== 'none' ? 'border-green-500 bg-green-50' : ''}`}
                                data-testid={`select-mapping-${index}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {mappingOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
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
                        {preview.columns.map((col, colIndex) => {
                          const cellValue = formatCellValue(row[col]);
                          return (
                            <TableCell key={colIndex} className="w-[150px] text-sm truncate" title={cellValue}>
                              {cellValue || <span className="text-gray-300 italic">empty</span>}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg mb-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-blue-600" />
              <div>
                <p className="font-semibold">
                  {mappedCount} of {preview?.columns.length || 0} columns mapped
                </p>
                <p className="text-sm text-muted-foreground">
                  {mapping.sku ? `UPC Column: "${mapping.sku}"` : 'UPC column not mapped yet'}
                </p>
              </div>
            </div>
          </div>

          {/* Image Source Selector */}
          <div className="space-y-4 p-4 border rounded-lg mb-6 bg-gray-50">
            <div className="flex items-center gap-2">
              <Image className="w-5 h-5 text-purple-600" />
              <h3 className="text-lg font-semibold">Product Image Source</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Choose where product images should come from for this upload.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Embedded Images Option */}
              <div
                onClick={() => {
                  setImageSource('embedded');
                  setMapping(prev => ({ ...prev, imageUrl: '' }));
                }}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  imageSource === 'embedded' 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-gray-200 hover:border-purple-200'
                }`}
                data-testid="option-image-embedded"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    imageSource === 'embedded' ? 'border-purple-500' : 'border-gray-300'
                  }`}>
                    {imageSource === 'embedded' && <div className="w-2 h-2 rounded-full bg-purple-500" />}
                  </div>
                  <span className="font-medium">Embedded Images</span>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  Use images embedded directly in the Excel file
                </p>
                {rawPreview?.imageColumnInfo && (
                  <Badge variant="outline" className="mt-2 ml-6 text-green-600 border-green-300">
                    {rawPreview.imageColumnInfo.imageCount} images detected
                  </Badge>
                )}
                {!rawPreview?.imageColumnInfo && (
                  <Badge variant="outline" className="mt-2 ml-6 text-gray-400">
                    No embedded images
                  </Badge>
                )}
                {imageSource === 'embedded' && rawPreview?.imageColumnInfo && rawPreview.imageColumnInfo.imageCount > 0 && (
                  <div className="mt-3 ml-6">
                    {imageUploadComplete ? (
                      <Badge className="bg-green-500 text-white">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {uploadedImagesCount} images uploaded
                      </Badge>
                    ) : imageUploadProgress ? (
                      <div className="space-y-2">
                        <Progress value={imageUploadProgress.percent} className="h-2" />
                        <p className="text-xs text-muted-foreground">{imageUploadProgress.message}</p>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const response = await fetch('/api/preorder/extract-images', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              credentials: 'include',
                              body: JSON.stringify({
                                tempDataId: rawPreview?.tempDataId,
                                headerRowIndex: selectedHeaderRow
                              })
                            });
                            const { jobId } = await response.json();
                            setImageUploadJobId(jobId);
                            setImageUploadProgress({ stage: 'starting', percent: 0, message: 'Starting...' });
                          } catch (error) {
                            toast({ title: 'Error', description: 'Failed to start image extraction', variant: 'destructive' });
                          }
                        }}
                        data-testid="button-upload-embedded"
                      >
                        <Upload className="w-3 h-3 mr-1" />
                        Upload to Cloudinary
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Image URL Column Option */}
              <div
                onClick={() => setImageSource('column')}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  imageSource === 'column' 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-gray-200 hover:border-purple-200'
                }`}
                data-testid="option-image-column"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    imageSource === 'column' ? 'border-purple-500' : 'border-gray-300'
                  }`}>
                    {imageSource === 'column' && <div className="w-2 h-2 rounded-full bg-purple-500" />}
                  </div>
                  <span className="font-medium">Image URL Column</span>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  Use URLs from a column in your data (no upload needed)
                </p>
                {imageSource === 'column' && preview && (
                  <div className="mt-2 ml-6">
                    <Select 
                      value={mapping.imageUrl || ''} 
                      onValueChange={(v) => setMapping(prev => ({ ...prev, imageUrl: v }))}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid="select-image-column">
                        <SelectValue placeholder="Select column..." />
                      </SelectTrigger>
                      <SelectContent>
                        {preview.columns.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Separate Image Files (ZIP) Option */}
              <div
                onClick={() => {
                  setImageSource('zip');
                  setMapping(prev => ({ ...prev, imageUrl: '' }));
                }}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  imageSource === 'zip' 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-gray-200 hover:border-purple-200'
                }`}
                data-testid="option-image-zip"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    imageSource === 'zip' ? 'border-purple-500' : 'border-gray-300'
                  }`}>
                    {imageSource === 'zip' && <div className="w-2 h-2 rounded-full bg-purple-500" />}
                  </div>
                  <span className="font-medium">Separate Image Files (ZIP)</span>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  Upload a ZIP file containing product images
                </p>
                {imageSource === 'zip' && (
                  <div className="mt-3 ml-6">
                    {imageUploadComplete ? (
                      <Badge className="bg-green-500 text-white">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {uploadedImagesCount} images uploaded
                      </Badge>
                    ) : imageUploadProgress ? (
                      <div className="space-y-2">
                        <Progress value={imageUploadProgress.percent} className="h-2" />
                        <p className="text-xs text-muted-foreground">{imageUploadProgress.message}</p>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="file"
                          accept=".zip"
                          id="zip-upload"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            
                            const formData = new FormData();
                            formData.append('file', file);
                            formData.append('tempDataId', rawPreview?.tempDataId || '');
                            
                            try {
                              const response = await fetch('/api/preorder/upload-images-zip', {
                                method: 'POST',
                                credentials: 'include',
                                body: formData
                              });
                              const { jobId } = await response.json();
                              setImageUploadJobId(jobId);
                              setImageUploadProgress({ stage: 'starting', percent: 0, message: 'Extracting ZIP...' });
                            } catch (error) {
                              toast({ title: 'Error', description: 'Failed to upload ZIP file', variant: 'destructive' });
                            }
                          }}
                          data-testid="input-zip-upload"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            document.getElementById('zip-upload')?.click();
                          }}
                          data-testid="button-upload-zip"
                        >
                          <Upload className="w-3 h-3 mr-1" />
                          Select ZIP File
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* No Images Option */}
              <div
                onClick={() => {
                  setImageSource('none');
                  setMapping(prev => ({ ...prev, imageUrl: '' }));
                }}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  imageSource === 'none' 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-gray-200 hover:border-purple-200'
                }`}
                data-testid="option-image-none"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    imageSource === 'none' ? 'border-purple-500' : 'border-gray-300'
                  }`}>
                    {imageSource === 'none' && <div className="w-2 h-2 rounded-full bg-purple-500" />}
                  </div>
                  <span className="font-medium">No Images</span>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  Skip image processing for this upload
                </p>
              </div>
            </div>

            {imageSource === 'column' && !mapping.imageUrl && (
              <p className="text-sm text-amber-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                Please select which column contains the image URLs
              </p>
            )}
          </div>

          <div className="space-y-4 pt-6 border-t mb-6">
            <h3 className="text-lg font-semibold">Collection Details</h3>
            
            <div>
              <Label htmlFor="collection-name-mapping">Collection Name *</Label>
              <Input
                id="collection-name-mapping"
                data-testid="input-collection-name"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                placeholder="Enter collection name (e.g., Spring 2024)"
              />
            </div>

            <div>
              <Label htmlFor="collection-image-mapping">Collection Image URL (Optional)</Label>
              <Input
                id="collection-image-mapping"
                data-testid="input-collection-image"
                value={collectionImage}
                onChange={(e) => setCollectionImage(e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
              {collectionImage && (
                <p className="text-xs text-muted-foreground mt-1">
                  Preview: <a href={collectionImage} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{collectionImage}</a>
                </p>
              )}
            </div>
          </div>

          {/* Warning if image upload is required but not complete */}
          {(imageSource === 'embedded' && rawPreview?.imageColumnInfo && rawPreview.imageColumnInfo.imageCount > 0 && !imageUploadComplete) && (
            <Alert className="mb-4 border-amber-300 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700">
                Please upload embedded images to Cloudinary before continuing.
              </AlertDescription>
            </Alert>
          )}
          {(imageSource === 'zip' && !imageUploadComplete) && (
            <Alert className="mb-4 border-amber-300 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700">
                Please upload a ZIP file with product images before continuing.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('upload')} data-testid="button-back-upload">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button 
              onClick={handleProceedToAutoNaming} 
              disabled={
                !mapping.sku || 
                !collectionName || 
                (imageSource === 'column' && !mapping.imageUrl) ||
                (imageSource === 'embedded' && rawPreview?.imageColumnInfo && rawPreview.imageColumnInfo.imageCount > 0 && !imageUploadComplete) ||
                (imageSource === 'zip' && !imageUploadComplete)
              }
              data-testid="button-proceed-autonaming"
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  const renderAutoNamingStep = () => (
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
              {['Brand', 'UPC', 'Category', 'Name', 'Color', 'Size', 'Gender'].map((field) => (
                <Button
                  key={field}
                  variant="outline"
                  size="sm"
                  onClick={() => addNamingToken({ type: 'field', value: field })}
                  data-testid={`button-add-token-${field.toLowerCase()}`}
                >
                  + {field}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const text = prompt('Enter custom text:');
                  if (text) addNamingToken({ type: 'text', value: text });
                }}
                data-testid="button-add-token-custom"
              >
                + Custom Text
              </Button>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900 mb-1">Preview</h4>
                <p className="text-sm text-blue-700">
                  Example: {namingPattern.map(t => t.type === 'field' ? `[${t.value}]` : t.value).join('')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <Button variant="outline" onClick={() => setStep('mapping')} data-testid="button-back-mapping">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Button 
            onClick={handleAnalyzeUPCs} 
            disabled={
              analyzeMutation.isPending ||
              (imageSource === 'embedded' && rawPreview?.imageColumnInfo && rawPreview.imageColumnInfo.imageCount > 0 && !imageUploadComplete) ||
              (imageSource === 'zip' && !imageUploadComplete)
            } 
            data-testid="button-analyze-upcs"
          >
            {analyzeMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
            Analyze & Preview
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </Card>
  );

  const handleSizeChartMappingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setSizeChartMappingLoading(true);
    setSizeChartMappingFile(file);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mappingType', sizeChartMappingType);
      
      const response = await fetch('/api/size-charts/parse-mapping', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Failed to parse mapping file');
      }
      
      const data = await response.json();
      setSizeChartMappingData({
        type: sizeChartMappingType as 'product-specific' | 'gender-based',
        mappings: data.mappings,
        keyColumn: data.keyColumn,
        parsedRows: data.parsedRows,
        sizeHeaders: data.sizeHeaders
      });
      
      // For gender-based mode, initialize gender assignments from parsed rows
      if (sizeChartMappingType === 'gender-based' && data.parsedRows && detectedGenders.length > 0) {
        const initialAssignments: Record<string, { key: string; sizes: string[] }> = {};
        // Try to auto-match detected genders to parsed rows (case-insensitive)
        for (const gender of detectedGenders) {
          const genderLower = gender.toLowerCase().trim();
          const matchingRow = data.parsedRows.find((row: any) => {
            const rowKeyLower = row.key.toLowerCase().trim();
            return rowKeyLower === genderLower ||
              rowKeyLower.includes(genderLower) ||
              genderLower.includes(rowKeyLower) ||
              // Common variations
              (genderLower.includes('men') && rowKeyLower.includes('men')) ||
              (genderLower.includes('women') && rowKeyLower.includes('women')) ||
              (genderLower.includes('unisex') && rowKeyLower.includes('unisex')) ||
              (genderLower === 'male' && rowKeyLower.includes('men')) ||
              (genderLower === 'female' && rowKeyLower.includes('women'));
          });
          if (matchingRow) {
            initialAssignments[gender] = { key: matchingRow.key, sizes: matchingRow.sizes };
          }
        }
        setGenderSizeAssignments(initialAssignments);
        console.log('[PreOrderUpload] Auto-matched genders:', initialAssignments);
      }
      
      toast({
        title: "Mapping file parsed",
        description: `Found ${data.mappings.length} size mappings`
      });
    } catch (error) {
      toast({
        title: "Error parsing file",
        description: "Could not parse size chart mapping file",
        variant: "destructive"
      });
      setSizeChartMappingData(null);
    } finally {
      setSizeChartMappingLoading(false);
      if (sizeChartMappingFileRef.current) {
        sizeChartMappingFileRef.current.value = '';
      }
    }
  };
  
  // Auto-suggest standardized gender based on raw value
  const suggestStandardizedGender = (rawGender: string): StandardizedGender | undefined => {
    const lower = rawGender.toLowerCase().trim();
    
    // Direct matches
    if (lower === 'men' || lower === 'male' || lower === 'mens' || lower === "men's") return 'Men';
    if (lower === 'women' || lower === 'female' || lower === 'womens' || lower === "women's" || lower === 'ladies') return 'Women';
    if (lower === 'boy' || lower === 'boys') return 'Boy';
    if (lower === 'girl' || lower === 'girls') return 'Girl';
    if (lower === 'unisex' || lower === 'adult unisex') return 'Adult Unisex';
    if (lower === 'kids' || lower === 'kids unisex' || lower === 'children' || lower === 'child') return 'Kids Unisex';
    
    // Partial matches
    if (lower.includes('men') && !lower.includes('women')) return 'Men';
    if (lower.includes('women') || lower.includes('female') || lower.includes('ladies')) return 'Women';
    if (lower.includes('boy')) return 'Boy';
    if (lower.includes('girl')) return 'Girl';
    if (lower.includes('kid') || lower.includes('child')) return 'Kids Unisex';
    if (lower.includes('unisex')) return 'Adult Unisex';
    
    return undefined;
  };
  
  // Initialize gender normalization map with auto-suggestions when detected genders change
  const initializeGenderNormalization = useCallback(() => {
    const newMap: Record<string, StandardizedGender> = {};
    for (const gender of detectedGenders) {
      const suggestion = suggestStandardizedGender(gender);
      if (suggestion) {
        newMap[gender] = suggestion;
      }
    }
    setGenderNormalizationMap(newMap);
  }, [detectedGenders]);
  
  const renderGenderMappingStep = () => {
    // Check if ALL detected genders have a valid non-empty standardized mapping
    const allMapped = detectedGenders.length > 0 && 
      detectedGenders.every(gender => 
        genderNormalizationMap[gender] && 
        STANDARDIZED_GENDERS.includes(genderNormalizationMap[gender] as any)
      );
    
    const mappedCount = detectedGenders.filter(gender => 
      genderNormalizationMap[gender] && 
      STANDARDIZED_GENDERS.includes(genderNormalizationMap[gender] as any)
    ).length;
    
    return (
      <Card className="p-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">Gender Mapping</h2>
          <p className="text-muted-foreground mb-6">
            Map each gender value found in your file to a standardized gender type. 
            This ensures consistency across your product catalog.
          </p>
          
          <div className="space-y-4">
            <div className={`border rounded-lg p-4 mb-6 ${allMapped ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
              <p className={`text-sm ${allMapped ? 'text-green-800' : 'text-blue-800'}`}>
                {allMapped ? (
                  <span className="font-medium flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    All {detectedGenders.length} gender{detectedGenders.length !== 1 ? 's' : ''} mapped successfully!
                  </span>
                ) : (
                  <>
                    <span className="font-medium">Found {detectedGenders.length} unique gender value{detectedGenders.length !== 1 ? 's' : ''}</span> in your product sheet.
                    Mapped {mappedCount} of {detectedGenders.length}.
                  </>
                )}
              </p>
            </div>
            
            <div className="space-y-3">
              {detectedGenders.map((rawGender) => {
                const isMapped = genderNormalizationMap[rawGender] && STANDARDIZED_GENDERS.includes(genderNormalizationMap[rawGender] as any);
                return (
                <div 
                  key={rawGender}
                  className={`flex items-center gap-4 p-4 rounded-lg border-2 ${
                    isMapped 
                      ? 'bg-gray-50 border-gray-200' 
                      : 'bg-amber-50 border-amber-300'
                  }`}
                >
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">{rawGender}</span>
                    <span className="text-gray-500 text-sm ml-2">
                      (from file)
                    </span>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                  <div className="w-48">
                    <Select
                      value={genderNormalizationMap[rawGender] || ''}
                      onValueChange={(value) => {
                        setGenderNormalizationMap(prev => ({
                          ...prev,
                          [rawGender]: value as StandardizedGender
                        }));
                      }}
                    >
                      <SelectTrigger data-testid={`select-gender-${rawGender}`}>
                        <SelectValue placeholder="Select type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {STANDARDIZED_GENDERS.map((stdGender) => (
                          <SelectItem key={stdGender} value={stdGender}>
                            {stdGender}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {genderNormalizationMap[rawGender] && (
                    <Check className="w-5 h-5 text-green-500" />
                  )}
                </div>
              );
              })}
            </div>
            
            {!allMapped && (
              <p className="text-amber-600 text-sm mt-4">
                Please map all gender values before continuing.
              </p>
            )}
          </div>
          
          <div className="flex gap-2 mt-8">
            <Button 
              variant="outline" 
              onClick={() => setStep('auto-naming')}
              data-testid="button-back-autonaming"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={() => setStep('size-chart')}
              disabled={!allMapped}
              data-testid="button-proceed-sizechart"
            >
              Continue to Size Chart
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              variant="ghost"
              onClick={initializeGenderNormalization}
              data-testid="button-auto-map-genders"
            >
              Auto-Map
            </Button>
          </div>
        </div>
      </Card>
    );
  };
  
  const renderSizeChartStep = () => {
    const selectedChart = sizeCharts.find((c: any) => c.id === selectedSizeChartId);
    
    // Determine if user can proceed based on mapping type
    let canProceed = false;
    if (sizeChartMappingType === 'uniform') {
      canProceed = !!selectedSizeChartId;
    } else if (sizeChartMappingType === 'product-specific') {
      canProceed = !!sizeChartMappingData && sizeChartMappingData.mappings.length > 0;
    } else if (sizeChartMappingType === 'gender-based') {
      // For gender-based, all detected genders must be mapped
      canProceed = detectedGenders.length > 0 && 
        Object.keys(genderSizeAssignments).length === detectedGenders.length;
    }
    
    return (
      <Card className="p-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-6">Size Chart Configuration</h2>
          <p className="text-muted-foreground mb-6">
            Choose how sizes should be assigned to products in this collection.
          </p>

          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-base font-semibold">Mapping Type</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div
                  onClick={() => {
                    setSizeChartMappingType('uniform');
                    setSizeChartMappingData(null);
                  }}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    sizeChartMappingType === 'uniform' 
                      ? 'border-purple-500 bg-purple-50' 
                      : 'border-gray-200 hover:border-purple-200'
                  }`}
                  data-testid="option-mapping-uniform"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      sizeChartMappingType === 'uniform' ? 'border-purple-500' : 'border-gray-300'
                    }`}>
                      {sizeChartMappingType === 'uniform' && <div className="w-2 h-2 rounded-full bg-purple-500" />}
                    </div>
                    <span className="font-medium">Uniform</span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">
                    All products use the same size chart
                  </p>
                </div>
                
                <div
                  onClick={() => {
                    setSizeChartMappingType('product-specific');
                    setSelectedSizeChartId('');
                  }}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    sizeChartMappingType === 'product-specific' 
                      ? 'border-purple-500 bg-purple-50' 
                      : 'border-gray-200 hover:border-purple-200'
                  }`}
                  data-testid="option-mapping-product"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      sizeChartMappingType === 'product-specific' ? 'border-purple-500' : 'border-gray-300'
                    }`}>
                      {sizeChartMappingType === 'product-specific' && <div className="w-2 h-2 rounded-full bg-purple-500" />}
                    </div>
                    <span className="font-medium">Product-Specific</span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">
                    Map sizes by SKU or product name
                  </p>
                </div>
                
                <div
                  onClick={() => {
                    setSizeChartMappingType('gender-based');
                    setSelectedSizeChartId('');
                  }}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    sizeChartMappingType === 'gender-based' 
                      ? 'border-purple-500 bg-purple-50' 
                      : 'border-gray-200 hover:border-purple-200'
                  }`}
                  data-testid="option-mapping-gender"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      sizeChartMappingType === 'gender-based' ? 'border-purple-500' : 'border-gray-300'
                    }`}>
                      {sizeChartMappingType === 'gender-based' && <div className="w-2 h-2 rounded-full bg-purple-500" />}
                    </div>
                    <span className="font-medium">Gender-Based</span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">
                    Different sizes for Men/Women
                  </p>
                </div>
              </div>
            </div>

            {sizeChartMappingType === 'uniform' && (
              <div className="space-y-4 border p-4 rounded-lg bg-gray-50">
                <h3 className="font-semibold">Select Size Chart</h3>
                
                {!isCreatingSizeChart ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Size Chart</Label>
                      <Select value={selectedSizeChartId} onValueChange={setSelectedSizeChartId}>
                        <SelectTrigger data-testid="select-sizechart">
                          <SelectValue placeholder="Select a size chart..." />
                        </SelectTrigger>
                        <SelectContent>
                          {sizeCharts.map((chart: any) => (
                            <SelectItem key={chart.id} value={chart.id} data-testid={`option-sizechart-${chart.id}`}>
                              {chart.name} ({(chart.sizes || []).length} sizes)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedChart && (
                      <div className="p-4 bg-white rounded-lg border">
                        <Label className="mb-2 block">Sizes in this chart:</Label>
                        <div className="flex flex-wrap gap-2">
                          {(selectedChart.sizes || []).map((size: string, idx: number) => (
                            <Badge key={idx} variant="secondary" data-testid={`badge-size-${idx}`}>
                              {size}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button
                      variant="outline"
                      onClick={() => setIsCreatingSizeChart(true)}
                      className="w-full"
                      data-testid="button-create-sizechart"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create New Size Chart
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 border p-4 rounded-lg bg-white">
                    <h4 className="font-medium">Create New Size Chart</h4>
                    
                    <div className="flex gap-2 mb-4">
                      <Button
                        variant={sizeChartUploadMode === 'manual' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSizeChartUploadMode('manual')}
                        data-testid="button-manual-entry"
                      >
                        Manual Entry
                      </Button>
                      <Button
                        variant={sizeChartUploadMode === 'excel' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSizeChartUploadMode('excel')}
                        data-testid="button-excel-upload"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Upload from Excel
                      </Button>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="sizechart-name">Name</Label>
                      <Input
                        id="sizechart-name"
                        value={newSizeChartName}
                        onChange={(e) => setNewSizeChartName(e.target.value)}
                        placeholder="e.g., EU Shoes, US Apparel"
                        data-testid="input-sizechart-name"
                      />
                    </div>

                    {sizeChartUploadMode === 'excel' ? (
                      <div className="space-y-2">
                        <Label>Upload Excel File</Label>
                        <input
                          ref={sizeChartFileInputRef}
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={handleSizeChartExcelUpload}
                          className="hidden"
                          data-testid="input-sizechart-excel"
                        />
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => sizeChartFileInputRef.current?.click()}
                          disabled={excelSizesLoading}
                          data-testid="button-upload-sizechart-excel"
                        >
                          {excelSizesLoading ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              Parsing Excel...
                            </>
                          ) : (
                            <>
                              <FileSpreadsheet className="w-4 h-4 mr-2" />
                              Select Excel File
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Upload an Excel file with sizes in the first row or first column.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="sizechart-sizes">Sizes (comma-separated)</Label>
                        <Input
                          id="sizechart-sizes"
                          value={newSizeChartSizes}
                          onChange={(e) => setNewSizeChartSizes(e.target.value)}
                          placeholder="e.g., 36, 37, 38, 39, 40, 41, 42"
                          data-testid="input-sizechart-sizes"
                        />
                      </div>
                    )}

                    {newSizeChartSizes && (
                      <div className="p-3 bg-gray-50 rounded-lg space-y-3">
                        <Label className="mb-2 block text-sm">Preview ({newSizeChartSizes.split(',').filter(s => s.trim()).length} sizes):</Label>
                        <div className="flex flex-wrap gap-1">
                          {newSizeChartSizes.split(',').map((size, idx) => size.trim() && (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {size.trim()}
                            </Badge>
                          ))}
                        </div>
                        
                        {/* Units per size for carton-sold products */}
                        {mapping.unitsPerCarton && (
                          <div className="mt-4 pt-3 border-t">
                            <Label className="mb-2 block text-sm font-medium">Units per Size (for carton products)</Label>
                            <p className="text-xs text-muted-foreground mb-3">
                              Enter how many units of each size are in the carton. Total units will be calculated automatically.
                            </p>
                            <div className="grid grid-cols-4 gap-2">
                              {newSizeChartSizes.split(',').map((size, idx) => {
                                const sizeKey = size.trim();
                                if (!sizeKey) return null;
                                return (
                                  <div key={idx} className="flex flex-col">
                                    <Label className="text-xs text-center mb-1">{sizeKey}</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      value={newSizeChartUnitsPerSize[sizeKey] || ''}
                                      onChange={(e) => {
                                        const value = parseInt(e.target.value) || 0;
                                        setNewSizeChartUnitsPerSize(prev => ({
                                          ...prev,
                                          [sizeKey]: value
                                        }));
                                      }}
                                      placeholder="0"
                                      className="h-8 text-center text-sm"
                                      data-testid={`input-units-${sizeKey}`}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                            <div className="mt-2 text-sm text-right">
                              <span className="font-medium">Total units per carton: </span>
                              <span className="text-purple-600 font-bold">
                                {Object.values(newSizeChartUnitsPerSize).reduce((sum, val) => sum + (val || 0), 0)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsCreatingSizeChart(false);
                          setNewSizeChartName('');
                          setNewSizeChartSizes('');
                          setNewSizeChartUnitsPerSize({});
                          setSizeChartUploadMode('manual');
                        }}
                        data-testid="button-cancel-sizechart"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => {
                          const sizes = newSizeChartSizes.split(',').map(s => s.trim()).filter(s => s);
                          if (newSizeChartName && sizes.length > 0) {
                            createSizeChartMutation.mutate({ 
                              name: newSizeChartName, 
                              sizes,
                              unitsPerSize: mapping.unitsPerCarton ? newSizeChartUnitsPerSize : undefined
                            });
                          } else {
                            toast({
                              title: "Invalid size chart",
                              description: "Please provide a name and at least one size",
                              variant: "destructive"
                            });
                          }
                        }}
                        disabled={createSizeChartMutation.isPending || !newSizeChartName || !newSizeChartSizes}
                        data-testid="button-save-sizechart"
                      >
                        {createSizeChartMutation.isPending ? 'Creating...' : 'Create Size Chart'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(sizeChartMappingType === 'product-specific' || sizeChartMappingType === 'gender-based') && (
              <div className="space-y-4 border p-4 rounded-lg bg-gray-50">
                <h3 className="font-semibold">
                  {sizeChartMappingType === 'product-specific' ? 'Upload Product Size Mapping' : 'Upload Gender Size Mapping'}
                </h3>
                
                <Alert className="border-blue-200 bg-blue-50">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800 text-sm">
                    {sizeChartMappingType === 'product-specific' ? (
                      <>
                        Upload an Excel file where <strong>each column is a size</strong> (e.g., 36, 37, 38...) and <strong>each row is a product</strong> (first column = SKU or Product Name).
                        Mark available sizes with any value (e.g., "X" or quantity).
                      </>
                    ) : (
                      <>
                        Upload an Excel file where <strong>each column is a size</strong> (e.g., 36, 37, 38...) and <strong>each row is a gender category</strong> (first column = Men/Women/Unisex).
                        Mark available sizes with any value (e.g., "X" or quantity).
                      </>
                    )}
                  </AlertDescription>
                </Alert>
                
                <input
                  ref={sizeChartMappingFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleSizeChartMappingUpload}
                  className="hidden"
                  data-testid="input-mapping-file"
                />
                
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => sizeChartMappingFileRef.current?.click()}
                  disabled={sizeChartMappingLoading}
                  data-testid="button-upload-mapping"
                >
                  {sizeChartMappingLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Parsing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      {sizeChartMappingFile ? 'Change File' : 'Select Excel/CSV File'}
                    </>
                  )}
                </Button>
                
                {sizeChartMappingData && sizeChartMappingData.parsedRows && sizeChartMappingData.parsedRows.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-green-700 font-medium">
                        Size chart file loaded ({sizeChartMappingData.parsedRows.length} rows)
                      </span>
                    </div>
                    
                    {/* For gender-based mode, show detected genders and mapping UI */}
                    {sizeChartMappingType === 'gender-based' && detectedGenders.length > 0 ? (
                      <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-sm text-blue-800 font-medium mb-2">
                            Map each detected gender to a size chart row:
                          </p>
                          <p className="text-xs text-blue-600">
                            {detectedGenders.length} gender types found in your product sheet
                          </p>
                        </div>
                        
                        <div className="space-y-3">
                          {detectedGenders.map((gender) => (
                            <div key={gender} className="border rounded-lg bg-white overflow-hidden">
                              <div className="flex items-center gap-3 p-3">
                                <div className="w-32 font-medium text-sm">{gender}</div>
                                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                <Select
                                  value={genderSizeAssignments[gender]?.key || ''}
                                  onValueChange={(value) => {
                                    const selectedRow = sizeChartMappingData.parsedRows?.find(r => r.key === value);
                                    if (selectedRow) {
                                      setGenderSizeAssignments(prev => ({
                                        ...prev,
                                        [gender]: { key: selectedRow.key, sizes: selectedRow.sizes }
                                      }));
                                      // Initialize units per size for this gender
                                      if (mapping.unitsPerCarton) {
                                        const initialUnits: Record<string, number> = {};
                                        selectedRow.sizes.forEach(size => {
                                          initialUnits[size] = 0;
                                        });
                                        setGenderUnitsPerSize(prev => ({
                                          ...prev,
                                          [gender]: initialUnits
                                        }));
                                      }
                                    }
                                  }}
                                >
                                  <SelectTrigger className="flex-1" data-testid={`select-gender-mapping-${gender}`}>
                                    <SelectValue placeholder="Select size chart row..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {sizeChartMappingData.parsedRows?.map((row) => (
                                      <SelectItem key={row.key} value={row.key}>
                                        {row.key} ({row.sizes.length} sizes: {row.sizes.slice(0, 5).join(', ')}{row.sizes.length > 5 ? '...' : ''})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {genderSizeAssignments[gender] && (
                                  <Badge variant="secondary" className="whitespace-nowrap">
                                    {genderSizeAssignments[gender].sizes.length} sizes
                                  </Badge>
                                )}
                              </div>
                              
                              {/* Units per size for carton products */}
                              {mapping.unitsPerCarton && genderSizeAssignments[gender] && (
                                <div className="px-3 pb-3 pt-2 border-t bg-gray-50">
                                  <Label className="text-xs font-medium mb-2 block">Units per size for {gender}:</Label>
                                  <div className="grid grid-cols-6 gap-1.5">
                                    {genderSizeAssignments[gender].sizes.map((size) => (
                                      <div key={size} className="flex flex-col items-center">
                                        <span className="text-[10px] text-muted-foreground mb-0.5">{size}</span>
                                        <Input
                                          type="number"
                                          min="0"
                                          value={genderUnitsPerSize[gender]?.[size] || ''}
                                          onChange={(e) => {
                                            const value = parseInt(e.target.value) || 0;
                                            setGenderUnitsPerSize(prev => ({
                                              ...prev,
                                              [gender]: {
                                                ...(prev[gender] || {}),
                                                [size]: value
                                              }
                                            }));
                                          }}
                                          placeholder="0"
                                          className="h-7 w-12 text-center text-xs p-1"
                                          data-testid={`input-units-${gender}-${size}`}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-2 text-xs text-right">
                                    <span className="text-muted-foreground">Total: </span>
                                    <span className="font-medium text-purple-600">
                                      {Object.values(genderUnitsPerSize[gender] || {}).reduce((sum, val) => sum + (val || 0), 0)} units
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        
                        {Object.keys(genderSizeAssignments).length === detectedGenders.length && (
                          <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-sm font-medium">All genders mapped</span>
                          </div>
                        )}
                      </div>
                    ) : sizeChartMappingType === 'gender-based' && detectedGenders.length === 0 ? (
                      <Alert>
                        <AlertCircle className="w-4 h-4" />
                        <AlertDescription>
                          No genders detected in your product sheet. Make sure you have mapped the Gender column in the column mapping step.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      /* For product-specific mode, show the parsed mappings */
                      <ScrollArea className="h-48 border rounded-lg bg-white">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-40">SKU/Product</TableHead>
                              <TableHead>Sizes</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sizeChartMappingData.mappings.slice(0, 20).map((mapping, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="font-medium">{mapping.key}</TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {mapping.sizes.slice(0, 10).map((size, sIdx) => (
                                      <Badge key={sIdx} variant="secondary" className="text-xs">
                                        {size}
                                      </Badge>
                                    ))}
                                    {mapping.sizes.length > 10 && (
                                      <Badge variant="outline" className="text-xs">
                                        +{mapping.sizes.length - 10} more
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    )}
                    
                    {sizeChartMappingType === 'product-specific' && sizeChartMappingData.mappings.length > 20 && (
                      <p className="text-xs text-muted-foreground text-center">
                        Showing first 20 of {sizeChartMappingData.mappings.length} mappings
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-6">
            <Button 
              variant="outline" 
              onClick={() => {
                // Go back to gender-mapping if it was shown
                if (mapping.gender && detectedGenders.length > 0) {
                  setStep('gender-mapping');
                } else {
                  setStep('auto-naming');
                }
              }} 
              data-testid="button-back-sizechart"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={() => setStep('collection-info')}
              disabled={!canProceed}
              data-testid="button-proceed-collection"
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  const renderCollectionInfoStep = () => (
    <Card className="p-8">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">Collection Details</h2>

        <div className="space-y-6 mb-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="collection-name-final">Collection Name *</Label>
              <Input
                id="collection-name-final"
                data-testid="input-collection-name-final"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                placeholder="Enter collection name (e.g., Spring 2024)"
              />
            </div>

            <div>
              <Label htmlFor="collection-image-final">Collection Image URL (Optional)</Label>
              <Input
                id="collection-image-final"
                data-testid="input-collection-image-final"
                value={collectionImage}
                onChange={(e) => setCollectionImage(e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
            </div>
          </div>

          <Alert>
            <CheckCircle2 className="w-4 h-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p><strong>Brand:</strong> {selectedBrandName}</p>
                <p><strong>Size Chart Mode:</strong> {
                  sizeChartMappingType === 'uniform' 
                    ? `Uniform - ${sizeCharts.find((c: any) => c.id === selectedSizeChartId)?.name || 'Not selected'}`
                    : sizeChartMappingType === 'product-specific'
                      ? `Product-Specific (${sizeChartMappingData?.mappings.length || 0} mappings)`
                      : `Gender-Based (${Object.keys(genderSizeAssignments).length} mappings)`
                }</p>
                <p><strong>Products:</strong> {editableRows.length} items</p>
                {rawPreview && rawPreview.totalRows > 100 && (
                  <p className="text-amber-600"><strong>Total Rows in File:</strong> {rawPreview.totalRows.toLocaleString()} rows</p>
                )}
              </div>
            </AlertDescription>
          </Alert>

          {rawPreview && rawPreview.totalRows > 1000 && (
            <Alert className="border-amber-200 bg-amber-50">
              <Clock className="w-4 h-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                <strong>Large File Notice:</strong> Your file contains {rawPreview.totalRows.toLocaleString()} rows. 
                Processing may take several minutes. The server will process products in batches for optimal performance.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex gap-2 mt-6">
          <Button variant="outline" onClick={() => setStep('size-chart')} data-testid="button-back-sizechart">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Button 
            onClick={() => processPreOrderMutation.mutate()} 
            disabled={
              processPreOrderMutation.isPending ||
              !collectionName ||
              (sizeChartMappingType === 'uniform' && !selectedSizeChartId) ||
              (sizeChartMappingType === 'product-specific' && (!sizeChartMappingData || sizeChartMappingData.mappings.length === 0)) ||
              (sizeChartMappingType === 'gender-based' && Object.keys(genderSizeAssignments).length !== detectedGenders.length) ||
              (imageSource === 'embedded' && rawPreview?.imageColumnInfo && rawPreview.imageColumnInfo.imageCount > 0 && !imageUploadComplete) ||
              (imageSource === 'zip' && !imageUploadComplete)
            }
            data-testid="button-process-collection"
          >
            Create Collection
          </Button>
        </div>
      </div>
    </Card>
  );

  const renderProcessingStep = () => {
    // Use actual file row count, not preview rows
    const totalProducts = rawPreview?.totalRows || editableRows.length;
    const isLargeUpload = totalProducts > 100;
    const hasImages = (
      (imageSource === 'embedded' && uploadedImagesCount > 0) ||
      (imageSource === 'zip' && uploadedImagesCount > 0) ||
      (imageSource === 'column' && mapping.imageUrl)
    );
    // Cap progress at 100% to prevent overflow display; cap at 99% while still on processing step to avoid showing 100% during finalization
    const actualProcessed = Math.min(productsProcessed, totalProducts);
    const rawPercent = totalProducts > 0 ? Math.min(100, Math.round((actualProcessed / totalProducts) * 100)) : 0;
    const progressPercent = rawPercent >= 100 ? 99 : rawPercent;
    const remainingProducts = Math.max(0, totalProducts - actualProcessed);
    
    // Format elapsed time nicely
    const formatTime = (seconds: number) => {
      if (seconds < 60) return `${seconds}s`;
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    };
    
    // Estimate remaining time based on current progress
    const estimatedTotalTime = actualProcessed > 0 ? Math.round((elapsedSeconds / actualProcessed) * totalProducts) : 0;
    const estimatedRemaining = Math.max(0, estimatedTotalTime - elapsedSeconds);
    
    return (
      <Card className="p-8">
        <div className="max-w-2xl mx-auto text-center">
          {/* Animated spinner with progress ring */}
          <div className="relative mb-6">
            <div className="w-24 h-24 mx-auto">
              {/* Background circle */}
              <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                <circle 
                  cx="50" cy="50" r="40" 
                  stroke="#e5e7eb" 
                  strokeWidth="8" 
                  fill="none" 
                />
                {/* Progress circle */}
                <circle 
                  cx="50" cy="50" r="40" 
                  stroke="#3b82f6" 
                  strokeWidth="8" 
                  fill="none" 
                  strokeLinecap="round"
                  strokeDasharray={`${progressPercent * 2.51} 251`}
                  className="transition-all duration-500"
                />
              </svg>
              {/* Center content */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-blue-600">{progressPercent}%</span>
              </div>
            </div>
          </div>
          
          <h2 className="text-2xl font-bold mb-2">Processing Your Collection</h2>
          
          {/* Dynamic status message */}
          <p className="text-muted-foreground mb-2">
            {rawPercent >= 100 ? 'Finalizing...' : `Creating "${collectionName}"`}
          </p>
          
          {/* Primary progress indicator */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Package className="w-5 h-5 text-blue-600" />
              <span className="text-lg font-semibold text-blue-700">
                {actualProcessed.toLocaleString()} / {totalProducts.toLocaleString()} products uploaded
              </span>
            </div>
            {remainingProducts > 0 && (
              <p className="text-sm text-blue-600">
                {remainingProducts.toLocaleString()} rows remaining to process
              </p>
            )}
          </div>

          {/* Progress bar */}
          <div className="space-y-2 mb-6">
            <Progress value={progressPercent} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{actualProcessed.toLocaleString()} / {totalProducts.toLocaleString()} products</span>
              <span>{progressPercent}% complete</span>
            </div>
          </div>
            
          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3 text-sm mb-6">
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <FileSpreadsheet className="w-5 h-5 mx-auto mb-1 text-gray-600" />
              <p className="font-semibold">{rawPreview?.totalRows?.toLocaleString() || '-'}</p>
              <p className="text-xs text-muted-foreground">Excel Rows</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <Clock className="w-5 h-5 mx-auto mb-1 text-gray-600" />
              <p className="font-semibold">{formatTime(elapsedSeconds)}</p>
              <p className="text-xs text-muted-foreground">Elapsed</p>
            </div>
            {actualProcessed > 0 && estimatedRemaining > 0 && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <Clock className="w-5 h-5 mx-auto mb-1 text-green-600" />
                <p className="font-semibold text-green-700">~{formatTime(estimatedRemaining)}</p>
                <p className="text-xs text-green-600">Remaining</p>
              </div>
            )}
          </div>

          {isLargeUpload && (
            <Alert className="text-left border-blue-200 bg-blue-50">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                <strong>Processing in batches...</strong>
                <br />
                Large uploads are processed in batches of 100 products for reliability.
                Please do not close this page.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </Card>
    );
  };

  const renderCompleteStep = () => (
    <Card className="p-8">
      <div className="max-w-2xl mx-auto text-center">
        <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Collection Created!</h2>
        <p className="text-muted-foreground mb-4">
          Your pre-order collection has been successfully created.
        </p>

        {processingResult && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <Package className="w-5 h-5 mx-auto mb-1 text-green-600" />
              <p className="font-bold text-green-700">{processingResult.productsCreated}</p>
              <p className="text-xs text-green-600">Created</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <RefreshCw className="w-5 h-5 mx-auto mb-1 text-blue-600" />
              <p className="font-bold text-blue-700">{processingResult.productsUpdated}</p>
              <p className="text-xs text-blue-600">Updated</p>
            </div>
            {processingResult.errors && processingResult.errors.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-amber-600" />
                <p className="font-bold text-amber-700">{processingResult.errors.length}</p>
                <p className="text-xs text-amber-600">Errors</p>
              </div>
            )}
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <Clock className="w-5 h-5 mx-auto mb-1 text-gray-600" />
              <p className="font-bold text-gray-700">{processingResult.processingTime}</p>
              <p className="text-xs text-gray-600">Time</p>
            </div>
          </div>
        )}

        {processingResult?.errors && processingResult.errors.length > 0 && (
          <Alert className="text-left mb-6 border-amber-200 bg-amber-50">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <strong>{processingResult.errors.length} items had errors:</strong>
              <ul className="mt-1 text-sm list-disc list-inside max-h-32 overflow-y-auto">
                {processingResult.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {processingResult.errors.length > 5 && (
                  <li>...and {processingResult.errors.length - 5} more</li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3 items-center">
          <Button 
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              window.location.reload();
            }} 
            data-testid="button-create-another"
          >
            Create Another Collection
          </Button>
          <Button 
            variant="outline" 
            onClick={() => window.location.href = '/shop'} 
            data-testid="button-return-shop"
          >
            Return to Shop
          </Button>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {renderStepIndicator()}

      {step === 'brand' && renderBrandStep()}
      {step === 'upload' && renderUploadStep()}
      {step === 'uploading' && renderUploadingStep()}
      {step === 'mapping' && renderMappingStep()}
      {step === 'auto-naming' && renderAutoNamingStep()}
      {step === 'gender-mapping' && renderGenderMappingStep()}
      {step === 'size-chart' && renderSizeChartStep()}
      {step === 'collection-info' && renderCollectionInfoStep()}
      {step === 'processing' && renderProcessingStep()}
      {step === 'complete' && renderCompleteStep()}
    </div>
  );
}
