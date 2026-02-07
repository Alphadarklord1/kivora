// File text extraction for PDF, Word, and PowerPoint

interface PDFTextItem {
  str: string;
}

interface PDFJsLib {
  getDocument: (params: { data: ArrayBuffer }) => { promise: Promise<PDFDocument> };
  GlobalWorkerOptions: { workerSrc: string };
}

interface PDFDocument {
  numPages: number;
  getPage: (pageNum: number) => Promise<PDFPage>;
}

interface PDFPage {
  getTextContent: () => Promise<{ items: PDFTextItem[] }>;
}

declare global {
  interface Window {
    pdfjsLib: PDFJsLib;
  }
}

let pdfJsLoaded = false;

async function loadPdfJs(): Promise<void> {
  if (pdfJsLoaded || typeof window === 'undefined') return;

  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.pdfjsLib) {
      pdfJsLoaded = true;
      resolve();
      return;
    }

    // Try to load from CDN
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        pdfJsLoaded = true;
        resolve();
      } else {
        reject(new Error('PDF.js failed to load'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load PDF.js'));
    document.head.appendChild(script);
  });
}

async function extractTextFromPDF(blob: Blob): Promise<string> {
  await loadPdfJs();

  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const textParts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => item.str)
      .join(' ');
    textParts.push(pageText);
  }

  return textParts.join('\n\n');
}

async function extractTextFromDocx(blob: Blob): Promise<string> {
  // For Word documents, we'll use a simple XML parsing approach
  // This works because .docx files are ZIP archives containing XML
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(blob);
    const docXml = await zip.file('word/document.xml')?.async('string');

    if (!docXml) {
      throw new Error('Could not find document.xml in Word file');
    }

    // Extract text from XML
    const parser = new DOMParser();
    const doc = parser.parseFromString(docXml, 'application/xml');

    // Get all text nodes
    const textNodes = doc.getElementsByTagName('w:t');
    const textParts: string[] = [];

    for (let i = 0; i < textNodes.length; i++) {
      const text = textNodes[i].textContent;
      if (text) textParts.push(text);
    }

    return textParts.join(' ');
  } catch (error) {
    console.error('Failed to extract text from Word file:', error);
    throw new Error('Failed to extract text from Word document. Please copy-paste the text instead.');
  }
}

async function extractTextFromPptx(blob: Blob): Promise<string> {
  // PowerPoint files are also ZIP archives with XML
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(blob);

    const textParts: string[] = [];

    // Get all slide files
    const slideFiles = Object.keys(zip.files).filter(
      (name) => name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
    );

    // Sort slides by number
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
      return numA - numB;
    });

    for (const slideFile of slideFiles) {
      const slideXml = await zip.file(slideFile)?.async('string');
      if (!slideXml) continue;

      const parser = new DOMParser();
      const doc = parser.parseFromString(slideXml, 'application/xml');

      // Get text from a:t elements
      const textNodes = doc.getElementsByTagName('a:t');
      const slideTexts: string[] = [];

      for (let i = 0; i < textNodes.length; i++) {
        const text = textNodes[i].textContent;
        if (text) slideTexts.push(text);
      }

      if (slideTexts.length > 0) {
        textParts.push(slideTexts.join(' '));
      }
    }

    return textParts.join('\n\n');
  } catch (error) {
    console.error('Failed to extract text from PowerPoint file:', error);
    throw new Error('Failed to extract text from PowerPoint. Please copy-paste the text instead.');
  }
}

async function extractTextFromTxt(blob: Blob): Promise<string> {
  return await blob.text();
}

export async function extractTextFromFile(blob: Blob, filename: string): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'pdf':
      return extractTextFromPDF(blob);
    case 'docx':
    case 'doc':
      if (ext === 'doc') {
        throw new Error('Old .doc format not supported. Please save as .docx or copy-paste text.');
      }
      return extractTextFromDocx(blob);
    case 'pptx':
    case 'ppt':
      if (ext === 'ppt') {
        throw new Error('Old .ppt format not supported. Please save as .pptx or copy-paste text.');
      }
      return extractTextFromPptx(blob);
    case 'txt':
      return extractTextFromTxt(blob);
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
      return '[Image file] Use the Visual Analyzer tool to analyze images, extract text, or solve math from this image.';
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}
