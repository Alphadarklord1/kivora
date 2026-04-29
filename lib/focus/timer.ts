/**
 * Shared focus-timer state.
 *
 * The previous implementation kept the countdown in a React useState +
 * setInterval inside <FocusPanel>. The moment the user navigated to /math,
 * /coach etc. the panel unmounted, the interval cleared, and the timer
 * silently died — but the user's mental model was "I started a 25-min
 * Pomodoro, it should keep ticking".
 *
 * This module replaces the in-memory countdown with a localStorage-backed
 * record of when the timer was started + how long it should run. Time is
 * computed on every read from `Date.now()`, so the timer effectively runs
 * in the background regardless of which route is mounted. Pausing snapshots
 * the seconds remaining; resuming sets a fresh `endsAt` from "now + remaining".
 *
 * Two consumers:
 *   - `<FocusPanel>` (the full UI on the workspace Focus tab)
 *   - `<FocusTimerIndicator>` (a small floating pill mounted globally so
 *     the user always knows a timer is running)
 *
 * Both call `useFocusTimer()` to get the live state at ~1Hz cadence.
 */

import { useEffect, useState } from 'react';

export type PomPhase = 'work' | 'short-break' | 'long-break' | 'custom';

export const POMODORO_PRESETS: Record<Exclude<PomPhase, 'custom'>, number> = {
  'work': 25,
  'short-break': 5,
  'long-break': 15,
};

const STORAGE_KEY    = 'kivora-focus-timer-v1';
const PRESETS_KEY    = 'kivora-focus-presets';
const CUSTOM_KEY     = 'kivora-pomodoro-custom-mins';
const POMODORO_KEY   = 'kivora-pomodoro-day';

export interface FocusTimerState {
  phase:           PomPhase;
  durationSec:     number;        // total length of the current phase
  endsAt:          number | null; // unix ms target — null when paused / stopped
  pausedSecsLeft:  number | null; // when paused, how many seconds were left
  customBlockMins: number;        // remembers the last custom-block length
  presets:         Record<Exclude<PomPhase, 'custom'>, number>;
}

export interface PomodoroDayState { date: string; sessions: number; totalMins: number }

const PHASE_COLORS: Record<PomPhase, string> = {
  'work':         'var(--accent)',
  'short-break':  'var(--success)',
  'long-break':   'var(--purple)',
  'custom':       '#a855f7',
};

const PHASE_LABELS: Record<PomPhase, string> = {
  'work':        '🍅 Focus',
  'short-break': '☕ Short break',
  'long-break':  '🌿 Long break',
  'custom':      '🎯 Custom',
};

export function phaseColor(p: PomPhase): string { return PHASE_COLORS[p]; }
export function phaseLabel(p: PomPhase): string { return PHASE_LABELS[p]; }

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function safeRead<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch { return null; }
}

function safeWrite(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota / SSR */ }
}

function loadPresets(): Record<Exclude<PomPhase, 'custom'>, number> {
  const stored = safeRead<Record<Exclude<PomPhase, 'custom'>, number>>(PRESETS_KEY);
  if (!stored) return { ...POMODORO_PRESETS };
  return {
    'work':        Number.isFinite(stored.work)        && stored.work        > 0 ? stored.work        : POMODORO_PRESETS.work,
    'short-break': Number.isFinite(stored['short-break']) && stored['short-break'] > 0 ? stored['short-break'] : POMODORO_PRESETS['short-break'],
    'long-break':  Number.isFinite(stored['long-break'])  && stored['long-break']  > 0 ? stored['long-break']  : POMODORO_PRESETS['long-break'],
  };
}

function loadCustomMins(): number {
  if (typeof window === 'undefined') return 50;
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const v = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(v) && v > 0 && v <= 240 ? v : 50;
  } catch { return 50; }
}

function defaultState(): FocusTimerState {
  const presets = loadPresets();
  return {
    phase:           'work',
    durationSec:     presets.work * 60,
    endsAt:          null,
    pausedSecsLeft:  null,
    customBlockMins: loadCustomMins(),
    presets,
  };
}

export function loadFocusState(): FocusTimerState {
  const stored = safeRead<FocusTimerState>(STORAGE_KEY);
  if (!stored) return defaultState();
  return {
    phase:           stored.phase ?? 'work',
    durationSec:     Number.isFinite(stored.durationSec) ? stored.durationSec : POMODORO_PRESETS.work * 60,
    endsAt:          typeof stored.endsAt === 'number' ? stored.endsAt : null,
    pausedSecsLeft:  typeof stored.pausedSecsLeft === 'number' ? stored.pausedSecsLeft : null,
    customBlockMins: Number.isFinite(stored.customBlockMins) && stored.customBlockMins > 0 ? stored.customBlockMins : loadCustomMins(),
    presets:         stored.presets ?? loadPresets(),
  };
}

function saveFocusState(state: FocusTimerState): void {
  safeWrite(STORAGE_KEY, state);
  // Notify any other open tabs / mounted listeners so they re-read.
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('kivora:focus-timer-changed')); } catch { /* noop */ }
  }
}

/** Compute remaining seconds from the current state and the wall clock. */
export function computeSecsLeft(state: FocusTimerState): number {
  if (state.pausedSecsLeft !== null) return Math.max(0, Math.floor(state.pausedSecsLeft));
  if (state.endsAt === null) return state.durationSec;
  return Math.max(0, Math.floor((state.endsAt - Date.now()) / 1000));
}

