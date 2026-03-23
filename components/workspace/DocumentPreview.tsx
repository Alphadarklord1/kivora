'use client';

import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────

interface SlideData {
  index: number;
  title: string | null;
  paragraphs: string[];
}

interface DocumentPreviewProps {
  blob: Blob;
  fileName: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function isDocx(name: string): boolean {
  return getExt(name) === 'docx';
}

function isPptx(name: string): boolean {
  return getExt(name) === 'pptx';
}

/** Decode basic XML entities */
function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Extract text runs from an XML string.
 * Returns an array of SlideData objects, one per `<p:sp>` shape or
 * per paragraph block.
 */
function parsePptxSlideXml(xml: string, slideIndex: number): SlideData {
  // We use a lightweight regex-based parser to avoid DOM/JSDOM dependency.
  const paragraphs: string[] = [];
  let title: string | null = null;

  // Detect title placeholder (ph type="title" or ph type="ctrTitle")
  // We walk through each shape (<p:sp>)
  const spRegex = /<p:sp[\s\S]*?<\/p:sp>/g;
  let spMatch: RegExpExecArray | null;

  while ((spMatch = spRegex.exec(xml)) !== null) {
    const shape = spMatch[0];

    // Check if this shape is a title placeholder
    const isTitleShape =
      /<p:ph\s[^>]*type=["'](title|ctrTitle)["']/.test(shape) ||
      /<p:ph\s[^>]*type=["']title["']/.test(shape);

    // Extract all text runs within this shape
    const shapeText: string[] = [];
    const paraRegex = /<a:p>([\s\S]*?)<\/a:p>/g;
    let paraMatch: RegExpExecArray | null;

    while ((paraMatch = paraRegex.exec(shape)) !== null) {
      const paraXml = paraMatch[1];
      const runs: string[] = [];
      const tRegex = /<a:t>([\s\S]*?)<\/a:t>/g;
      let tMatch: RegExpExecArray | null;

      while ((tMatch = tRegex.exec(paraXml)) !== null) {
        const text = decodeEntities(tMatch[1]);
        if (text.trim()) runs.push(text);
      }

      const line = runs.join('').trim();
      if (line) shapeText.push(line);
    }

    const combined = shapeText.join('\n').trim();
    if (!combined) continue;

    if (isTitleShape && title === null) {
      title = combined;
    } else {
      // Each non-empty shape contributes its lines as separate paragraphs
      for (const line of shapeText) {
        if (line.trim()) paragraphs.push(line.trim());
      }
    }
  }

  return { index: slideIndex, title, paragraphs };
}

// ── Sub-components ────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="dp-spinner-wrap">
      <div className="dp-spinner" />
      <span className="dp-spinner-label">Loading preview…</span>
      <style jsx>{`
        .dp-spinner-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 60px 20px;
          color: var(--text-3);
          font-size: var(--text-sm);
        }
        .dp-spinner {
          width: 28px;
          height: 28px;
          border: 3px solid var(--border-2);
          border-top-color: var(--accent, #6366f1);
          border-radius: 50%;
          animation: dp-spin 0.75s linear infinite;
        }
        @keyframes dp-spin {
          to { transform: rotate(360deg); }
        }
        .dp-spinner-label {
          color: var(--text-3);
        }
      `}</style>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="dp-error">
      <span className="dp-error-icon">⚠️</span>
      <p className="dp-error-msg">{message}</p>
      <style jsx>{`
        .dp-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 60px 24px;
          text-align: center;
        }
        .dp-error-icon {
          font-size: 36px;
        }
        .dp-error-msg {
          color: var(--danger, #ef4444);
          font-size: var(--text-sm);
          max-width: 320px;
          margin: 0;
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}

function UnsupportedState({ fileName }: { fileName: string }) {
  return (
    <div className="dp-unsupported">
      <span className="dp-unsupported-icon">📄</span>
      <p className="dp-unsupported-title">Preview not available</p>
      <p className="dp-unsupported-name">{fileName}</p>
      <p className="dp-unsupported-hint">
        This file type does not support visual preview. Use the text extraction
        view or download the file to view it.
      </p>
      <style jsx>{`
        .dp-unsupported {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 60px 24px;
          text-align: center;
        }
        .dp-unsupported-icon {
          font-size: 48px;
          margin-bottom: 4px;
        }
        .dp-unsupported-title {
          font-size: var(--text-base);
          font-weight: 600;
          color: var(--text);
          margin: 0;
        }
        .dp-unsupported-name {
          font-size: var(--text-sm);
          color: var(--text-2);
          margin: 0;
          font-family: monospace;
        }
        .dp-unsupported-hint {
          font-size: var(--text-xs);
          color: var(--text-3);
          max-width: 300px;
          margin: 4px 0 0;
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}

// ── Word Document Preview ─────────────────────────────────────────────────

function DocxPreview({ html, fileName }: { html: string; fileName: string }) {
  return (
    <div className="dp-docx-wrap">
      <div className="dp-docx-header">
        <span className="dp-docx-icon">📘</span>
        <span className="dp-docx-name">{fileName}</span>
        <span className="dp-docx-label">Word Document</span>
      </div>
      <div className="dp-docx-page">
        <div
          className="dp-docx-body"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      <style jsx>{`
        .dp-docx-wrap {
          display: flex;
          flex-direction: column;
          min-height: 100%;
        }
        .dp-docx-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .dp-docx-icon {
          font-size: 18px;
          flex-shrink: 0;
        }
        .dp-docx-name {
          flex: 1;
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }
        .dp-docx-label {
          font-size: var(--text-xs);
          color: var(--text-3);
          background: var(--surface-2);
          border: 1px solid var(--border-2);
          border-radius: var(--radius-sm, 4px);
          padding: 2px 7px;
          flex-shrink: 0;
        }
        .dp-docx-page {
          max-width: 820px;
          margin: 24px auto;
          width: 100%;
          padding: 0 16px;
        }
        .dp-docx-body :global(h1) {
          font-size: var(--text-2xl, 1.5rem);
          font-weight: 700;
          color: var(--text);
          margin: 1.4em 0 0.5em;
          line-height: 1.3;
          border-bottom: 2px solid var(--border);
          padding-bottom: 0.25em;
        }
        .dp-docx-body :global(h2) {
          font-size: var(--text-xl, 1.25rem);
          font-weight: 600;
          color: var(--text);
          margin: 1.2em 0 0.4em;
          line-height: 1.35;
        }
        .dp-docx-body :global(h3) {
          font-size: var(--text-lg, 1.125rem);
          font-weight: 600;
          color: var(--text);
          margin: 1em 0 0.35em;
        }
        .dp-docx-body :global(h4),
        .dp-docx-body :global(h5),
        .dp-docx-body :global(h6) {
          font-size: var(--text-base, 1rem);
          font-weight: 600;
          color: var(--text-2);
          margin: 0.9em 0 0.3em;
        }
        .dp-docx-body :global(p) {
          font-size: var(--text-sm, 0.875rem);
          color: var(--text);
          line-height: 1.8;
          margin: 0 0 0.75em;
        }
        .dp-docx-body :global(strong),
        .dp-docx-body :global(b) {
          font-weight: 700;
          color: var(--text);
        }
        .dp-docx-body :global(em),
        .dp-docx-body :global(i) {
          font-style: italic;
          color: var(--text-2);
        }
        .dp-docx-body :global(ul),
        .dp-docx-body :global(ol) {
          padding-left: 1.6em;
          margin: 0.5em 0 0.75em;
        }
        .dp-docx-body :global(li) {
          font-size: var(--text-sm, 0.875rem);
          color: var(--text);
          line-height: 1.7;
          margin-bottom: 0.2em;
        }
        .dp-docx-body :global(table) {
          width: 100%;
          border-collapse: collapse;
          margin: 1em 0;
          font-size: var(--text-sm, 0.875rem);
          overflow-x: auto;
          display: block;
        }
        .dp-docx-body :global(th) {
          background: var(--surface-2);
          color: var(--text);
          font-weight: 600;
          padding: 8px 12px;
          border: 1px solid var(--border);
          text-align: left;
        }
        .dp-docx-body :global(td) {
          padding: 7px 12px;
          border: 1px solid var(--border);
          color: var(--text);
          vertical-align: top;
        }
        .dp-docx-body :global(tr:nth-child(even) td) {
          background: var(--surface);
        }
        .dp-docx-body :global(a) {
          color: var(--accent, #6366f1);
          text-decoration: underline;
        }
        .dp-docx-body :global(blockquote) {
          border-left: 3px solid var(--accent, #6366f1);
          margin: 1em 0;
          padding: 0.5em 1em;
          background: var(--surface);
          color: var(--text-2);
          border-radius: 0 var(--radius-sm, 4px) var(--radius-sm, 4px) 0;
        }
        .dp-docx-body :global(pre),
        .dp-docx-body :global(code) {
          font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
          font-size: 0.85em;
          background: var(--surface-2);
          border-radius: var(--radius-sm, 4px);
          padding: 0.15em 0.4em;
          color: var(--text);
        }
        .dp-docx-body :global(pre) {
          padding: 1em;
          overflow-x: auto;
          white-space: pre;
        }
        .dp-docx-body :global(hr) {
          border: none;
          border-top: 1px solid var(--border);
          margin: 1.5em 0;
        }
      `}</style>
    </div>
  );
}

// ── PowerPoint Slide Preview ──────────────────────────────────────────────

function SlideCard({ slide }: { slide: SlideData }) {
  return (
    <div className="dp-slide-card">
      <div className="dp-slide-num">Slide {slide.index + 1}</div>
      {slide.title && <h3 className="dp-slide-title">{slide.title}</h3>}
      {slide.paragraphs.length > 0 && (
        <ul className="dp-slide-body">
          {slide.paragraphs.map((para, i) => (
            <li key={i} className="dp-slide-para">
              {para}
            </li>
          ))}
        </ul>
      )}
      {!slide.title && slide.paragraphs.length === 0 && (
        <p className="dp-slide-empty">No text content</p>
      )}

      <style jsx>{`
        .dp-slide-card {
          background: var(--bg, #fff);
          border: 1px solid var(--border);
          border-radius: var(--radius, 8px);
          padding: 20px 24px;
          position: relative;
          min-height: 120px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
          transition: box-shadow 0.15s;
        }
        .dp-slide-card:hover {
          box-shadow: 0 3px 12px rgba(0, 0, 0, 0.1);
        }
        .dp-slide-num {
          position: absolute;
          top: 10px;
          right: 12px;
          font-size: var(--text-xs, 0.75rem);
          font-weight: 700;
          color: var(--text-3);
          background: var(--surface-2);
          border: 1px solid var(--border-2);
          border-radius: 20px;
          padding: 2px 9px;
        }
        .dp-slide-title {
          font-size: var(--text-base, 1rem);
          font-weight: 700;
          color: var(--text);
          margin: 0 0 10px;
          padding-right: 70px;
          line-height: 1.4;
        }
        .dp-slide-body {
          margin: 0;
          padding: 0 0 0 18px;
          list-style: disc;
        }
        .dp-slide-para {
          font-size: var(--text-sm, 0.875rem);
          color: var(--text-2);
          line-height: 1.7;
          margin-bottom: 4px;
        }
        .dp-slide-empty {
          font-size: var(--text-xs, 0.75rem);
          color: var(--text-3);
          margin: 0;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}

function PptxPreview({
  slides,
  fileName,
}: {
  slides: SlideData[];
  fileName: string;
}) {
  return (
    <div className="dp-pptx-wrap">
      <div className="dp-pptx-header">
        <span className="dp-pptx-icon">📙</span>
        <span className="dp-pptx-name">{fileName}</span>
        <span className="dp-pptx-label">PowerPoint · {slides.length} slides</span>
      </div>

      <div className="dp-pptx-grid">
        {slides.map((slide) => (
          <SlideCard key={slide.index} slide={slide} />
        ))}
        {slides.length === 0 && (
          <p className="dp-pptx-empty">No slides found in this presentation.</p>
        )}
      </div>

      <style jsx>{`
        .dp-pptx-wrap {
          display: flex;
          flex-direction: column;
          min-height: 100%;
        }
        .dp-pptx-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .dp-pptx-icon {
          font-size: 18px;
          flex-shrink: 0;
        }
        .dp-pptx-name {
          flex: 1;
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }
        .dp-pptx-label {
          font-size: var(--text-xs);
          color: var(--text-3);
          background: var(--surface-2);
          border: 1px solid var(--border-2);
          border-radius: var(--radius-sm, 4px);
          padding: 2px 7px;
          flex-shrink: 0;
        }
        .dp-pptx-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 14px;
          padding: 20px 18px 32px;
        }
        .dp-pptx-empty {
          grid-column: 1 / -1;
          text-align: center;
          color: var(--text-3);
          font-size: var(--text-sm);
          padding: 40px;
        }
      `}</style>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function DocumentPreview({ blob, fileName }: DocumentPreviewProps) {
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [pptxSlides, setPptxSlides] = useState<SlideData[] | null>(null);

  const ext = getExt(fileName);
  const supported = isDocx(fileName) || isPptx(fileName);

  useEffect(() => {
    if (!supported) {
      setStatus('done');
      return;
    }

    let cancelled = false;

    async function run() {
      setStatus('loading');
      setError(null);
      setDocxHtml(null);
      setPptxSlides(null);

      try {
        if (isDocx(fileName)) {
          const mammoth = await import('mammoth');
          const arrayBuffer = await blob.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          if (!cancelled) {
            setDocxHtml(result.value || '<p><em>No content extracted.</em></p>');
            setStatus('done');
          }
        } else if (isPptx(fileName)) {
          const JSZip = (await import('jszip')).default;
          const arrayBuffer = await blob.arrayBuffer();
          const zip = await JSZip.loadAsync(arrayBuffer);

          const slideNames = Object.keys(zip.files)
            .filter((n) => /ppt\/slides\/slide\d+\.xml$/.test(n))
            .sort((a, b) => {
              const na = parseInt(a.match(/(\d+)/)?.[1] ?? '0', 10);
              const nb = parseInt(b.match(/(\d+)/)?.[1] ?? '0', 10);
              return na - nb;
            });

          const slides: SlideData[] = [];
          for (let i = 0; i < slideNames.length; i++) {
            const xml = await zip.files[slideNames[i]].async('text');
            slides.push(parsePptxSlideXml(xml, i));
          }

          if (!cancelled) {
            setPptxSlides(slides);
            setStatus('done');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : `Failed to preview ${ext.toUpperCase()} file.`,
          );
          setStatus('error');
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob, fileName]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (!supported) {
    return <UnsupportedState fileName={fileName} />;
  }

  if (status === 'loading') {
    return <Spinner />;
  }

  if (status === 'error') {
    return <ErrorState message={error ?? 'An unknown error occurred.'} />;
  }

  if (docxHtml !== null) {
    return <DocxPreview html={docxHtml} fileName={fileName} />;
  }

  if (pptxSlides !== null) {
    return <PptxPreview slides={pptxSlides} fileName={fileName} />;
  }

  return <UnsupportedState fileName={fileName} />;
}
