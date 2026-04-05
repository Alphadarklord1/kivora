/**
 * lib/export/pdf.ts
 *
 * Client-side PDF export via browser print API.
 * Opens a styled print window and triggers window.print() — the user
 * can choose "Save as PDF" from the system print dialog.
 */

export interface PdfExportOptions {
  title: string;
  content: string;
  references?: string[];
  /** Optional subtitle shown below the title */
  subtitle?: string;
  /** Author/date shown in the header */
  meta?: string;
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Converts plain text to HTML paragraphs.
 * Lines that look like headings (short, no period, surrounded by blanks or numbered)
 * become <h2> elements; all others become <p>.
 */
function textToHtml(text: string): string {
  const lines = text.split('\n');
  const parts: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) continue;

    const prev = lines[i - 1]?.trim() ?? '';
    const next = lines[i + 1]?.trim() ?? '';
    const surroundedByBlanks = !prev && !next;
    const numbered = /^(\d+\.|[IVX]+\.|[A-Z]\.)\s/.test(trimmed);
    const allCaps = trimmed === trimmed.toUpperCase() && trimmed.length >= 3;
    const short = trimmed.length <= 80 && !trimmed.endsWith('.');

    const isHeading = short && (surroundedByBlanks || numbered || allCaps);

    if (isHeading && trimmed.split(' ').length >= 2) {
      parts.push(`<h2>${esc(trimmed)}</h2>`);
    } else {
      parts.push(`<p>${esc(trimmed)}</p>`);
    }
  }

  return parts.join('\n');
}

export async function generatePdf(options: PdfExportOptions): Promise<void> {
  const { title, content, references, subtitle, meta } = options;

  const bodyHtml = textToHtml(content);

  const refsHtml = references && references.length > 0
    ? `<div class="references">
         <h2>References</h2>
         <ol>${references.map(r => `<li>${esc(r)}</li>`).join('')}</ol>
       </div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.7;
      color: #1a1a1a;
      background: #fff;
      padding: 0;
    }

    .page {
      max-width: 700px;
      margin: 0 auto;
      padding: 48px 56px;
    }

    .doc-header {
      border-bottom: 2px solid #1a1a1a;
      padding-bottom: 18px;
      margin-bottom: 32px;
    }

    .doc-title {
      font-size: 22pt;
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: -0.01em;
      margin-bottom: 6px;
    }

    .doc-subtitle {
      font-size: 13pt;
      color: #444;
      margin-bottom: 10px;
      font-style: italic;
    }

    .doc-meta {
      font-size: 9pt;
      color: #666;
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    }

    .doc-body h2 {
      font-size: 13pt;
      font-weight: 700;
      margin: 28px 0 10px;
      color: #111;
      letter-spacing: -0.01em;
    }

    .doc-body p {
      margin-bottom: 14px;
      text-align: justify;
      hyphens: auto;
    }

    .references {
      margin-top: 36px;
      padding-top: 18px;
      border-top: 1px solid #ccc;
    }

    .references h2 {
      font-size: 12pt;
      font-weight: 700;
      margin-bottom: 10px;
      color: #111;
    }

    .references ol {
      padding-left: 20px;
    }

    .references li {
      font-size: 10pt;
      margin-bottom: 6px;
      color: #333;
      line-height: 1.5;
    }

    @page {
      margin: 2.4cm 2.2cm;
      size: A4;
    }

    @media print {
      body { padding: 0; }
      .page { max-width: 100%; padding: 0; }
      h2 { page-break-after: avoid; }
      p { orphans: 3; widows: 3; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="doc-header">
      <div class="doc-title">${esc(title)}</div>
      ${subtitle ? `<div class="doc-subtitle">${esc(subtitle)}</div>` : ''}
      <div class="doc-meta">${esc(meta ?? new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))}</div>
    </div>
    <div class="doc-body">
      ${bodyHtml}
      ${refsHtml}
    </div>
  </div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 250);
    });
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'width=850,height=1100');
  if (!win) {
    // Fallback: download the HTML file if popups are blocked
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.slice(0, 60).replace(/[^a-zA-Z0-9\s]/g, '').trim()}.html`;
    a.click();
  }
  // Clean up blob URL after a delay
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
