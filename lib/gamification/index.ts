// ── Gamification System ───────────────────────────────────────────────────
// localStorage-based XP / level / achievement engine.
// No database writes — all state lives in browser storage.

// ── XP values ─────────────────────────────────────────────────────────────

export const XP_VALUES = {
  fileUploaded:      25,
  contentGenerated:  20,
  savedToLibrary:    15,
  quizCompleted:     30,
  flashcardReviewed:  5,
  streakDay:         50,
  mathSolved:        10,
  noteCreated:       15,
} as const;

// ── Level table ───────────────────────────────────────────────────────────

export interface Level {
  level:    number;
  title:    string;
  minXp:    number;
}

export const LEVELS: Level[] = [
  { level:  1, title: 'Learner',      minXp:    0 },
  { level:  2, title: 'Student',      minXp:  100 },
  { level:  3, title: 'Practitioner', minXp:  300 },
  { level:  4, title: 'Scholar',      minXp:  600 },
  { level:  5, title: 'Expert',       minXp: 1000 },
  { level:  6, title: 'Master',       minXp: 1500 },
  { level:  7, title: 'Professor',    minXp: 2200 },
  { level:  8, title: 'Genius',       minXp: 3000 },
  { level:  9, title: 'Legend',       minXp: 4000 },
  { level: 10, title: 'Kivora',       minXp: 5500 },
];

// ── Achievement definitions ───────────────────────────────────────────────

export interface Achievement {
  id:          string;
  title:       string;
  description: string;
  icon:        string;
  xp:          number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_upload',  title: 'First Step',    description: 'Upload your first file',              icon: '📄', xp:   50 },
  { id: 'files_10',      title: 'Collector',     description: 'Upload 10 files',                     icon: '📚', xp:  100 },
  { id: 'streak_3',      title: 'Getting Warm',  description: 'Reach a 3-day study streak',          icon: '🔥', xp:   75 },
  { id: 'streak_7',      title: 'On Fire',       description: 'Reach a 7-day streak',                icon: '🔥', xp:  150 },
  { id: 'streak_30',     title: 'Unstoppable',   description: 'Reach a 30-day streak',               icon: '🚀', xp:  500 },
  { id: 'library_5',     title: 'Bookmarker',    description: 'Save 5 items to your library',        icon: '🗂️', xp:   75 },
  { id: 'library_20',    title: 'Archivist',     description: 'Save 20 items to library',            icon: '🏛️', xp:  200 },
  { id: 'quiz_5',        title: 'Quiz Taker',    description: 'Complete 5 quizzes',                  icon: '📝', xp:  100 },
  { id: 'quiz_25',       title: 'Quiz Master',   description: 'Complete 25 quizzes',                 icon: '🏆', xp:  300 },
  { id: 'math_10',       title: 'Mathematician', description: 'Solve 10 math problems',              icon: '∑',  xp:  100 },
  { id: 'generated_10',  title: 'AI User',       description: 'Generate 10 pieces of content',       icon: '🤖', xp:  100 },
  { id: 'level_5',       title: 'Halfway There', description: 'Reach level 5',                       icon: '⭐', xp:  200 },
  { id: 'level_10',      title: 'Kivoran',       description: 'Reach the highest level',             icon: '👑', xp: 1000 },
];

// ── localStorage keys ─────────────────────────────────────────────────────

const KEY_XP           = 'kivora-gamification-xp';
const KEY_ACHIEVEMENTS = 'kivora-gamification-achievements';
const KEY_COUNTERS     = 'kivora-gamification-counters';

// ── Internal helpers ──────────────────────────────────────────────────────

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota exceeded or SSR */ }
}

function getLevelForXp(xp: number): Level {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (xp >= lvl.minXp) current = lvl;
    else break;
  }
  return current;
}

// ── Public API ────────────────────────────────────────────────────────────

export interface GamificationState {
  xp:           number;
  level:        number;
  levelTitle:   string;
  achievements: string[];       // array of earned achievement ids
  xpToNextLevel: number;        // XP required to reach next level (0 if max)
  xpProgress:   number;         // 0–1 float for a progress bar
}

/** Read the current gamification state. Pure read — no side effects. */
export function getGamificationState(): GamificationState {
  const xp           = safeGet<number>(KEY_XP, 0);
  const achievements = safeGet<string[]>(KEY_ACHIEVEMENTS, []);
  const current      = getLevelForXp(xp);
  const nextIdx      = LEVELS.findIndex(l => l.level === current.level + 1);
  const next         = nextIdx !== -1 ? LEVELS[nextIdx] : null;

  const xpToNextLevel = next ? next.minXp - xp : 0;
  const xpProgress    = next
    ? Math.min(1, (xp - current.minXp) / (next.minXp - current.minXp))
    : 1;

  return {
    xp,
    level:      current.level,
    levelTitle: current.title,
    achievements,
    xpToNextLevel,
    xpProgress,
  };
}

