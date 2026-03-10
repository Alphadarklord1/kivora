// Image extraction from PDF files using PDF.js
import { getPdfJs } from '@/lib/pdf/pdfjs';

export interface ExtractedImage {
  id: string;
  pageNumber: number;
  dataUrl: string; // Base64 data URL
  width: number;
  height: number;
  position: { x: number; y: number };
}

export interface PDFPageRender {
  pageNumber: number;
  imageDataUrl: string;
  width: number;
  height: number;
}

interface PDFDocument {
  numPages: number;
  getPage: (pageNum: number) => Promise<PDFPage>;
}

interface PDFPage {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
  getOperatorList: () => Promise<PDFOperatorList>;
  objs: PDFObjects;
}

interface PDFOperatorList {
  fnArray: number[];
  argsArray: unknown[][];
}

interface PDFObjects {
  get: (name: string) => PDFImageData | null;
}

interface PDFImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  kind?: number;
}

// PDF.js operator codes for images
const OPS = {
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
  paintImageXObjectRepeat: 87,
};

// Render a PDF page to an image (for visual preview)
export async function renderPDFPageToImage(
  blob: Blob,
  pageNumber: number,
  scale: number = 2
): Promise<PDFPageRender> {
  const pdfjs = await getPdfJs();
  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise as PDFDocument;

  if (pageNumber < 1 || pageNumber > pdf.numPages) {
    throw new Error(`Invalid page number: ${pageNumber}. PDF has ${pdf.numPages} pages.`);
  }

  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not get canvas context');

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  return {
    pageNumber,
    imageDataUrl: canvas.toDataURL('image/png'),
    width: viewport.width,
    height: viewport.height,
  };
}

// Render all PDF pages to images
export async function renderAllPDFPages(
  blob: Blob,
  scale: number = 1.5,
  maxPages: number = 20
): Promise<PDFPageRender[]> {
  const pdfjs = await getPdfJs();
  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise as PDFDocument;

  const pagesToRender = Math.min(pdf.numPages, maxPages);
  const renders: PDFPageRender[] = [];

  for (let i = 1; i <= pagesToRender; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext('2d');
    if (!context) continue;

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    renders.push({
      pageNumber: i,
      imageDataUrl: canvas.toDataURL('image/png'),
      width: viewport.width,
      height: viewport.height,
    });
  }

  return renders;
}

// Extract embedded images from PDF (actual image objects)
export async function extractImagesFromPDF(
  blob: Blob,
  maxImages: number = 50
): Promise<ExtractedImage[]> {
  const pdfjs = await getPdfJs();
  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise as PDFDocument;

  const images: ExtractedImage[] = [];
  let imageCount = 0;

  for (let pageNum = 1; pageNum <= pdf.numPages && imageCount < maxImages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const operatorList = await page.getOperatorList();

    for (let i = 0; i < operatorList.fnArray.length && imageCount < maxImages; i++) {
      const fn = operatorList.fnArray[i];

      if (
        fn === OPS.paintImageXObject ||
        fn === OPS.paintInlineImageXObject ||
        fn === OPS.paintImageXObjectRepeat
      ) {
        const args = operatorList.argsArray[i];
        const imageName = args[0] as string;

        try {
          const imgData = page.objs.get(imageName);
          if (imgData && imgData.width > 50 && imgData.height > 50) {
            // Skip tiny images (likely icons/decorations)
            const canvas = document.createElement('canvas');
            canvas.width = imgData.width;
            canvas.height = imgData.height;

            const ctx = canvas.getContext('2d');
            if (ctx && imgData.data) {
              const imageData = ctx.createImageData(imgData.width, imgData.height);

              // Handle different image kinds
              if (imgData.kind === 1) {
                // Grayscale
                for (let j = 0; j < imgData.data.length; j++) {
                  const gray = imgData.data[j];
                  const idx = j * 4;
                  imageData.data[idx] = gray;
                  imageData.data[idx + 1] = gray;
                  imageData.data[idx + 2] = gray;
                  imageData.data[idx + 3] = 255;
                }
              } else if (imgData.kind === 2) {
                // RGB
                for (let j = 0; j < imgData.data.length / 3; j++) {
                  const srcIdx = j * 3;
                  const dstIdx = j * 4;
                  imageData.data[dstIdx] = imgData.data[srcIdx];
                  imageData.data[dstIdx + 1] = imgData.data[srcIdx + 1];
                  imageData.data[dstIdx + 2] = imgData.data[srcIdx + 2];
                  imageData.data[dstIdx + 3] = 255;
                }
              } else {
                // RGBA or other
                imageData.data.set(imgData.data);
              }

              ctx.putImageData(imageData, 0, 0);

              images.push({
                id: `img-${pageNum}-${i}`,
                pageNumber: pageNum,
                dataUrl: canvas.toDataURL('image/png'),
                width: imgData.width,
                height: imgData.height,
                position: { x: 0, y: 0 }, // Position extraction would require more complex parsing
              });

              imageCount++;
            }
          }
        } catch {
          // Image extraction can fail for various reasons, continue with next
          continue;
        }
      }
    }
  }

  return images;
}

// Crop a region from a PDF page render
export function cropImageRegion(
  imageDataUrl: string,
  region: { x: number; y: number; width: number; height: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = region.width;
      canvas.height = region.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(
        img,
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        region.width,
        region.height
      );

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageDataUrl;
  });
}
