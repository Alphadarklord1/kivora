/**
 * Per-question answer persistence for the workspace tools.
 *
 * Why: students lose work when they slip-click the sidebar mid-typing on
 * a 200-word extended response, or when an accidental navigation kills a
 * timed exam. The Quiz / MCQ / Exam views rebuild their state from the
 * AI's `content` string on every mount, but the user's typed answers and
 * timer state were React-only — gone the moment the panel unmounted.
 *
 * Shape: each tool gets its own localStorage entry keyed by a stable hash
 * of the AI-emitted content. That way switching to a different generated
 * set wipes the old answers automatically (different content = different
 * key) instead of leaking answers between sessions.
 */

export type ToolKind = 'mcq' | 'quiz' | 'exam';

interface PersistedAnswers {
  contentHash: string;
  answers: Record<number, string>;
  // Only used by ExamView. Wall-clock time when the exam was started so
  // the countdown can resume from the original deadline rather than
  // restart from minutes*60 on remount.
  startedAt?: number;
  durationSec?: number;
  phase?: 'setup' | 'exam' | 'results';
  updatedAt: number;
}

function storageKey(tool: ToolKind): string {
  return `kivora-tool-answers-${tool}`;
}

/** Tiny string hash — content-shape-fingerprint, not a security primitive. */
export function hashContent(content: string): string {
  let h = 5381;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) + h) ^ content.charCodeAt(i);
  }
  // Mix in the length so two strings with same chars but different
  // lengths still hash differently. Use unsigned conversion.
  return ((h >>> 0).toString(36)) + ':' + content.length.toString(36);
}

export function loadAnswers(tool: ToolKind, contentHash: string): PersistedAnswers | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(tool));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAnswers;
    // Different content → don't restore. Avoids leaking answers between
    // generations.
    if (parsed.contentHash !== contentHash) return null;
    // 24h freshness cap so a week-old set doesn't surprise the user.
    if (Date.now() - parsed.updatedAt > 24 * 60 * 60 * 1000) return null;
    return parsed;
  } catch { return null; }
}

export function saveAnswers(tool: ToolKind, payload: Omit<PersistedAnswers, 'updatedAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(tool), JSON.stringify({ ...payload, updatedAt: Date.now() }));
  } catch { /* quota / SSR */ }
}

export function clearAnswers(tool: ToolKind): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(storageKey(tool)); } catch { /* noop */ }
}
