/**
 * FSRS-4.5 Spaced Repetition Algorithm
 * Replaces SM-2. Grades: 0=Again, 1=Hard, 2=Good, 3=Easy
 * Internally maps to FSRS grades 1-4.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SRSCard {
  id: string;
  front: string;
  back: string;
  category?: string;
  difficulty?: string;
  // Scheduling
  repetitions: number;
  easeFactor: number;      // kept for backwards compat (unused by FSRS path)
  interval: number;        // days until next review
  nextReview: string;      // YYYY-MM-DD
  lastReview?: string;     // YYYY-MM-DD
  totalReviews: number;
  correctReviews: number;
  // FSRS fields (optional for migration)
  stability?: number;      // FSRS stability S
  fsrsDifficulty?: number; // FSRS difficulty D
  // Image support
  frontImageKey?: string;  // IDB key for front face image
  backImageKey?: string;   // IDB key for back face image
}

export interface SRSDeck {
  id: string;
  name: string;
  description?: string;
  sourceType?: 'quizlet' | 'kivora-share' | 'public-library' | 'manual' | 'generated' | 'workspace' | 'csv' | 'paste' | 'anki';
  sourceLabel?: string;
  creatorName?: string;
  cards: SRSCard[];
  createdAt: string;
  lastStudied?: string;
}

export interface SRSReviewEvent {
  id: string;
  deckId: string;
  cardId: string;
  grade: 0 | 1 | 2 | 3;
  correct: boolean;
  reviewedAt: string;
  nextReview: string;
  interval: number;
  elapsedDays: number;
  stability?: number;
  difficulty?: number;
}

export interface SRSGoalPreferences {
  dailyGoal: number;
}

// ── FSRS-4.5 core ────────────────────────────────────────────────────────────

/** Default calibrated weight parameters from FSRS-4.5 */
const W = [
  0.4072, 1.1829, 3.1262, 15.4722, // w0-w3: init stability per grade
  7.2102, 0.5316,                   // w4-w5: init difficulty
  1.0651, 0.0589,                   // w6-w7: difficulty update
  1.5330, 0.1544, 1.0050,           // w8-w10: recall stability
  1.9395, 0.1100, 0.2900, 2.2700,   // w11-w14: forget stability
  0.0200, 2.9898,                   // w15-w16: hard/easy modifier
  0.5100, 0.3480,                   // w17-w18 (unused in 4.5 but reserved)
];

const TARGET_RETENTION = 0.9;
const DECAY             = -0.5;
const FACTOR            = Math.pow(0.9, 1 / DECAY) - 1; // ≈ 0.2346

function clamp(x: number, lo: number, hi: number) { return Math.min(Math.max(x, lo), hi); }

/** P(recall) after `elapsed` days given stability `s` */
function retrievability(elapsed: number, s: number): number {
  return Math.pow(1 + FACTOR * elapsed / s, DECAY);
}

/** Days until P(recall) == TARGET_RETENTION */
function intervalFromStability(s: number): number {
  return Math.max(1, Math.round(s / FACTOR * (Math.pow(TARGET_RETENTION, 1 / DECAY) - 1)));
}

function initStability(g: 1 | 2 | 3 | 4): number {
  return Math.max(0.1, W[g - 1]);
}

function initDifficulty(g: 1 | 2 | 3 | 4): number {
  return clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);
}

function nextDifficulty(d: number, g: 1 | 2 | 3 | 4): number {
  const target = initDifficulty(4);
  const d2     = d - W[6] * (g - 3);
  return clamp(W[7] * target + (1 - W[7]) * d2, 1, 10);
}

function nextRecallStability(d: number, s: number, r: number, g: 1 | 2 | 3 | 4): number {
  const hard  = g === 2 ? W[15] : 1;
  const easy  = g === 4 ? W[16] : 1;
  return s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hard * easy + 1);
}

function nextForgetStability(d: number, s: number, r: number): number {
  return W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]);
}

// ── Public card factory ───────────────────────────────────────────────────────

export function createCard(id: string, front: string, back: string, category?: string): SRSCard {
  return {
    id, front, back, category,
    repetitions: 0,
    easeFactor:  2.5,
    interval:    1,
    nextReview:  new Date().toISOString().split('T')[0],
    totalReviews:   0,
    correctReviews: 0,
  };
}

// ── Grade a card (FSRS-4.5) ───────────────────────────────────────────────────

