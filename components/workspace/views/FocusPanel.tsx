'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { getGoalPreferences } from '@/lib/srs/sm2';

// ── Focus / Pomodoro panel ─────────────────────────────────────────────────

type PomPhase = 'work' | 'short-break' | 'long-break';

const POMODORO_PRESETS: Record<PomPhase, number> = {
  'work': 25,
  'short-break': 5,
  'long-break': 15,
};

const POMODORO_KEY = 'kivora-pomodoro-day';

interface PomodoroDayState { date: string; sessions: number; totalMins: number }

function loadPomodoroDay(): PomodoroDayState {
  if (typeof window === 'undefined') return { date: '', sessions: 0, totalMins: 0 };
  const today = new Date().toISOString().split('T')[0];
  try {
    const raw = localStorage.getItem(POMODORO_KEY);
    if (!raw) return { date: today, sessions: 0, totalMins: 0 };
    const parsed = JSON.parse(raw) as PomodoroDayState;
    // Reset counters on a new calendar day so today's stats are actually today's.
    if (parsed.date !== today) return { date: today, sessions: 0, totalMins: 0 };
    return parsed;
  } catch {
    return { date: today, sessions: 0, totalMins: 0 };
  }
}

function savePomodoroDay(state: PomodoroDayState): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(POMODORO_KEY, JSON.stringify(state)); } catch { /* noop */ }
}

export function FocusPanel() {
  const { toast } = useToast();
  const [phase,         setPhase]         = useState<PomPhase>('work');
  const [customMins,    setCustomMins]     = useState<Record<PomPhase, number>>({ ...POMODORO_PRESETS });
  const [secsLeft,      setSecsLeft]       = useState(POMODORO_PRESETS.work * 60);
  const [running,       setRunning]        = useState(false);
  const [sessions,      setSessions]       = useState(0);    // pomodoros completed today
  const [todayTotal,    setTodayTotal]     = useState(0);    // total minutes studied today
  const [task,          setTask]           = useState('');   // what are you studying?
  const [showSettings,  setShowSettings]   = useState(false);
  const [pomodoroGoal,  setPomodoroGoal]   = useState(4);    // sessions goal — reasonable default
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hydrate persisted day state on mount so refreshing or switching tabs
  // doesn't blow away today's pomodoro count. Without this the stats card
  // was decorative — every render claimed "0 pomodoros today".
  useEffect(() => {
    const day = loadPomodoroDay();
    setSessions(day.sessions);
    setTodayTotal(day.totalMins);
    try {
      const goal = getGoalPreferences();
      // Use card goal as a rough proxy until we add a separate pomodoro goal pref.
      // 100 cards ≈ 4 sessions feels right for the default audience.
      const inferred = Math.max(1, Math.round(goal.dailyGoal / 25));
      setPomodoroGoal(inferred);
    } catch { /* noop */ }
  }, []);

  const totalSecs    = customMins[phase] * 60;
  const progress     = Math.max(0, Math.min(100, ((totalSecs - secsLeft) / totalSecs) * 100));
  const mm           = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss           = String(secsLeft % 60).padStart(2, '0');
  const circumference = 2 * Math.PI * 54; // radius 54 on SVG

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecsLeft(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            handlePhaseEnd();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function handlePhaseEnd() {
    if (phase === 'work') {
      const newSessions = sessions + 1;
      const newTotal = todayTotal + customMins.work;
      setSessions(newSessions);
      setTodayTotal(newTotal);
      // Persist so the count survives reloads + tab switches.
      savePomodoroDay({
        date: new Date().toISOString().split('T')[0],
        sessions: newSessions,
        totalMins: newTotal,
      });
      toast(`🎉 Pomodoro #${newSessions} complete! Take a break.`, 'success');
      const next: PomPhase = newSessions % 4 === 0 ? 'long-break' : 'short-break';
      switchPhase(next);
    } else {
      toast('Break over — back to work!', 'info');
      switchPhase('work');
    }
  }

  function switchPhase(p: PomPhase) {
    setPhase(p);
    setSecsLeft(customMins[p] * 60);
    setRunning(false);
  }

  function reset() {
    setSecsLeft(customMins[phase] * 60);
    setRunning(false);
  }

  function skip() {
    handlePhaseEnd();
  }

  const phaseColor: Record<PomPhase, string> = {
    'work': 'var(--accent)',
    'short-break': 'var(--success)',
    'long-break': 'var(--purple)',
  };

  const strokeDash = circumference - (progress / 100) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto' }}>
      <div style={{ maxWidth: 500, margin: '0 auto', padding: '24px 20px', width: '100%' }}>

        {/* Phase selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28, background: 'var(--surface)', borderRadius: 12, padding: 4 }}>
          {(['work', 'short-break', 'long-break'] as PomPhase[]).map(p => (
            <button key={p}
              onClick={() => switchPhase(p)}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 'var(--text-xs)', fontWeight: 600,
                background: phase === p ? 'var(--bg)' : 'transparent',
                color: phase === p ? phaseColor[p] : 'var(--text-3)',
                boxShadow: phase === p ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}>
              {p === 'work' ? '🍅 Focus' : p === 'short-break' ? '☕ Short break' : '🌿 Long break'}
            </button>
          ))}
        </div>

        {/* Ring timer */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
          <svg width={140} height={140} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={70} cy={70} r={54} fill="none" stroke="var(--surface-2)" strokeWidth={8} />
            <circle cx={70} cy={70} r={54} fill="none"
              stroke={phaseColor[phase]}
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
              color: running ? phaseColor[phase] : 'var(--text)',
              animation: running ? 'timer-pulse 2s ease-in-out infinite' : 'none',
            }}>
              {mm}:{ss}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2, textTransform: 'capitalize' }}>
              {phase.replace('-', ' ')}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 24 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={reset}
            style={{ minWidth: 104, justifyContent: 'center', fontWeight: 700 }}
          >
            ↺ Reset
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
              background: phaseColor[phase],
              color: '#fff',
              fontSize: 'var(--text-base)',
              fontWeight: 700,
              boxShadow: running ? `0 0 0 4px color-mix(in srgb, ${phaseColor[phase]} 25%, transparent)` : 'none',
              transition: 'all 0.2s',
            }}
            onClick={() => setRunning(r => !r)}>
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

        {/* Custom durations */}
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 'var(--text-xs)', width: '100%', justifyContent: 'center' }}
            onClick={() => setShowSettings(s => !s)}>
            {showSettings ? '▲ Hide settings' : '⚙ Customize durations'}
          </button>
          {showSettings && (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, padding: '14px', background: 'var(--surface)', borderRadius: 10 }}>
              {(['work', 'short-break', 'long-break'] as PomPhase[]).map(p => (
                <label key={p} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                  {p === 'work' ? 'Focus' : p === 'short-break' ? 'Short break' : 'Long break'} (min)
                  <input type="number" value={customMins[p]} min={1} max={90}
                    onChange={e => {
                      const v = Math.max(1, +e.target.value);
                      setCustomMins(prev => ({ ...prev, [p]: v }));
                      if (phase === p) { setSecsLeft(v * 60); setRunning(false); }
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
            <li>Note what you studied each session to track progress</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
