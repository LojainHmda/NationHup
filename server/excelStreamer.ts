import * as fs from 'fs';
import * as path from 'path';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';

export interface StreamedRow {
  rowNumber: number;
  values: any[];
}

export interface ExcelMetadata {
  totalRows: number;
  nonEmptyRows: number;
  columnCount: number;
  hasImages: boolean;
  imageCount: number;
}

const LARGE_FILE_THRESHOLD = 1024 * 1024; // 1MB - use streaming to avoid OOM on 100K+ row files

function normalizeCellValue(cell: any): any {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object') {
    if (cell.text) return cell.text;
    if (cell.result !== undefined) return cell.result;
    if (cell.richText) {
      return cell.richText.map((rt: any) => rt.text || '').join('');
    }
    if (cell.hyperlink) return cell.text || cell.hyperlink;
    return String(cell);
  }
  return cell;
}

function getFileSize(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/** Progress callback: (rowsRead, percent, message) */
export type StreamExcelProgressCallback = (rowsRead: number, percent: number, message: string) => void;

export async function streamExcelPreview(
  filePath: string,
  previewLimit: number = 50,
  onProgress?: StreamExcelProgressCallback
): Promise<{ rows: any[][]; totalRows: number; imageCount: number }> {
  const ExcelJS = (await import('exceljs')).default;
  const fileSize = getFileSize(filePath);
  const estimatedRows = Math.max(1000, Math.floor(fileSize / 150));
  const PROGRESS_INTERVAL = Math.max(1000, Math.floor(estimatedRows / 50));

  const previewRows: any[][] = [];
  let totalRows = 0;
  let imageCount = 0;
  let lastReportedPercent = 0;

  const reportProgress = (rows: number, msg: string) => {
    if (!onProgress) return;
    const percent = Math.min(90, 5 + Math.floor(85 * Math.min(1, rows / estimatedRows)));
    if (percent > lastReportedPercent) {
      lastReportedPercent = percent;
      onProgress(rows, percent, msg);
    }
  };

  console.log(`📊 Excel: using streaming parser (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`);

  const options = {
    entries: 'emit' as const,
    sharedStrings: 'cache' as const,
    hyperlinks: 'ignore' as const,
    styles: 'ignore' as const,
    worksheets: 'emit' as const,
  };

  try {
    const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, options);

    for await (const worksheetReader of workbookReader) {
      for await (const row of worksheetReader as any) {
        totalRows++;

        if (totalRows % PROGRESS_INTERVAL === 0) {
          reportProgress(totalRows, `Reading rows... ${totalRows.toLocaleString()} read`);
        }

        if (previewRows.length < previewLimit) {
          const values = row.values as any[];
          const normalizedRow = values ? values.slice(1).map((cell: any) => normalizeCellValue(cell)) : [];
          previewRows.push(normalizedRow);
        }
      }
      break;
    }

    if (onProgress) onProgress(totalRows, 90, `Found ${totalRows.toLocaleString()} rows`);
    console.log(`📊 Streaming read complete: ${totalRows} rows, ${previewRows.length} preview rows`);
    imageCount = -1;
  } catch (streamError) {
    console.error('Excel streaming preview failed:', streamError);
    imageCount = -1;
    throw streamError;
  }

  return {
    rows: previewRows,
    totalRows,
    imageCount
  };
}

export async function countExcelRowsStreaming(filePath: string): Promise<{ total: number; nonEmpty: number }> {
  const ExcelJS = (await import('exceljs')).default;
  let total = 0;
  let nonEmpty = 0;

  const options = {
    entries: 'emit' as const,
    sharedStrings: 'cache' as const,
    hyperlinks: 'ignore' as const,
    styles: 'ignore' as const,
    worksheets: 'emit' as const,
  };

  try {
    const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, options);

    for await (const worksheetReader of workbookReader) {
      for await (const row of worksheetReader as any) {
        total++;
        const values = row.values as any[];
        if (values && values.slice(1).some((cell: any) => cell !== null && cell !== undefined && cell !== '')) {
          nonEmpty++;
        }
      }
      break;
    }
  } catch (e) {
    console.error('Excel streaming count failed:', e);
    throw e;
  }

  return { total, nonEmpty };
}

