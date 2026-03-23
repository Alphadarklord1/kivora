/**
 * lib/export/docx.ts
 *
 * Generates a proper .docx file (Office Open XML) from report text using JSZip.
 * Parses plain-text report into paragraphs + headings, then writes WordprocessingML XML.
 */

import JSZip from 'jszip';

// ── XML helpers ──────────────────────────────────────────────────────────────

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Section detection ────────────────────────────────────────────────────────

interface DocParagraph {
  style: 'Heading1' | 'Heading2' | 'Normal';
  text:  string;
}

/**
 * A line is treated as a heading if it:
 * - is ≤ 80 characters
 * - ends without a full stop
 * - is surrounded by blank lines OR is all-caps OR starts with a number like "1." / "1."
 */
function parseReportToParas(text: string): DocParagraph[] {
  const lines  = text.split('\n');
  const result: DocParagraph[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const trimmed = line.trim();

    if (!trimmed) continue;

    const prevBlank = i === 0 || !lines[i - 1]?.trim();
    const nextBlank = i === lines.length - 1 || !lines[i + 1]?.trim();
    const short     = trimmed.length <= 80;
    const noStop    = !trimmed.endsWith('.');
    const allCaps   = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
    const numbered  = /^\d+[\.\)]\s/.test(trimmed) && short;
    const isHeading = short && noStop && (allCaps || numbered || (prevBlank && nextBlank));

    result.push({
      style: isHeading ? (allCaps ? 'Heading1' : 'Heading2') : 'Normal',
      text: trimmed,
    });
  }

  return result;
}

// ── OOXML XML fragments ───────────────────────────────────────────────────────

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="160"/></w:pPr>
    <w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:spacing w:before="480" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/><w:color w:val="1E3A5F"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:spacing w:before="320" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="2D5986"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="48"/><w:szCs w:val="48"/><w:color w:val="111827"/></w:rPr>
  </w:style>
</w:styles>`;

function buildDocumentXml(title: string, paras: DocParagraph[], references: string[]): string {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  const paraXml = paras.map(p => `
  <w:p>
    <w:pPr><w:pStyle w:val="${p.style}"/></w:pPr>
    <w:r><w:t xml:space="preserve">${esc(p.text)}</w:t></w:r>
  </w:p>`).join('');

  const refsXml = references.length === 0 ? '' : `
  <w:p>
    <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
    <w:r><w:t>REFERENCES</w:t></w:r>
  </w:p>
  ${references.map((ref, i) => `
  <w:p>
    <w:pPr><w:pStyle w:val="Normal"/></w:pPr>
    <w:r><w:t xml:space="preserve">[${i + 1}] ${esc(ref)}</w:t></w:r>
  </w:p>`).join('')}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}">
  <w:body>
  <w:p>
    <w:pPr><w:pStyle w:val="Title"/></w:pPr>
    <w:r><w:t>${esc(title)}</w:t></w:r>
  </w:p>
  ${paraXml}
  ${refsXml}
  <w:sectPr>
    <w:pgSz w:w="12240" w:h="15840"/>
    <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
  </w:sectPr>
  </w:body>
</w:document>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface DocxOptions {
  title:      string;
  content:    string;
  references?: string[];
}

export async function generateDocx({ title, content, references = [] }: DocxOptions): Promise<Blob> {
  const paras = parseReportToParas(content);
  const docXml = buildDocumentXml(title, paras, references);

  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', RELS);
  zip.file('word/document.xml', docXml);
  zip.file('word/styles.xml', STYLES);
  zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS);

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return blob;
}
