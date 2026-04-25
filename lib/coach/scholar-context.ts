/**
 * lib/coach/scholar-context.ts
 *
 * Shared Scholar Hub context — persists for the browser session so both
 * Workspace and Scholar Hub stay aware of what the student is studying.
 *
 * Unlike the one-shot CoachHandoff, ScholarContext is not cleared on read.
 * It stays until the student explicitly clears it or it's overwritten.
 */

const KEY        = 'kivora_scholar_context';
const EXPIRY_MS  = 24 * 60 * 60 * 1000; // 24 hours

export interface ScholarContext {
  /** Short display title (source title or research topic) */
  label:             string;
  /** Full extracted text — used to pre-fill Workspace tools */
  sourceText?:       string;
  /** URL of the source, if applicable */
  sourceUrl?:        string;
  /** Research overview text */
  researchOverview?: string;
  /** Whether this came from a source analysis or a research run */
  kind:              'source' | 'research';
  writtenAt:         number;
}

export function writeScholarContext(ctx: Omit<ScholarContext, 'writtenAt'>): void {
  try {
    const stored: ScholarContext = { ...ctx, writtenAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch { /* storage unavailable */ }
}

export function readScholarContext(): ScholarContext | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const ctx = JSON.parse(raw) as ScholarContext;
    if (Date.now() - ctx.writtenAt > EXPIRY_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return ctx;
  } catch { return null; }
}

export function clearScholarContext(): void {
  try { localStorage.removeItem(KEY); } catch {}
}
