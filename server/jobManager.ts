import { v4 as uuidv4 } from 'uuid';

export interface JobProgress {
  stage: 'queued' | 'uploading' | 'extracting' | 'processing-images' | 'building-preview' | 'processing-products' | 'completed' | 'failed';
  percent: number;
  message: string;
  imagesProcessed?: number;
  totalImages?: number;
  productsProcessed?: number;
  totalProducts?: number;
  productsCreated?: number;
  productsUpdated?: number;
  startedAt: number;
  completedAt?: number;
}

export interface UploadJob {
  id: string;
  type: 'upload' | 'processing';
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: JobProgress;
  filePath?: string;
  fileName?: string;
  fileExt?: string;
  tempDataId?: string;
  result?: {
    totalRows: number;
    rawRows: any[][];
    imageColumnInfo?: any;
    extractedImageUrls?: { row: number; imageUrl: string }[];
  };
  processingResult?: {
    collectionId: string;
    collectionName: string;
    productCount: number;
    productsCreated: number;
    productsUpdated: number;
    errors: string[];
    totalErrors: number;
    processingTime: string;
  };
  error?: string;
  createdAt: number;
}

class JobManager {
  private jobs: Map<string, UploadJob> = new Map();
  private queue: string[] = [];
  private isProcessing: boolean = false;
  private processCallback?: (job: UploadJob) => Promise<void>;

  createJob(filePath: string, fileName: string, fileExt: string): string {
    const id = uuidv4();
    const job: UploadJob = {
      id,
      type: 'upload',
      status: 'queued',
      progress: {
        stage: 'queued',
        percent: 0,
        message: 'Waiting in queue...',
        startedAt: Date.now(),
      },
      filePath,
      fileName,
      fileExt,
      createdAt: Date.now(),
    };
    
    this.jobs.set(id, job);
    this.queue.push(id);
    
    console.log(`📋 Job created: ${id} for ${fileName}`);
    
    this.processQueue();
    
    return id;
  }

  createProcessingJob(collectionName: string, totalProducts: number): string {
    const id = uuidv4();
    const job: UploadJob = {
      id,
      type: 'processing',
      status: 'running',
      progress: {
        stage: 'processing-products',
        percent: 0,
        message: `Processing ${totalProducts} products...`,
        productsProcessed: 0,
        totalProducts,
        productsCreated: 0,
        productsUpdated: 0,
        startedAt: Date.now(),
      },
      createdAt: Date.now(),
    };
    
    this.jobs.set(id, job);
    console.log(`📋 Processing job created: ${id} for ${collectionName}`);
    
    return id;
  }

  updateProcessingProgress(id: string, productsProcessed: number, productsCreated: number, productsUpdated: number): void {
    const job = this.jobs.get(id);
    if (job && job.progress.totalProducts) {
      const percent = Math.min(99, Math.round((productsProcessed / job.progress.totalProducts) * 100));
      job.progress = {
        ...job.progress,
        productsProcessed,
        productsCreated,
        productsUpdated,
        percent,
        message: `Processing ${productsProcessed} of ${job.progress.totalProducts} products...`,
      };
    }
  }

  // Update totalProducts after SKU consolidation (actual unique products vs raw rows)
  updateTotalProducts(id: string, totalProducts: number): void {
    const job = this.jobs.get(id);
    if (job) {
      job.progress.totalProducts = totalProducts;
      job.progress.message = `Processing ${job.progress.productsProcessed || 0} of ${totalProducts} products...`;
      console.log(`📊 Job ${id}: Updated totalProducts to ${totalProducts} (after consolidation)`);
    }
  }

  completeProcessingJob(id: string, result: UploadJob['processingResult']): void {
    try {
      const job = this.jobs.get(id);
      if (job) {
        job.status = 'completed';
        job.processingResult = result;
        const total = job.progress?.totalProducts ?? result?.productCount ?? 0;
        job.progress = {
          ...job.progress,
          stage: 'completed',
          percent: 100,
          message: 'Processing complete!',
          productsProcessed: total,
          productsCreated: result?.productsCreated ?? 0,
          productsUpdated: result?.productsUpdated ?? 0,
          completedAt: Date.now(),
        };
        console.log(`✅ Processing job ${id} completed`);
      }
    } catch (e) {
      console.error(`❌ completeProcessingJob failed for ${id}:`, e);
      this.failJob(id, e instanceof Error ? e.message : 'Job completion failed');
    }
  }

  getJob(id: string): UploadJob | undefined {
    return this.jobs.get(id);
  }

  getAllJobs(): UploadJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  updateProgress(id: string, progress: Partial<JobProgress>): void {
    const job = this.jobs.get(id);
    if (job) {
      job.progress = { ...job.progress, ...progress };
      console.log(`📊 Job ${id}: ${progress.stage || job.progress.stage} - ${progress.percent || job.progress.percent}% - ${progress.message || job.progress.message}`);
    }
  }

  completeJob(id: string, result: UploadJob['result'], tempDataId: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = 'completed';
      job.result = result;
      job.tempDataId = tempDataId;
      job.progress = {
        ...job.progress,
        stage: 'completed',
        percent: 100,
        message: 'Upload complete!',
        completedAt: Date.now(),
      };
      console.log(`✅ Job ${id} completed`);
    }
  }

  failJob(id: string, error: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = 'failed';
      job.error = error;
      job.progress = {
        ...job.progress,
        stage: 'failed',
        message: error,
        completedAt: Date.now(),
      };
      console.log(`❌ Job ${id} failed: ${error}`);
    }
  }

  setProcessCallback(callback: (job: UploadJob) => Promise<void>): void {
    this.processCallback = callback;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0 || !this.processCallback) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const jobId = this.queue.shift()!;
      const job = this.jobs.get(jobId);
      
      if (job && job.status === 'queued') {
        job.status = 'running';
        job.progress.stage = 'uploading';
        job.progress.message = 'Processing file...';
        
        try {
          await this.processCallback(job);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error ?? 'Unknown error occurred');
          this.failJob(jobId, message);
        }
      }
    }

    this.isProcessing = false;
  }

  cleanupOldJobs(maxAgeMs: number = 3600000): void {
    const now = Date.now();
    const entries = Array.from(this.jobs.entries());
    for (const entry of entries) {
      const [id, job] = entry;
      if (now - job.createdAt > maxAgeMs && (job.status === 'completed' || job.status === 'failed')) {
        this.jobs.delete(id);
        console.log(`🧹 Cleaned up old job: ${id}`);
      }
    }
  }
}

export const jobManager = new JobManager();