export function gradeCard(card: SRSCard, grade: 0 | 1 | 2 | 3): SRSCard {
  const today    = new Date().toISOString().split('T')[0];
  const g        = (grade + 1) as 1 | 2 | 3 | 4; // our 0-3 → FSRS 1-4
  const correct  = grade >= 2;

  const updated: SRSCard = {
    ...card,
    lastReview:     today,
    totalReviews:   card.totalReviews + 1,
    correctReviews: correct ? card.correctReviews + 1 : card.correctReviews,
  };

  if (!card.stability) {
    // ── First review: initialise FSRS state ──────────────────────────────────
    updated.stability      = initStability(g);
    updated.fsrsDifficulty = initDifficulty(g);

    if (g === 1) {
      // Again on first review — show again tomorrow
      updated.repetitions = 0;
      updated.interval    = 1;
    } else {
      updated.repetitions = 1;
      updated.interval    = intervalFromStability(updated.stability);
    }
  } else {
    // ── Subsequent reviews ────────────────────────────────────────────────────
    const elapsedDays = card.lastReview
      ? Math.max(0, (Date.parse(today) - Date.parse(card.lastReview)) / 86_400_000)
      : card.interval;

    const r = retrievability(elapsedDays, card.stability);
    const d = card.fsrsDifficulty ?? initDifficulty(g);

    updated.fsrsDifficulty = nextDifficulty(d, g);

    if (g === 1) {
      // Forgot: reset using forget stability
      updated.stability   = nextForgetStability(d, card.stability, r);
      updated.repetitions = 0;
    } else {
      updated.stability   = nextRecallStability(d, card.stability, r, g);
      updated.repetitions = card.repetitions + 1;
    }
    updated.interval = intervalFromStability(updated.stability);
  }

  const next = new Date();
  next.setDate(next.getDate() + updated.interval);
  updated.nextReview = next.toISOString().split('T')[0];

  return updated;
}

// ── Deck stats ────────────────────────────────────────────────────────────────

export function getDueCards(deck: SRSDeck): SRSCard[] {
  const today = new Date().toISOString().split('T')[0];
  return deck.cards.filter(c => c.nextReview <= today);
}

export function getDeckStats(deck: SRSDeck) {
  const today   = new Date().toISOString().split('T')[0];
  const due     = deck.cards.filter(c => c.nextReview <= today).length;
  const newC    = deck.cards.filter(c => c.repetitions === 0).length;
  const learning = deck.cards.filter(c => c.repetitions > 0 && c.interval < 21).length;
  const mature  = deck.cards.filter(c => c.interval >= 21).length;
  const total   = deck.cards.reduce((sum, c) => sum + c.totalReviews, 0);
  const correct = deck.cards.reduce((sum, c) => sum + c.correctReviews, 0);
  const accuracy = total === 0 ? 0 : (correct / total) * 100;
  return { due, new: newC, learning, mature, total: deck.cards.length, accuracy };
}

/** Workload forecast: how many cards are due each day for the next N days */
export function getWorkloadForecast(deck: SRSDeck, days = 14): number[] {
  const today  = new Date();
  const result = Array(days).fill(0) as number[];
  for (const card of deck.cards) {
    const dueDate = new Date(card.nextReview);
    const diff    = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);
    if (diff >= 0 && diff < days) result[diff]++;
  }
  return result;
}

export function getCardRetrievability(card: SRSCard, onDate = new Date()): number | null {
  if (!card.stability || !card.lastReview) return null;
  const elapsedDays = Math.max(0, Math.round((onDate.getTime() - new Date(card.lastReview).getTime()) / 86_400_000));
  return retrievability(elapsedDays, card.stability);
}

export function getDeckRetentionSummary(deck: SRSDeck) {
  const retrievabilities = deck.cards
    .map((card) => getCardRetrievability(card))
    .filter((value): value is number => value !== null);
  const averageRetrievability = retrievabilities.length > 0
    ? retrievabilities.reduce((sum, value) => sum + value, 0) / retrievabilities.length
    : null;
  const overdueCards = getDueCards(deck).length;
  const weekForecast = getWorkloadForecast(deck, 7);
  const imageCards = deck.cards.filter((card) => card.frontImageKey || card.backImageKey).length;
  const averageStability = deck.cards
    .map((card) => card.stability)
    .filter((value): value is number => typeof value === 'number')
    .reduce((sum, value, _, arr) => sum + value / arr.length, 0);

  return {
    averageRetrievability,
    overdueCards,
    weekForecast,
    imageCards,
    averageStability: Number.isFinite(averageStability) ? averageStability : null,
  };
}

// ── Study session helpers (localStorage) ─────────────────────────────────────

