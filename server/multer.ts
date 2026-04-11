import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure upload directories exist
const uploadDir = path.join(process.cwd(), 'uploads');
const productPhotosDir = path.join(uploadDir, 'products');
const stockUploadsDir = path.join(uploadDir, 'stock');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

if (!fs.existsSync(productPhotosDir)) {
  fs.mkdirSync(productPhotosDir, { recursive: true });
}

if (!fs.existsSync(stockUploadsDir)) {
  fs.mkdirSync(stockUploadsDir, { recursive: true });
}

/** Temp staging for multi-file customer docs — must NOT use product storage (no productId → filename collisions). */
const customerDocTempDir = path.join(uploadDir, 'customer-documents-temp');
if (!fs.existsSync(customerDocTempDir)) {
  fs.mkdirSync(customerDocTempDir, { recursive: true });
}

const customerDocumentsStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, customerDocTempDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `${unique}${ext}`);
  },
});

const customerDocumentFileFilter = (_req: any, file: any, cb: any) => {
  const ok =
    file.mimetype.startsWith('image/') ||
    file.mimetype === 'application/pdf' ||
    /\.(pdf|jpe?g|png|gif|webp)$/i.test(file.originalname);
  if (ok) cb(null, true);
  else cb(new Error('Only images or PDF files are allowed for customer documents'), false);
};

export const uploadCustomerDocuments = multer({
  storage: customerDocumentsStorage,
  fileFilter: customerDocumentFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// Configure multer for product photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, productPhotosDir);
  },
  filename: (req, file, cb) => {
    const productId = req.params.id || req.body.productId;
    const extension = path.extname(file.originalname);
    cb(null, `${productId}${extension}`);
  }
});

// File filter to only allow images
const fileFilter = (req: any, file: any, cb: any) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

export const uploadSingle = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  }
});

/** Brand logos: unique filename per upload so `logoUrl` changes and browsers don't keep showing a cached image. */
const brandLogoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, productPhotosDir);
  },
  filename: (req, file, cb) => {
    const brandId = req.params.id as string;
    const extension = path.extname(file.originalname) || ".jpg";
    cb(null, `brand-${brandId}-${Date.now()}${extension}`);
  },
});

export const uploadBrandLogo = multer({
  storage: brandLogoStorage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
});

// Configure multer for CSV/Excel stock uploads
const stockStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, stockUploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const extension = path.extname(file.originalname);
    cb(null, `stock-${timestamp}${extension}`);
  }
});

// File filter to allow CSV and Excel files
const csvFileFilter = (req: any, file: any, cb: any) => {
  const allowedMimeTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  const allowedExtensions = ['.csv', '.xls', '.xlsx'];
  const fileExt = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
  
  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV and Excel files are allowed!'), false);
  }
};

export const uploadCSV = multer({
  storage: stockStorage,
  fileFilter: csvFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for CSV files
  }
});

// Configure multer for large pre-order uploads (unlimited size for enterprise uploads)
const preorderUploadsDir = path.join(uploadDir, 'preorder');
if (!fs.existsSync(preorderUploadsDir)) {
  fs.mkdirSync(preorderUploadsDir, { recursive: true });
}

const preorderStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, preorderUploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const extension = path.extname(file.originalname);
    cb(null, `preorder-${timestamp}${extension}`);
  }
});

export const uploadPreorder = multer({
  storage: preorderStorage,
  fileFilter: csvFileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for large pre-order files
  }
});

// Configure multer for ZIP file uploads (containing images)
const zipFileFilter = (req: any, file: any, cb: any) => {
  const allowedMimeTypes = [
    'application/zip',
    'application/x-zip-compressed',
    'application/x-zip',
    'multipart/x-zip'
  ];
  
  const fileExt = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
  
  if (allowedMimeTypes.includes(file.mimetype) || fileExt === '.zip') {
    cb(null, true);
  } else {
    cb(new Error('Only ZIP files are allowed!'), false);
  }
};

export const uploadZip = multer({
  storage: preorderStorage,
  fileFilter: zipFileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for ZIP files
  }
});

export const getFileUrl = (productId: string, filename?: string) => {
  if (filename) {
    return `/uploads/products/${filename}`;
  }
  
  // Try to find the file with common extensions
  const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  for (const ext of extensions) {
    const filePath = path.join(productPhotosDir, `${productId}${ext}`);
    if (fs.existsSync(filePath)) {
      return `/uploads/products/${productId}${ext}`;
    }
  }
  
  return null;
};