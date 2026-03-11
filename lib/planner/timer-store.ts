'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getLocalStudyPlan, updateLocalStudyPlan } from '@/lib/planner/local-plans';
import { readCompatStorage, removeCompatStorage, storageKeys, writeCompatStorage } from '@/lib/storage/keys';

interface TimerState {
  timerSeconds: number;
  timerDuration: number;
  timerRunning: boolean;
  breakMode: boolean;
  sessionsCompleted: number;
  currentPlanId: string | null;
  currentPlanTitle: string;
  currentDayIndex: number | null;
  startedAt: number | null; // Date.now() when last started/resumed
}

const DEFAULT_STATE: TimerState = {
  timerSeconds: 25 * 60,
  timerDuration: 25 * 60,
  timerRunning: false,
  breakMode: false,
  sessionsCompleted: 0,
  currentPlanId: null,
  currentPlanTitle: '',
  currentDayIndex: null,
  startedAt: null,
};

function loadState(): TimerState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = readCompatStorage(localStorage, storageKeys.timerState);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: TimerState) {
  if (typeof window === 'undefined') return;
  try {
    writeCompatStorage(localStorage, storageKeys.timerState, JSON.stringify(state));
  } catch { /* quota exceeded — ignore */ }
}

function clearState() {
  if (typeof window === 'undefined') return;
  removeCompatStorage(localStorage, storageKeys.timerState);
}

function computeRemaining(state: TimerState): number {
  if (!state.timerRunning || !state.startedAt) return state.timerSeconds;
  const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
  return Math.max(0, state.timerSeconds - elapsed);
}

// Notification sound (short beep)
function playNotification() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 1000;
      gain2.gain.value = 0.3;
      osc2.start();
      osc2.stop(ctx.currentTime + 0.3);
    }, 350);
  } catch { /* audio not available */ }
}

export function useStudyTimer() {
  const [state, setState] = useState<TimerState>(DEFAULT_STATE);
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // Load from localStorage on mount (intentional sync from external store)
  useEffect(() => {
    const loaded = loadState();
    setState(loaded); // eslint-disable-line react-hooks/set-state-in-effect
    setSeconds(computeRemaining(loaded));
  }, []);

  // Listen for storage changes from other tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === storageKeys.timerState.current || e.key === storageKeys.timerState.legacy?.[0]) {
        const loaded = loadState();
        setState(loaded);
        setSeconds(computeRemaining(loaded));
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Tick interval
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (state.timerRunning) {
      intervalRef.current = setInterval(() => {
        const remaining = computeRemaining(stateRef.current);
        setSeconds(remaining);

        if (remaining <= 0) {
          // Session complete
          playNotification();

          const s = stateRef.current;
          let next: TimerState;

          if (s.breakMode) {
            // Break finished → back to study
            next = {
              ...s,
              breakMode: false,
              timerSeconds: s.timerDuration,
              timerRunning: false,
              startedAt: null,
            };
          } else {
            // Study finished → start break
            const newSessions = s.sessionsCompleted + 1;
            const breakDuration = newSessions % 4 === 0 ? 15 * 60 : 5 * 60;
            next = {
              ...s,
              breakMode: true,
              sessionsCompleted: newSessions,
              timerSeconds: breakDuration,
              timerRunning: false,
              startedAt: null,
            };

            // Record session via API
            if (s.currentPlanId && s.currentDayIndex !== null) {
              recordSession(s.currentPlanId, s.currentDayIndex, s.timerDuration);
            }
          }

          setState(next);
          setSeconds(next.timerSeconds);
          saveState(next);
        }
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state.timerRunning, state.startedAt]);

  const startTimer = useCallback((planId: string, planTitle: string, dayIndex: number, duration?: number) => {
    const dur = duration || 25 * 60;
    const next: TimerState = {
      timerSeconds: dur,
      timerDuration: dur,
      timerRunning: true,
      breakMode: false,
      sessionsCompleted: 0,
      currentPlanId: planId,
      currentPlanTitle: planTitle,
      currentDayIndex: dayIndex,
      startedAt: Date.now(),
    };
    setState(next);
    setSeconds(dur);
    saveState(next);
  }, []);

  const pauseTimer = useCallback(() => {
    const remaining = computeRemaining(stateRef.current);
    const next: TimerState = {
      ...stateRef.current,
      timerRunning: false,
      timerSeconds: remaining,
      startedAt: null,
    };
    setState(next);
    setSeconds(remaining);
    saveState(next);
  }, []);

  const resumeTimer = useCallback(() => {
    const next: TimerState = {
      ...stateRef.current,
      timerRunning: true,
      startedAt: Date.now(),
    };
    setState(next);
    saveState(next);
  }, []);

  const resetTimer = useCallback(() => {
    const dur = stateRef.current.timerDuration;
    const next: TimerState = {
      ...stateRef.current,
      timerRunning: false,
      timerSeconds: dur,
      breakMode: false,
      startedAt: null,
    };
    setState(next);
    setSeconds(dur);
    saveState(next);
  }, []);

  const setDuration = useCallback((dur: number) => {
    const next: TimerState = {
      ...stateRef.current,
      timerDuration: dur,
      timerSeconds: dur,
      timerRunning: false,
      startedAt: null,
    };
    setState(next);
    setSeconds(dur);
    saveState(next);
  }, []);

  const clearTimer = useCallback(() => {
    setState(DEFAULT_STATE);
    setSeconds(DEFAULT_STATE.timerSeconds);
    clearState();
  }, []);

  const isActive = state.currentPlanId !== null;

  return {
    seconds,
    isRunning: state.timerRunning,
    breakMode: state.breakMode,
    sessionsCompleted: state.sessionsCompleted,
    currentPlanId: state.currentPlanId,
    currentPlanTitle: state.currentPlanTitle,
    currentDayIndex: state.currentDayIndex,
    duration: state.timerDuration,
    isActive,
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    setDuration,
    clearTimer,
  };
}

async function recordSession(planId: string, dayIndex: number, duration: number) {
  try {
    const res = await fetch(`/api/study-plans/${planId}`, { credentials: 'include' });
    let plan = null;

    if (res.ok) {
      plan = await res.json();
    } else {
      const payload = await res.json().catch(() => null);
      const errorCode = payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>).errorCode
        : null;
      if (errorCode === 'DATABASE_NOT_CONFIGURED') {
        plan = getLocalStudyPlan(planId);
      }
    }

    if (!plan) return;
    const schedule = plan.schedule;
    if (!schedule?.days?.[dayIndex]) return;

    const day = schedule.days[dayIndex];
    if (!day.sessions) day.sessions = [];
    day.sessions.push({
      duration,
      completedAt: new Date().toISOString(),
    });

    const updateRes = await fetch(`/api/study-plans/${planId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule }),
      credentials: 'include',
    });

    if (!updateRes.ok) {
      const payload = await updateRes.json().catch(() => null);
      const errorCode = payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>).errorCode
        : null;
      if (errorCode === 'DATABASE_NOT_CONFIGURED') {
        updateLocalStudyPlan(planId, { schedule });
      }
    }
  } catch { /* silently fail — session recording is best-effort */ }
}
