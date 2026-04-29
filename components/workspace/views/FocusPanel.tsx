'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { getGoalPreferences } from '@/lib/srs/sm2';
import {
  type PomPhase,
  POMODORO_PRESETS,
  loadPomodoroDay,
  recordPhaseCompletion,
  useFocusTimer,
  isRunning,
  startTimer,
  pauseTimer,
  resetTimer,
  switchPhase as switchPhaseStore,
  setPresets as savePresets,
  setCustomBlockMins as saveCustomBlock,
  phaseColor,
  phaseLabel,
} from '@/lib/focus/timer';

// FocusPanel is now a thin UI on top of `lib/focus/timer.ts`. The
// countdown lives in localStorage as a target timestamp + paused snapshot,
// so navigating away from /workspace doesn't kill the timer — it keeps
// running in the background and the global FocusTimerIndicator surfaces
// the remaining time on every page.

export function FocusPanel() {
  const { toast } = useToast();
  const { state, secsLeft } = useFocusTimer();
  const [sessions, setSessions] = useState(0);
  const [todayTotal, setTodayTotal] = useState(0);
  const [task, setTask] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [pomodoroGoal, setPomodoroGoal] = useState(4);
  const [resetArmed, setResetArmed] = useState(false);
  const resetArmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the last secsLeft we saw so we can detect the running→0
  // transition (i.e. timer just expired) and fire the celebration toast
  // / phase advance once and only once.
  const prevSecsLeftRef = useRef<number>(secsLeft);
  const handlingExpiryRef = useRef<boolean>(false);

  useEffect(() => {
    const day = loadPomodoroDay();
    setSessions(day.sessions);
    setTodayTotal(day.totalMins);
    try {
      const goal = getGoalPreferences();
      const inferred = Math.max(1, Math.round(goal.dailyGoal / 25));
      setPomodoroGoal(inferred);
    } catch { /* noop */ }
    function refreshDay() {
      const cur = loadPomodoroDay();
      setSessions(cur.sessions);
      setTodayTotal(cur.totalMins);
    }
    window.addEventListener('kivora:pomodoro-day-changed', refreshDay);
    return () => window.removeEventListener('kivora:pomodoro-day-changed', refreshDay);
  }, []);

  // Detect timer expiry (running → secsLeft hits 0) and run the post-phase
  // logic exactly once: bank the time, toast, advance phase.
  useEffect(() => {
    if (handlingExpiryRef.current) {
      prevSecsLeftRef.current = secsLeft;
      return;
    }
    const wasRunning = isRunning(state) || prevSecsLeftRef.current > 0;
    if (secsLeft === 0 && wasRunning && (state.endsAt !== null || prevSecsLeftRef.current > 0)) {
      handlingExpiryRef.current = true;
      handlePhaseEnd();
      // Release the guard once React has flushed the state changes.
      setTimeout(() => { handlingExpiryRef.current = false; }, 200);
    }
    prevSecsLeftRef.current = secsLeft;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secsLeft]);

  const totalSecs = state.durationSec;
  const progress = totalSecs > 0
    ? Math.max(0, Math.min(100, ((totalSecs - secsLeft) / totalSecs) * 100))
    : 0;
  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss = String(secsLeft % 60).padStart(2, '0');
  const circumference = 2 * Math.PI * 54;
  const running = isRunning(state);

  function handlePhaseEnd() {
    if (state.phase === 'work') {
      recordPhaseCompletion('work');
      const day = loadPomodoroDay();
      toast(`🎉 Pomodoro #${day.sessions} complete! Take a break.`, 'success');
      const next: PomPhase = day.sessions % 4 === 0 ? 'long-break' : 'short-break';
      switchPhaseStore(next);
    } else if (state.phase === 'custom') {
      recordPhaseCompletion('custom', state.customBlockMins);
      toast(`✓ ${state.customBlockMins}-min focus block complete.`, 'success');
      // Re-arm the same custom block so a quick "▶ Start" repeats it.
      switchPhaseStore('custom');
    } else {
      toast('Break over — back to work!', 'info');
      switchPhaseStore('work');
    }
  }

  function switchPhase(p: PomPhase) {
    switchPhaseStore(p);
    cancelResetArm();
  }

  function cancelResetArm() {
    setResetArmed(false);
    if (resetArmTimer.current) {
      clearTimeout(resetArmTimer.current);
      resetArmTimer.current = null;
    }
  }

  function handleResetClick() {
    if (!resetArmed) {
      setResetArmed(true);
      resetArmTimer.current = setTimeout(() => setResetArmed(false), 4000);
      return;
    }
    cancelResetArm();
    resetTimer();
  }

  function skip() {
    handlePhaseEnd();
  }

  function applyCustomBlock(mins: number) {
    saveCustomBlock(mins);
    switchPhaseStore('custom');
    cancelResetArm();
  }

  function toggleRunning() {
    if (running) pauseTimer();
    else startTimer();
    cancelResetArm();
  }

  const strokeDash = circumference - (progress / 100) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto' }}>
      <div style={{ maxWidth: 500, margin: '0 auto', padding: '24px 20px', width: '100%' }}>

        {/* Phase selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28, background: 'var(--surface)', borderRadius: 12, padding: 4 }}>
          {(['work', 'short-break', 'long-break', 'custom'] as PomPhase[]).map(p => (
            <button key={p}
              onClick={() => switchPhase(p)}
              aria-pressed={state.phase === p}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 'var(--text-xs)', fontWeight: 600,
                background: state.phase === p ? 'var(--bg)' : 'transparent',
                color: state.phase === p ? phaseColor(p) : 'var(--text-3)',
                boxShadow: state.phase === p ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}>
              {phaseLabel(p)}
            </button>
          ))}
        </div>

        {/* Ring timer */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
          <svg width={140} height={140} style={{ transform: 'rotate(-90deg)' }} role="img" aria-label={`${mm} minutes ${ss} seconds remaining`}>
            <title>Focus timer</title>
            <circle cx={70} cy={70} r={54} fill="none" stroke="var(--surface-2)" strokeWidth={8} />
            <circle cx={70} cy={70} r={54} fill="none"
              stroke={phaseColor(state.phase)}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDash}
              style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
            />
          </svg>
          <div style={{ position: 'absolute', textAlign: 'center' }}>
            <div style={{
              fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
              color: running ? phaseColor(state.phase) : 'var(--text)',
              animation: running ? 'timer-pulse 2s ease-in-out infinite' : 'none',
            }}>
              {mm}:{ss}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2, textTransform: 'capitalize' }}>
              {state.phase === 'custom' ? `Custom · ${state.customBlockMins} min` : state.phase.replace('-', ' ')}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 24 }}>
          <button
            className={`btn btn-sm ${resetArmed ? 'btn-danger' : 'btn-secondary'}`}
            onClick={handleResetClick}
            style={{ minWidth: 124, justifyContent: 'center', fontWeight: 700 }}
            title={resetArmed ? 'Tap again to confirm' : 'Reset the current timer'}
          >
            {resetArmed ? '⚠ Tap to confirm' : '↺ Reset'}
          </button>
          <button
            className="btn btn-primary"
            style={{
              minWidth: 156,
              justifyContent: 'center',
              padding: '10px 36px',
              borderRadius: 50,
              border: 'none',
              cursor: 'pointer',
              background: phaseColor(state.phase),
              color: '#fff',
              fontSize: 'var(--text-base)',
              fontWeight: 700,
              boxShadow: running ? `0 0 0 4px color-mix(in srgb, ${phaseColor(state.phase)} 25%, transparent)` : 'none',
              transition: 'all 0.2s',
            }}
            onClick={toggleRunning}>
            {running ? '⏸ Pause' : secsLeft < totalSecs ? '▶ Resume' : '▶ Start'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={skip} disabled={!running}>Skip →</button>
        </div>

        {/* Task input */}
        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder="What are you studying? (optional)"
            value={task}
            onChange={e => setTask(e.target.value)}
            style={{
              width: '100%', padding: '8px 14px', borderRadius: 10,
              background: 'var(--surface)', border: '1px solid var(--border-2)',
              fontSize: 'var(--text-sm)', color: 'var(--text)',
            }}
          />
        </div>

        {/* Custom block quick-launch */}
        {state.phase === 'custom' && (
          <div style={{ marginBottom: 20, padding: '14px', background: 'color-mix(in srgb, #a855f7 8%, var(--surface))', border: '1px solid color-mix(in srgb, #a855f7 25%, transparent)', borderRadius: 10 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Custom focus block
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <input
                type="number"
                min={5}
                max={240}
                value={state.customBlockMins}
                onChange={e => applyCustomBlock(+e.target.value || 5)}
                disabled={running}
                aria-label="Custom focus block duration in minutes"
                style={{ width: 90, padding: '6px 10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--bg)', color: 'var(--text)' }}
              />
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>minutes</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[15, 30, 50, 90, 120].map(m => (
                <button key={m} onClick={() => applyCustomBlock(m)}
                  disabled={running}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 'var(--text-xs)', padding: '4px 10px', opacity: state.customBlockMins === m ? 1 : 0.7, fontWeight: state.customBlockMins === m ? 700 : 500 }}>
                  {m} min
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.5 }}>
              Custom blocks count toward today&apos;s minutes but don&apos;t advance the work→break cycle.
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Pomodoros', value: sessions, icon: '🍅' },
            { label: 'Min studied', value: todayTotal, icon: '⏱' },
            { label: 'Goal today', value: `${sessions}/${pomodoroGoal}`, icon: '🎯' },
          ].map(stat => (
            <div key={stat.label} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '10px 12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{stat.icon}</div>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text)' }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Custom durations for the standard phases */}
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 'var(--text-xs)', width: '100%', justifyContent: 'center' }}
            onClick={() => setShowSettings(s => !s)}>
            {showSettings ? '▲ Hide preset durations' : '⚙ Customise preset durations'}
          </button>
          {showSettings && (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, padding: '14px', background: 'var(--surface)', borderRadius: 10 }}>
              {(['work', 'short-break', 'long-break'] as Array<Exclude<PomPhase, 'custom'>>).map(p => (
                <label key={p} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                  {p === 'work' ? 'Focus' : p === 'short-break' ? 'Short break' : 'Long break'} (min)
                  <input type="number" value={state.presets[p]} min={1} max={90}
                    onChange={e => {
                      const v = Math.max(1, +e.target.value);
                      savePresets({ ...state.presets, [p]: v });
                    }}
                    style={{ padding: '4px 8px', textAlign: 'center' }} />
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Study tips */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            💡 Pomodoro tips
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 'var(--text-xs)', color: 'var(--text-3)', lineHeight: 1.7 }}>
            <li>Work in 25-min focused bursts with no distractions</li>
            <li>Every 4 pomodoros, take a longer 15-min break</li>
            <li>For deep work, use a Custom block (50–90 min) — it won&apos;t auto-trigger a break</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// Re-export for callers that previously imported from this file. The
// constant moved into lib/focus/timer.ts so tests / other components can
// share it without depending on a React component.
export { POMODORO_PRESETS };
