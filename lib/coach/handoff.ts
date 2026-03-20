export type CoachHandoff = {
  type: 'weak-topic' | 'review-set' | 'import-success';
  setId?: string;
  topic?: string;
  preferredTool?: 'quiz' | 'mcq' | 'flashcards' | 'summarize' | 'explain';
};

export const COACH_HANDOFF_KEY = 'kivora_coach_handoff';

export function writeCoachHandoff(payload: CoachHandoff) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(COACH_HANDOFF_KEY, JSON.stringify(payload));
}

export function readCoachHandoff(): CoachHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(COACH_HANDOFF_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CoachHandoff;
  } catch {
    return null;
  }
}

export function clearCoachHandoff() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(COACH_HANDOFF_KEY);
}
