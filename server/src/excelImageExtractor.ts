import ExcelJS from 'exceljs';
import { uploadImageToDrive, getDirectImageUrl } from './googleDriveService.js';

interface ExtractedImage {
  row: number;
  col: number;
  buffer: Buffer;
  extension: string;
  mimeType: string;
}

interface ImageUploadResult {
  row: number;
  col: number;
  imageUrl: string;
  fileId: string;
}

// Get column index from column name (e.g., "A" -> 0, "B" -> 1, "Image" -> index by header match)
export function getColumnIndex(worksheet: ExcelJS.Worksheet, columnName: string): number {
  // First check if it's a letter-based column reference (A, B, C, etc.)
  if (/^[A-Z]+$/i.test(columnName)) {
    let index = 0;
    for (let i = 0; i < columnName.length; i++) {
      index = index * 26 + (columnName.toUpperCase().charCodeAt(i) - 64);
    }
    return index - 1; // Convert to 0-based
  }
  
  // Otherwise, find column by header name in first row
  const headerRow = worksheet.getRow(1);
  let colIndex = -1;
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (cell.value && String(cell.value).toLowerCase() === columnName.toLowerCase()) {
      colIndex = colNumber - 1; // Convert to 0-based
    }
  });
  
  return colIndex;
}

export async function extractImagesFromExcel(filePath: string, targetColumn?: string): Promise<ExtractedImage[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const worksheet = workbook.worksheets[0];
  const images: ExtractedImage[] = [];

  // Get target column index if specified
  let targetColIndex = -1;
  if (targetColumn) {
    targetColIndex = getColumnIndex(worksheet, targetColumn);
    console.log(`Target column "${targetColumn}" resolved to index ${targetColIndex}`);
  }

  const excelImages = worksheet.getImages();
  console.log(`Found ${excelImages.length} total images in Excel file`);
  
  for (const image of excelImages) {
    const imageId = image.imageId;
    const img = workbook.getImage(Number(imageId));
    
    if (img && img.buffer) {
      const extension = img.extension || 'png';
      const mimeType = extension === 'jpg' || extension === 'jpeg' 
        ? 'image/jpeg' 
        : extension === 'gif' 
          ? 'image/gif' 
          : 'image/png';

      const range = image.range;
      let row = 0;
      let col = 0;
      
      if (typeof range === 'object' && 'tl' in range) {
        row = Math.floor(range.tl.row);
        col = Math.floor(range.tl.col);
      }

      // Filter by target column if specified
      if (targetColIndex >= 0 && col !== targetColIndex) {
        console.log(`Skipping image at row ${row}, col ${col} (not in target column ${targetColIndex})`);
        continue;
      }

      console.log(`Including image at row ${row}, col ${col}`);
      images.push({
        row,
        col,
        buffer: img.buffer as Buffer,
        extension,
        mimeType,
      });
    }
  }

  console.log(`Extracted ${images.length} images${targetColumn ? ` from column "${targetColumn}"` : ''}`);
  return images;
}

export async function uploadExcelImagesToDrive(
  filePath: string,
  fileNamePrefix: string,
  targetColumn?: string,
  articleNumbers?: Map<number, string> // Optional map of row index to article number
): Promise<ImageUploadResult[]> {
  const extractedImages = await extractImagesFromExcel(filePath, targetColumn);
  const results: ImageUploadResult[] = [];

  // Batch size for uploads (to avoid timeout)
  const BATCH_SIZE = 100;
  
  for (let i = 0; i < extractedImages.length; i++) {
    const img = extractedImages[i];
    
    // Use article number if available, otherwise fall back to row number
    const articleNum = articleNumbers?.get(img.row);
    const fileIdentifier = articleNum 
      ? `${articleNum.replace(/[^a-zA-Z0-9-_]/g, '_')}_${i}`
      : `row${img.row}_${i}`;
    
    const fileName = `${fileNamePrefix}_${fileIdentifier}.${img.extension}`;
    
    try {
      const uploadResult = await uploadImageToDrive(img.buffer, fileName, img.mimeType);
      results.push({
        row: img.row,
        col: img.col,
        imageUrl: getDirectImageUrl(uploadResult.fileId),
        fileId: uploadResult.fileId,
      });
      
      // Log progress for batches
      if ((i + 1) % BATCH_SIZE === 0) {
        console.log(`Uploaded ${i + 1}/${extractedImages.length} images to Google Drive`);
      }
    } catch (error) {
      console.error(`Failed to upload image at row ${img.row}:`, error);
    }
  }
  
  console.log(`Completed uploading ${results.length}/${extractedImages.length} images`);
  return results;
}

export function mapImagesToRows(
  uploadedImages: ImageUploadResult[],
  headerRowIndex: number = 0
): Map<number, string> {
  const rowImageMap = new Map<number, string>();
  
  for (const img of uploadedImages) {
    const dataRowIndex = img.row - headerRowIndex - 1;
    if (dataRowIndex >= 0) {
      rowImageMap.set(dataRowIndex, img.imageUrl);
    }
  }
  
  return rowImageMap;
}

export async function processExcelWithImages(
  filePath: string,
  fileNamePrefix: string,
  headerRowIndex: number = 0,
  targetColumn?: string,
  articleNumbers?: Map<number, string>
): Promise<{ images: ImageUploadResult[]; rowImageMap: Map<number, string> }> {
  const images = await uploadExcelImagesToDrive(filePath, fileNamePrefix, targetColumn, articleNumbers);
  const rowImageMap = mapImagesToRows(images, headerRowIndex);
  
  return { images, rowImageMap };
}
