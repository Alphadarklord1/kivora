/**
 * Client-side text extraction for PDFs, Word docs, plain text, and images.
 * Runs in the browser — uses pdf.js, mammoth.js, and tesseract.js (OCR).
 */

type OcrLocale = 'en' | 'ar' | 'fr' | 'es' | 'de' | 'zh';

const OCR_LANGUAGE_MAP: Record<OcrLocale, string> = {
  en: 'eng',
  ar: 'ara+eng',
  fr: 'fra+eng',
  es: 'spa+eng',
  de: 'deu+eng',
  zh: 'chi_sim+eng',
};

function normalizeOcrLocale(language?: string): OcrLocale {
  return language === 'ar' || language === 'fr' || language === 'es' || language === 'de' || language === 'zh'
    ? language
    : 'en';
}

export function getOcrLanguagePack(language?: string): string {
  return OCR_LANGUAGE_MAP[normalizeOcrLocale(language)];
}

// ── PDF (pdf.js) with table-aware extraction ──────────────────────────────

/**
 * Reconstruct table-like rows from PDF text items by grouping items with
 * similar vertical positions and sorting them left-to-right.
 */
function reconstructTablesFromItems(
  items: { str: string; transform: number[] }[],
): string {
  if (!items.length) return '';

  // Group items by rounded Y coordinate (PDF Y is from bottom)
  const rows = new Map<number, { x: number; str: string }[]>();
  const Y_TOLERANCE = 3; // pts — items within 3pt are on the same line

  for (const item of items) {
    if (!item.str.trim()) continue;
    const rawY = item.transform[5]; // y coordinate
    // Find an existing row bucket within tolerance
    let bucketY: number | undefined;
    for (const key of rows.keys()) {
      if (Math.abs(key - rawY) <= Y_TOLERANCE) { bucketY = key; break; }
    }
    if (bucketY === undefined) { rows.set(rawY, []); bucketY = rawY; }
    rows.get(bucketY)!.push({ x: item.transform[4], str: item.str });
  }

  // Sort rows by descending Y (top of page first in PDF coords)
  const sortedRows = Array.from(rows.entries())
    .sort(([ya], [yb]) => yb - ya)
    .map(([, cells]) => cells.sort((a, b) => a.x - b.x));

  // Detect if this looks like a table block: multiple rows each with ≥2 cells
  const multiCellRows = sortedRows.filter(r => r.length >= 2);
  const looksLikeTable = multiCellRows.length >= 3 &&
    multiCellRows.length / sortedRows.length > 0.5;

  if (looksLikeTable) {
    // Format as tab-separated to preserve column alignment
    return sortedRows
      .map(row => row.map(c => c.str).join('\t'))
      .join('\n');
  }

  // Normal prose: join items with a space, insert line breaks between rows
  return sortedRows
    .map(row => row.map(c => c.str).join(' '))
    .join(' ');
}

async function extractPdf(blob: Blob): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // Use local worker from /public to avoid CDN fetch failures
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }

  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Use position-aware reconstruction to preserve table structure
    const itemsWithPos = content.items
      .filter((item) => 'str' in item && typeof (item as { str?: unknown; transform?: unknown }).str === 'string')
      .map(item => item as { str: string; transform: number[] });
    const text = reconstructTablesFromItems(itemsWithPos);
    if (text.trim()) pages.push(text.trim());
  }

  return pages.join('\n\n').trim();
}

// ── Word .docx (mammoth) ──────────────────────────────────────────────────

async function extractDocx(blob: Blob): Promise<string> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await blob.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}

/**
 * Convert a .docx blob to an HTML string for visual preview.
 * Uses mammoth.convertToHtml — runs entirely client-side.
 */
export async function extractDocxHtml(blob: Blob): Promise<string> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await blob.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value || '';
}

// ── PowerPoint / other ────────────────────────────────────────────────────

async function extractPptx(blob: Blob): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const arrayBuffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const texts: string[] = [];

  const slideFiles = Object.keys(zip.files)
    .filter(n => n.match(/ppt\/slides\/slide\d+\.xml/))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] ?? '0');
      const nb = parseInt(b.match(/(\d+)/)?.[1] ?? '0');
      return na - nb;
    });

  for (const name of slideFiles) {
    const xml = await zip.files[name].async('text');
    // Strip XML tags and decode basic entities
    const raw = xml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (raw) texts.push(raw);
  }

  return texts.join('\n\n');
}

// ── Image OCR (tesseract.js) ───────────────────────────────────────────────

async function extractImage(blob: Blob, language?: string): Promise<string> {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker(getOcrLanguagePack(language), 1, {
      // Suppress Tesseract's own console spam
      logger: () => {},
      errorHandler: () => {},
    });
    const url = URL.createObjectURL(blob);
    try {
      const { data } = await worker.recognize(url);
      return data.text.trim();
    } finally {
      URL.revokeObjectURL(url);
      await worker.terminate();
    }
  } catch (err) {
    throw new Error(`OCR failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Plain text ────────────────────────────────────────────────────────────

async function extractText(blob: Blob): Promise<string> {
  return blob.text();
}

// ── Public API ────────────────────────────────────────────────────────────

export type ExtractionResult = {
  text: string;
  wordCount: number;
  error?: string;
};

type ExtractionOptions = {
  language?: string;
};

/**
 * Extract text from a file blob based on its MIME type or filename extension.
 */
export async function extractTextFromBlob(
  blob: Blob,
  filename: string,
  options: ExtractionOptions = {},
): Promise<ExtractionResult> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const mime = blob.type.toLowerCase();
  const language = options.language
    ?? (typeof document !== 'undefined' ? document.documentElement.getAttribute('lang') ?? undefined : undefined);

  try {
    let text = '';

    if (mime === 'application/pdf' || ext === 'pdf') {
      text = await extractPdf(blob);
    } else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === 'docx'
    ) {
      text = await extractDocx(blob);
    } else if (
      mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      ext === 'pptx'
    ) {
      text = await extractPptx(blob);
    } else if (
      mime.startsWith('image/') ||
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif'].includes(ext)
    ) {
      // OCR: extract text from images using Tesseract.js
      text = await extractImage(blob, language);
      if (!text) return { text: '', wordCount: 0, error: 'No text detected in image. The image may not contain readable text.' };
    } else if (
      mime.startsWith('text/') ||
      ['txt', 'md', 'csv', 'json', 'xml', 'html'].includes(ext)
    ) {
      text = await extractText(blob);
    } else {
      return { text: '', wordCount: 0, error: `Unsupported file type: .${ext}` };
    }

    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    return { text, wordCount };
  } catch (err) {
    console.error('[extract]', err);
    return {
      text: '',
      wordCount: 0,
      error: err instanceof Error ? err.message : 'Extraction failed.',
    };
  }
}

/** @deprecated Use extractTextFromBlob */
export const extractTextFromFile = extractTextFromBlob;
