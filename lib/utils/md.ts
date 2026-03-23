/**
 * Minimal Markdown → HTML converter used across workspace view components.
 * Handles bold, italic, headings (h1-h3), bullet lists, and line breaks.
 *
 * SECURITY: HTML-escapes all input before applying markdown transforms so
 * injected tags in AI output or user text cannot cause XSS.
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function mdToHtml(md: string): string {
  return escapeHtml(md)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^(#{1,3})\s+(.+)/gm, (_, h, t) => `<h${h.length} style="margin:14px 0 6px">${t}</h${h.length}>`)
    .replace(/^[•\-]\s+(.+)/gm, '<li style="margin:3px 0">$1</li>')
    .replace(/(<li[^>]*>[\s\S]*?<\/li>)/g, '<ul style="padding-left:20px;margin:8px 0">$1</ul>')
    .replace(/\n/g, '<br/>');
}
