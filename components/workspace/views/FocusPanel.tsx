'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/providers/ToastProvider';

// ── Focus / Pomodoro panel ─────────────────────────────────────────────────────

type PomPhase = 'work' | 'short-break' | 'long-break';

const POMODORO_PRESETS: Record<PomPhase, number> = {
  'work': 25,
  'short-break': 5,
  'long-break': 15,
};

const SESSIONS_KEY   = 'kivora_focus_sessions';
const TOTAL_MINS_KEY = 'kivora_focus_total_mins';
const GOAL_KEY       = 'kivora_focus_daily_goal';
const DATE_KEY       = 'kivora_focus_date';

function todayStr() { return new Date().toISOString().slice(0, 10); }

function loadDayState() {
  if (typeof window === 'undefined') return { sessions: 0, totalMins: 0 };
  // Reset counts if it's a new day
  const stored = localStorage.getItem(DATE_KEY);
  if (stored !== todayStr()) {
    localStorage.setItem(DATE_KEY, todayStr());
    localStorage.removeItem(SESSIONS_KEY);
    localStorage.removeItem(TOTAL_MINS_KEY);
    return { sessions: 0, totalMins: 0 };
  }
  return {
    sessions:  parseInt(localStorage.getItem(SESSIONS_KEY)  ?? '0', 10) || 0,
    totalMins: parseInt(localStorage.getItem(TOTAL_MINS_KEY) ?? '0', 10) || 0,
  };
}

export function FocusPanel() {
  const { toast } = useToast();
  const [phase,         setPhase]         = useState<PomPhase>('work');
  const [customMins,    setCustomMins]     = useState<Record<PomPhase, number>>({ ...POMODORO_PRESETS });
  const [secsLeft,      setSecsLeft]       = useState(POMODORO_PRESETS.work * 60);
  const [running,       setRunning]        = useState(false);
  const [sessions,      setSessions]       = useState(0);
  const [todayTotal,    setTodayTotal]     = useState(0);
  const [dailyGoal,     setDailyGoal]     = useState(4);
  const [task,          setTask]           = useState('');
  const [showSettings,  setShowSettings]   = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSecs    = customMins[phase] * 60;
  const progress     = Math.max(0, Math.min(100, ((totalSecs - secsLeft) / totalSecs) * 100));
  const mm           = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss           = String(secsLeft % 60).padStart(2, '0');
  const circumference = 2 * Math.PI * 54;

  // Load persisted day state on mount
  useEffect(() => {
    const { sessions: s, totalMins: m } = loadDayState();
    setSessions(s);
    setTodayTotal(m);
    const goal = parseInt(localStorage.getItem(GOAL_KEY) ?? '4', 10) || 4;
    setDailyGoal(goal);
  }, []);

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
      setSessions(prev => {
        const newSessions = prev + 1;
        const newMins = todayTotal + customMins.work;

        // Persist to localStorage
        localStorage.setItem(SESSIONS_KEY, String(newSessions));
        localStorage.setItem(TOTAL_MINS_KEY, String(newMins));
        localStorage.setItem(DATE_KEY, todayStr());
        setTodayTotal(newMins);

        // Persist to DB (best-effort)
        fetch('/api/srs/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ minutesStudied: customMins.work, cardsReviewed: 0 }),
          credentials: 'include',
        }).catch(() => {});

        toast(`🎉 Pomodoro #${newSessions} complete! Take a break.`, 'success');
        const next: PomPhase = newSessions % 4 === 0 ? 'long-break' : 'short-break';
        switchPhase(next);
        return newSessions;
      });
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

  function saveGoal(goal: number) {
    setDailyGoal(goal);
    localStorage.setItem(GOAL_KEY, String(goal));
  }

  const phaseColor: Record<PomPhase, string> = {
    'work': 'var(--accent)',
    'short-break': 'var(--success)',
    'long-break': 'var(--purple)',
  };

  const strokeDash = circumference - (progress / 100) * circumference;
  const goalPct    = dailyGoal > 0 ? Math.min(100, Math.round((sessions / dailyGoal) * 100)) : 0;

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
            { label: 'Goal today', value: `${sessions}/${dailyGoal}`, icon: '🎯' },
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

        {/* Goal progress bar */}
        {dailyGoal > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
              <span>Daily goal progress</span>
              <span style={{ color: goalPct >= 100 ? 'var(--success)' : 'var(--text-2)', fontWeight: 600 }}>{goalPct}%{goalPct >= 100 ? ' ✓' : ''}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--border-2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${goalPct}%`, background: goalPct >= 100 ? 'var(--success)' : 'var(--accent)', borderRadius: 3, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        )}

        {/* Custom durations + goal */}
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 'var(--text-xs)', width: '100%', justifyContent: 'center' }}
            onClick={() => setShowSettings(s => !s)}>
            {showSettings ? '▲ Hide settings' : '⚙ Customize durations & goal'}
          </button>
          {showSettings && (
            <div style={{ marginTop: 12, padding: '14px', background: 'var(--surface)', borderRadius: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
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
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                Daily pomodoro goal
                <input type="number" value={dailyGoal} min={1} max={20}
                  onChange={e => saveGoal(Math.max(1, Math.min(20, +e.target.value)))}
                  style={{ padding: '4px 8px', textAlign: 'center', width: 80 }} />
              </label>
            </div>
          )}
        </div>

        {/* Study tips */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            💡 Pomodoro tips
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 'var(--text-xs)', color: 'var(--text-3)', lineHeight: 1.7 }}>
            <li>Work in focused bursts with no distractions</li>
            <li>Every 4 pomodoros, take a longer break</li>
            <li>Note what you studied each session to track progress</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