export async function* streamExcelRowsChunked(
  filePath: string,
  headerRowIndex: number = 0,
  chunkSize: number = 500
): AsyncGenerator<{ rows: any[]; chunkIndex: number; isLast: boolean; totalProcessed: number }> {
  const ExcelJS = (await import('exceljs')).default;
  const fileSize = getFileSize(filePath);

  let headers: string[] = [];
  let rowBuffer: any[] = [];
  let currentRowNumber = 0;
  let chunkIndex = 0;
  let totalProcessed = 0;

  console.log(`📊 Streaming Excel in ${chunkSize}-row chunks (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`);

  const options = {
    entries: 'emit' as const,
    sharedStrings: 'cache' as const,
    hyperlinks: 'ignore' as const,
    styles: 'ignore' as const,
    worksheets: 'emit' as const,
  };

  try {
    const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, options);

    for await (const worksheetReader of workbookReader) {
      for await (const row of worksheetReader as any) {
        currentRowNumber++;
        const values = row.values as any[];
        const normalizedRow = values ? values.slice(1).map((cell: any) => normalizeCellValue(cell)) : [];

        if (currentRowNumber === headerRowIndex + 1) {
          headers = normalizedRow.map((h: any) => String(h || '').trim());
          continue;
        }

        if (currentRowNumber <= headerRowIndex + 1) {
          continue;
        }

        const rowObj: any = {};
        headers.forEach((header, i) => {
          if (header) {
            rowObj[header] = normalizedRow[i] ?? '';
          }
        });
        rowObj._rowNumber = currentRowNumber;

        rowBuffer.push(rowObj);

        if (rowBuffer.length >= chunkSize) {
          totalProcessed += rowBuffer.length;
          yield {
            rows: rowBuffer,
            chunkIndex,
            isLast: false,
            totalProcessed
          };

          rowBuffer = [];
          chunkIndex++;

          if (typeof global.gc === 'function') {
            try { global.gc(); } catch (e) {}
          }

          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      break;
    }
  } catch (streamError) {
    console.error('Streaming chunk read failed:', streamError);
    throw streamError;
  }

  if (rowBuffer.length > 0) {
    totalProcessed += rowBuffer.length;
    yield {
      rows: rowBuffer,
      chunkIndex,
      isLast: true,
      totalProcessed
    };
  }
}

export async function countExcelRows(filePath: string): Promise<{ total: number; nonEmpty: number }> {
  return countExcelRowsStreaming(filePath);
}

/** Read NDJSON file as async generator - one object per line. Does not load full file. */
export async function* readNdjsonStream(filePath: string): AsyncGenerator<any> {
  const { createInterface } = await import('readline');
  const fileStream = createReadStream(filePath);
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      yield JSON.parse(trimmed);
    } catch (e) {
      console.warn('Skipping invalid NDJSON line:', trimmed?.slice(0, 80));
    }
  }
}

/** Stream CSV file in chunks. Yields row objects keyed by header. Does not load full file. */
export async function* streamCsvRowsChunked(
  filePath: string,
  headerRowIndex: number = 0,
  chunkSize: number = 500
): AsyncGenerator<{ rows: any[]; chunkIndex: number; isLast: boolean; totalProcessed: number }> {
  const stream = createReadStream(filePath).pipe(
    parse({
      columns: false,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    })
  );

  let headers: string[] = [];
  let rowBuffer: any[] = [];
  let currentRowNumber = 0;
  let chunkIndex = 0;
  let totalProcessed = 0;

  for await (const row of stream as AsyncIterable<any[]>) {
    currentRowNumber++;
    if (currentRowNumber === headerRowIndex + 1) {
      headers = row.map((h: any) => String(h || '').trim());
      continue;
    }
    if (currentRowNumber <= headerRowIndex + 1) continue;

    const rowObj: any = {};
    headers.forEach((header, i) => {
      if (header) rowObj[header] = row[i] ?? '';
    });
    rowObj._rowNumber = currentRowNumber;
    rowBuffer.push(rowObj);

    if (rowBuffer.length >= chunkSize) {
      totalProcessed += rowBuffer.length;
      yield {
        rows: rowBuffer,
        chunkIndex,
        isLast: false,
        totalProcessed
      };
      rowBuffer = [];
      chunkIndex++;
      await new Promise((r) => setImmediate(r));
    }
  }

  if (rowBuffer.length > 0) {
    totalProcessed += rowBuffer.length;
    yield {
      rows: rowBuffer,
      chunkIndex,
      isLast: true,
      totalProcessed
    };
  }
}

/** Stream CSV preview - returns first N rows and total count without loading full file. */
export async function streamCsvPreview(
  filePath: string,
  previewLimit: number = 50
): Promise<{ rows: any[][]; totalRows: number }> {
  const fileStream = createReadStream(filePath);
  const parser = parse({
    columns: false,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
  });

  const previewRows: any[][] = [];
  let totalRows = 0;

  await new Promise<void>((resolve, reject) => {
    fileStream
      .pipe(parser)
      .on('data', (row: any[]) => {
        totalRows++;
        if (previewRows.length < previewLimit) {
          previewRows.push(row);
        }
      })
      .on('error', reject)
      .on('end', resolve);
  });

  return { rows: previewRows, totalRows };
}

export async function detectExcelImages(filePath: string): Promise<number> {
  const fileSize = getFileSize(filePath);
  if (fileSize > LARGE_FILE_THRESHOLD) {
    return -1;
  }

  try {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];

    if (worksheet) {
      const images = worksheet.getImages() || [];
      return images.length;
    }
  } catch (e) {
    console.log('Could not detect images:', e);
  }

  return 0;
}

export async function processExcelInChunks<T>(
  filePath: string,
  headerRowIndex: number,
  chunkSize: number,
  processor: (rows: any[], chunkIndex: number, isLast: boolean) => Promise<T[]>,
  onProgress?: (processed: number, total: number) => void
): Promise<T[]> {
  const results: T[] = [];
  const { total } = await countExcelRowsStreaming(filePath);

  for await (const chunk of streamExcelRowsChunked(filePath, headerRowIndex, chunkSize)) {
    const chunkResults = await processor(chunk.rows, chunk.chunkIndex, chunk.isLast);
    results.push(...chunkResults);

    if (onProgress) {
      onProgress(chunk.totalProcessed, total);
    }

    await new Promise(resolve => setTimeout(resolve, 50));

    if (typeof global.gc === 'function') {
      try { global.gc(); } catch (e) {}
    }
  }

  return results;
}
