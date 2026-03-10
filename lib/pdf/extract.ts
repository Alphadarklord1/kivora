// File text extraction for PDF, Word, and PowerPoint
import { getPdfJs } from '@/lib/pdf/pdfjs';

interface PDFTextItem {
  str: string;
}

interface PDFDocument {
  numPages: number;
  getPage: (pageNum: number) => Promise<PDFPage>;
}

interface PDFPage {
  getTextContent: () => Promise<{ items: PDFTextItem[] }>;
}

function normalizeExtractedDocumentText(text: string): string {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function extractTextFromPDF(blob: Blob): Promise<string> {
  const pdfjs = await getPdfJs();
  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise as PDFDocument;

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
  try {
    const mammoth = await import('mammoth/mammoth.browser');
    const arrayBuffer = await blob.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const extracted = normalizeExtractedDocumentText(result.value || '');

    if (extracted) {
      return extracted;
    }
  } catch (error) {
    console.warn('Mammoth DOCX extraction fell back to XML parsing:', error);
  }

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

    return normalizeExtractedDocumentText(textParts.join(' '));
  } catch (error) {
    console.error('Failed to extract text from Word file:', error);
    throw new Error('Failed to extract text from Word document. DOCX files are supported, including Arabic text, but this file could not be parsed.');
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
