export type CoachHandoff = {
  type: 'weak-topic' | 'review-set' | 'import-success' | 'source-output';
  setId?: string;
  panel?: 'review' | 'manage';
  topic?: string;
  preferredTool?: 'quiz' | 'mcq' | 'flashcards' | 'summarize' | 'explain';
  sourceText?: string;
  title?: string;
};

export const COACH_HANDOFF_KEY = 'kivora_coach_handoff';
const HANDOFF_TTL_MS = 5 * 60 * 1000; // 5 minutes

type StoredHandoff = CoachHandoff & { _writtenAt: number };

export function writeCoachHandoff(payload: CoachHandoff) {
  if (typeof window === 'undefined') return;
  const stored: StoredHandoff = { ...payload, _writtenAt: Date.now() };
  window.sessionStorage.setItem(COACH_HANDOFF_KEY, JSON.stringify(stored));
}

export function readCoachHandoff(): CoachHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(COACH_HANDOFF_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredHandoff;
    if (Date.now() - stored._writtenAt > HANDOFF_TTL_MS) {
      window.sessionStorage.removeItem(COACH_HANDOFF_KEY);
      return null;
    }
    const { _writtenAt: _, ...payload } = stored;
    return payload as CoachHandoff;
  } catch {
    return null;
  }
}

export function clearCoachHandoff() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(COACH_HANDOFF_KEY);
}