export interface AddXpResult {
  newLevel:        boolean;
  newAchievements: Achievement[];
}

/**
 * Add XP. Checks for level-up and returns any new state transitions.
 * @param amount  XP to award
 * @param source  Label for debugging / future analytics
 */
export function addXp(amount: number, source: string): AddXpResult {
  if (typeof window === 'undefined') return { newLevel: false, newAchievements: [] };

  const prevXp    = safeGet<number>(KEY_XP, 0);
  const newXp     = prevXp + amount;
  safeSet(KEY_XP, newXp);

  const prevLevel = getLevelForXp(prevXp);
  const newLevel  = getLevelForXp(newXp);
  const leveledUp = newLevel.level > prevLevel.level;

  // Trigger level-based achievements
  const newAchievements: Achievement[] = [];
  if (leveledUp) {
    if (newLevel.level >= 5) {
      const a = unlockAchievement('level_5');
      if (a) newAchievements.push(a);
    }
    if (newLevel.level >= 10) {
      const a = unlockAchievement('level_10');
      if (a) newAchievements.push(a);
    }
  }

  // Log source (no-op in production, useful during dev)
  if (process.env.NODE_ENV === 'development') {
     
    console.debug(`[gamification] +${amount} XP (${source}) → total ${newXp} | level ${newLevel.level}`);
  }

  return { newLevel: leveledUp, newAchievements };
}

/**
 * Unlock an achievement by id. Returns the Achievement if it was newly
 * unlocked, or null if it was already earned.
 */
export function unlockAchievement(id: string): Achievement | null {
  if (typeof window === 'undefined') return null;

  const earned = safeGet<string[]>(KEY_ACHIEVEMENTS, []);
  if (earned.includes(id)) return null;

  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (!def) return null;

  earned.push(id);
  safeSet(KEY_ACHIEVEMENTS, earned);

  // Award XP bonus (recursive addXp without further achievement checking
  // to avoid infinite loops — we write XP directly)
  const currentXp = safeGet<number>(KEY_XP, 0);
  safeSet(KEY_XP, currentXp + def.xp);

  return def;
}

// ── Counter management ────────────────────────────────────────────────────

export type Counters = Record<string, number>;

/** Read all counters from localStorage. */
export function getCounters(): Counters {
  return safeGet<Counters>(KEY_COUNTERS, {});
}

/** Increment a named counter by 1 and persist it. Returns the new value. */
export function incrementCounter(key: string): number {
  const counters = getCounters();
  counters[key]  = (counters[key] ?? 0) + 1;
  safeSet(KEY_COUNTERS, counters);
  return counters[key];
}

// Achievement trigger map:
// counter key → { achievementId, threshold }[]
const ACHIEVEMENT_TRIGGERS: Record<string, { id: string; threshold: number }[]> = {
  filesUploaded:     [{ id: 'first_upload', threshold: 1 }, { id: 'files_10', threshold: 10 }],
  streak:            [{ id: 'streak_3',    threshold: 3  }, { id: 'streak_7',  threshold: 7  }, { id: 'streak_30', threshold: 30 }],
  librarySaved:      [{ id: 'library_5',   threshold: 5  }, { id: 'library_20', threshold: 20 }],
  quizzesCompleted:  [{ id: 'quiz_5',      threshold: 5  }, { id: 'quiz_25',   threshold: 25 }],
  mathSolved:        [{ id: 'math_10',     threshold: 10 }],
  contentGenerated:  [{ id: 'generated_10', threshold: 10 }],
};

/**
 * Given a snapshot of counters (e.g. `{ filesUploaded: 3, streak: 7 }`),
 * unlock every achievement whose threshold has been met.
 * Returns the list of newly unlocked achievements.
 */
export function checkAndUnlockAchievements(counters: Counters): Achievement[] {
  const newly: Achievement[] = [];

  for (const [key, triggers] of Object.entries(ACHIEVEMENT_TRIGGERS)) {
    const value = counters[key] ?? 0;
    for (const { id, threshold } of triggers) {
      if (value >= threshold) {
        const a = unlockAchievement(id);
        if (a) newly.push(a);
      }
    }
  }

  return newly;
}
