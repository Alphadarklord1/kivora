/**
 * lib/coach/scholar-context.ts
 *
 * Shared Scholar Hub context — persists for the browser session so both
 * Workspace and Scholar Hub stay aware of what the student is studying.
 *
 * Unlike the one-shot CoachHandoff, ScholarContext is not cleared on read.
 * It stays until the student explicitly clears it or it's overwritten.
 */

const KEY = 'kivora_scholar_context';

export interface ScholarContext {
  /** Short display title (source title or research topic) */
  label:           string;
  /** Full extracted text — used to pre-fill Workspace tools */
  sourceText?:     string;
  /** URL of the source, if applicable */
  sourceUrl?:      string;
  /** Research overview text */
  researchOverview?: string;
  /** Whether this came from a source analysis or a research run */
  kind:            'source' | 'research';
  writtenAt:       number;
}

export function writeScholarContext(ctx: Omit<ScholarContext, 'writtenAt'>): void {
  try {
    const stored: ScholarContext = { ...ctx, writtenAt: Date.now() };
    sessionStorage.setItem(KEY, JSON.stringify(stored));
  } catch { /* storage unavailable */ }
}

export function readScholarContext(): ScholarContext | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ScholarContext;
  } catch { return null; }
}

export function clearScholarContext(): void {
  try { sessionStorage.removeItem(KEY); } catch {}
}
