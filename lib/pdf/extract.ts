/**
 * Client-side text extraction for PDFs, Word docs, and plain text files.
 * Runs in the browser — uses pdf.js and mammoth.js.
 */

// ── PDF (pdf.js) ──────────────────────────────────────────────────────────

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
    const text = content.items
      .filter((item) => 'str' in item && typeof (item as { str?: unknown }).str === 'string')
      .map(item => (item as { str: string }).str)
      .join(' ');
    pages.push(text);
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

/**
 * Extract text from a file blob based on its MIME type or filename extension.
 */
export async function extractTextFromBlob(
  blob: Blob,
  filename: string,
): Promise<ExtractionResult> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const mime = blob.type.toLowerCase();

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
