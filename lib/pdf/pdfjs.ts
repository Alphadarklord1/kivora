type PdfJsModule = {
  getDocument: (params: { data: ArrayBuffer }) => { promise: Promise<unknown> };
  GlobalWorkerOptions: { workerSrc: string };
};

let pdfJsPromise: Promise<PdfJsModule> | null = null;

export async function getPdfJs(): Promise<PdfJsModule> {
  if (typeof window === 'undefined') {
    throw new Error('PDF.js is only available in the browser runtime');
  }

  if (!pdfJsPromise) {
    pdfJsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
      }
      return pdfjs as unknown as PdfJsModule;
    })();
  }

  return pdfJsPromise;
}