export interface StudySession { date: string; cards: number }
const SESSIONS_KEY = 'kivora-study-sessions';
const REVIEW_HISTORY_KEY = 'kivora-srs-review-history';
const GOAL_KEY = 'kivora-daily-goal';

export function loadSessions(): StudySession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function recordSession(cardsReviewed: number): void {
  if (typeof window === 'undefined' || cardsReviewed === 0) return;
  try {
    const today    = new Date().toISOString().split('T')[0];
    const sessions = loadSessions();
    const existing = sessions.find(s => s.date === today);
    const isNewDay = !existing;
    if (existing) { existing.cards += cardsReviewed; }
    else { sessions.push({ date: today, cards: cardsReviewed }); }
    // Keep last 365 days
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 365);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.filter(s => s.date >= cutoffStr)));
    // First study activity of a new calendar day → reward the streak
    // bonus and bump the streak counter so streak_3 / streak_7 / streak_30
    // achievements can finally trigger. Guarded so it fires once per day.
    if (isNewDay) {
      try {
        // Async-import to keep sm2 free of a hard dependency on the
        // gamification module (and avoid any circular-import surprises).
        void import('@/lib/gamification').then(g => {
          g.addXp(g.XP_VALUES.streakDay, 'srs:newDay');
          // The 'streak' counter mirrors the day-level streak length so
          // achievements can trigger on consecutive-day milestones.
          const streakLen = getStreak();
          const counters = g.getCounters();
          counters.streak = streakLen;
          // Persist updated counter then check for unlocks.
          localStorage.setItem('kivora-gamification-counters', JSON.stringify(counters));
          g.checkAndUnlockAchievements(counters);
        }).catch(() => {});
      } catch { /* noop */ }
    }
  } catch { /* noop */ }
}

export function getStreak(): number {
  const sessions = loadSessions();
  if (sessions.length === 0) return 0;
  const sessionDates = new Set(sessions.filter(s => s.cards > 0).map(s => s.date));
  let streak = 0;
  const d = new Date();
  // Count backwards from today (or yesterday if today not yet studied)
  const todayStr = d.toISOString().split('T')[0];
  if (!sessionDates.has(todayStr)) { d.setDate(d.getDate() - 1); }
  while (true) {
    const ds = d.toISOString().split('T')[0];
    if (!sessionDates.has(ds)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function loadReviewHistory(deckId?: string): SRSReviewEvent[] {
  try {
    const raw = localStorage.getItem(REVIEW_HISTORY_KEY);
    const events = raw ? JSON.parse(raw) as SRSReviewEvent[] : [];
    return deckId ? events.filter((event) => event.deckId === deckId) : events;
  } catch { return []; }
}

export function recordReviewHistory(event: SRSReviewEvent): void {
  if (typeof window === 'undefined') return;
  try {
    const events = loadReviewHistory();
    const nextEvents = [event, ...events].slice(0, 1000);
    localStorage.setItem(REVIEW_HISTORY_KEY, JSON.stringify(nextEvents));
  } catch { /* noop */ }
}

export function getGoalPreferences(): SRSGoalPreferences {
  try {
    const dailyGoal = parseInt(localStorage.getItem(GOAL_KEY) ?? '20', 10);
    return { dailyGoal: Number.isFinite(dailyGoal) && dailyGoal > 0 ? dailyGoal : 20 };
  } catch {
    return { dailyGoal: 20 };
  }
}

export function saveGoalPreferences(prefs: SRSGoalPreferences): void {
  try {
    localStorage.setItem(GOAL_KEY, String(Math.max(1, prefs.dailyGoal)));
    // Notify any other surface displaying the daily goal (sidebar in
    // AppShell, FocusPanel "Goal today" tile, FlashcardView pacing pill,
    // analytics goals tab) so changing the goal in one place propagates
    // immediately. Without this the user had to refresh to see the new
    // number anywhere else.
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('kivora:goal-changed', { detail: prefs })); } catch { /* noop */ }
    }
  } catch { /* noop */ }
}

// ── localStorage deck helpers ─────────────────────────────────────────────────

const STORAGE_KEY = 'kivora-srs-decks';

export function loadDecks(): SRSDeck[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveDeck(deck: SRSDeck): void {
  try {
    const decks = loadDecks();
    const idx   = decks.findIndex(d => d.id === deck.id);
    if (idx >= 0) decks[idx] = deck; else decks.push(deck);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  } catch { /* noop */ }
}

export function deleteDeck(deckId: string): void {
  try {
    const decks = loadDecks().filter(d => d.id !== deckId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  } catch { /* noop */ }
}