export function isRunning(state: FocusTimerState): boolean {
  return state.endsAt !== null && state.pausedSecsLeft === null;
}

export function isPaused(state: FocusTimerState): boolean {
  return state.pausedSecsLeft !== null;
}

// ── Mutators ─────────────────────────────────────────────────────────────

function durationFor(phase: PomPhase, presets: Record<Exclude<PomPhase, 'custom'>, number>, customMins: number): number {
  return phase === 'custom' ? customMins * 60 : presets[phase] * 60;
}

export function startTimer(): void {
  const state = loadFocusState();
  // If paused, resume by setting endsAt = now + pausedSecsLeft.
  // Otherwise start fresh from the full phase duration.
  const remaining = state.pausedSecsLeft !== null
    ? state.pausedSecsLeft
    : state.durationSec;
  saveFocusState({
    ...state,
    endsAt: Date.now() + remaining * 1000,
    pausedSecsLeft: null,
  });
}

export function pauseTimer(): void {
  const state = loadFocusState();
  const secsLeft = computeSecsLeft(state);
  saveFocusState({
    ...state,
    endsAt: null,
    pausedSecsLeft: secsLeft,
  });
}

export function resetTimer(): void {
  const state = loadFocusState();
  saveFocusState({
    ...state,
    durationSec: durationFor(state.phase, state.presets, state.customBlockMins),
    endsAt: null,
    pausedSecsLeft: null,
  });
}

export function switchPhase(phase: PomPhase): void {
  const state = loadFocusState();
  saveFocusState({
    ...state,
    phase,
    durationSec: durationFor(phase, state.presets, state.customBlockMins),
    endsAt: null,
    pausedSecsLeft: null,
  });
}

export function setPresets(presets: Record<Exclude<PomPhase, 'custom'>, number>): void {
  const state = loadFocusState();
  safeWrite(PRESETS_KEY, presets);
  // If the active phase's preset just changed and the timer isn't running,
  // refresh the displayed duration too.
  const refreshDuration = state.phase !== 'custom' && state.endsAt === null && state.pausedSecsLeft === null;
  saveFocusState({
    ...state,
    presets,
    durationSec: refreshDuration ? presets[state.phase as Exclude<PomPhase, 'custom'>] * 60 : state.durationSec,
  });
}

export function setCustomBlockMins(mins: number): void {
  const v = Math.max(5, Math.min(240, Math.round(mins)));
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(CUSTOM_KEY, String(v)); } catch { /* noop */ }
  }
  const state = loadFocusState();
  const refreshDuration = state.phase === 'custom' && state.endsAt === null && state.pausedSecsLeft === null;
  saveFocusState({
    ...state,
    customBlockMins: v,
    durationSec: refreshDuration ? v * 60 : state.durationSec,
  });
}

// ── Pomodoro day stats ───────────────────────────────────────────────────

export function loadPomodoroDay(): PomodoroDayState {
  const today = todayKey();
  const stored = safeRead<PomodoroDayState>(POMODORO_KEY);
  if (!stored || stored.date !== today) return { date: today, sessions: 0, totalMins: 0 };
  return stored;
}

export function recordPhaseCompletion(phase: PomPhase, customMins?: number): void {
  if (phase === 'work' || phase === 'custom') {
    const today = loadPomodoroDay();
    const minsToAdd = phase === 'work'
      ? loadFocusState().presets.work
      : (customMins ?? loadFocusState().customBlockMins);
    const next: PomodoroDayState = {
      date: today.date,
      // Custom blocks bank minutes but don't bump the pomodoro counter.
      sessions: phase === 'work' ? today.sessions + 1 : today.sessions,
      totalMins: today.totalMins + minsToAdd,
    };
    safeWrite(POMODORO_KEY, next);
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('kivora:pomodoro-day-changed')); } catch { /* noop */ }
    }
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────

/**
 * Returns the live timer state at ~1Hz. Re-renders the consumer once per
 * second when the timer is active, plus immediately on any storage / event
 * change so cross-tab updates land instantly.
 */
export function useFocusTimer(): { state: FocusTimerState; secsLeft: number } {
  const [state, setState] = useState<FocusTimerState>(() => loadFocusState());

  useEffect(() => {
    function refresh() { setState(loadFocusState()); }
    refresh();
    window.addEventListener('kivora:focus-timer-changed', refresh);
    window.addEventListener('storage', refresh);
    // Tick at 1Hz only while running so paused / stopped timers don't churn.
    let interval: ReturnType<typeof setInterval> | null = null;
    function ensureInterval(s: FocusTimerState) {
      if (s.endsAt !== null && s.pausedSecsLeft === null) {
        if (!interval) interval = setInterval(refresh, 1000);
      } else if (interval) {
        clearInterval(interval); interval = null;
      }
    }
    ensureInterval(loadFocusState());
    // The setState wrapper above triggers our own listener — ensure the
    // interval state stays correct when state changes.
    function onTick() {
      const cur = loadFocusState();
      ensureInterval(cur);
    }
    window.addEventListener('kivora:focus-timer-changed', onTick);
    return () => {
      window.removeEventListener('kivora:focus-timer-changed', refresh);
      window.removeEventListener('kivora:focus-timer-changed', onTick);
      window.removeEventListener('storage', refresh);
      if (interval) clearInterval(interval);
    };
  }, []);

  return { state, secsLeft: computeSecsLeft(state) };
}
