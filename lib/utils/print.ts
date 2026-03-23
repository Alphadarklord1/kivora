/**
 * printContent — opens a hidden iframe, renders a clean print document,
 * calls window.print(), then removes the iframe after 2 seconds.
 */
export function printContent(title: string, content: string): void {
  if (typeof window === 'undefined') return;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  const escaped = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escaped(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.7;
      color: #111;
      background: #fff;
      padding: 0;
    }
    h1 {
      font-size: 18pt;
      font-weight: 700;
      margin-bottom: 12pt;
      padding-bottom: 6pt;
      border-bottom: 2px solid #222;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }
    pre {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10pt;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.6;
    }
    .content {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 11pt;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.75;
      margin-bottom: 24pt;
    }
    .kivora-footer {
      margin-top: 24pt;
      padding-top: 8pt;
      border-top: 1px solid #ccc;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 9pt;
      color: #888;
      text-align: center;
    }
    @media print {
      @page { margin: 18mm 20mm; }
      body { padding: 0; }
      h1 { page-break-after: avoid; }
      .content { page-break-inside: auto; }
      .kivora-footer { page-break-before: avoid; }
    }
  </style>
</head>
<body>
  <h1>${escaped(title)}</h1>
  <div class="content">${escaped(content)}</div>
  <div class="kivora-footer">Exported from Kivora &mdash; ${new Date().toLocaleDateString()}</div>
</body>
</html>`);
  doc.close();

  // Wait for iframe to render, then print
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // ignore — some browsers block programmatic print in sandboxed iframes
    }
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* already removed */ }
    }, 2000);
  }, 250);
}

/**
 * printMultiple — prints several items as one document, each separated by
 * a horizontal rule with its title.
 */
export function printMultiple(items: { title: string; content: string }[]): void {
  if (typeof window === 'undefined' || items.length === 0) return;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  const escaped = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const sections = items
    .map(
      (item, i) => `
  <div class="item${i > 0 ? ' page-break' : ''}">
    <h2>${escaped(item.title)}</h2>
    <div class="content">${escaped(item.content)}</div>
  </div>
  ${i < items.length - 1 ? '<hr />' : ''}`,
    )
    .join('\n');

  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Kivora Library Export (${items.length} items)</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.7;
      color: #111;
      background: #fff;
    }
    h1.doc-title {
      font-size: 20pt;
      font-weight: 700;
      margin-bottom: 16pt;
      padding-bottom: 8pt;
      border-bottom: 3px solid #111;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }
    h2 {
      font-size: 14pt;
      font-weight: 700;
      margin-bottom: 8pt;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }
    .content {
      font-size: 11pt;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.75;
    }
    hr {
      border: none;
      border-top: 1px solid #ccc;
      margin: 20pt 0;
    }
    .page-break { page-break-before: auto; }
    .kivora-footer {
      margin-top: 24pt;
      padding-top: 8pt;
      border-top: 1px solid #ccc;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 9pt;
      color: #888;
      text-align: center;
    }
    @media print {
      @page { margin: 18mm 20mm; }
      body { padding: 0; }
      h2 { page-break-after: avoid; }
      .content { page-break-inside: auto; }
      .kivora-footer { page-break-before: avoid; }
    }
  </style>
</head>
<body>
  <h1 class="doc-title">Kivora Library &mdash; ${items.length} Items</h1>
  ${sections}
  <div class="kivora-footer">Exported from Kivora &mdash; ${new Date().toLocaleDateString()}</div>
</body>
</html>`);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch { /* ignore */ }
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* already removed */ }
    }, 2000);
  }, 250);
}
