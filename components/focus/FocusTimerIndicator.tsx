'use client';

/**
 * Floating focus-timer pill mounted in <AppShell>. Shows on every page
 * (workspace, math, coach, library, etc.) whenever the user has an
 * active or paused focus timer, so they don't lose track of a 25-min
 * Pomodoro after navigating away from the Focus tab.
 *
 * Self-hides when the timer is reset / completed. Click to jump back
 * to the workspace Focus tab.
 */

import { useRouter, usePathname } from 'next/navigation';
import { useFocusTimer, isRunning, isPaused, phaseColor, phaseLabel } from '@/lib/focus/timer';

export function FocusTimerIndicator() {
  const router = useRouter();
  const pathname = usePathname();
  const { state, secsLeft } = useFocusTimer();

  // Hide on the workspace itself — the full panel is right there, no
  // need for a duplicate corner pill. Hide on /login and other auth
  // surfaces too.
  const onWorkspace = pathname?.startsWith('/workspace');
  const onAuth = pathname?.startsWith('/login') || pathname?.startsWith('/register') || pathname === '/';
  const active = isRunning(state) || isPaused(state);

  if (!active || onWorkspace || onAuth) return null;

  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss = String(secsLeft % 60).padStart(2, '0');
  const totalSecs = state.durationSec;
  const progress = totalSecs > 0 ? Math.min(1, Math.max(0, (totalSecs - secsLeft) / totalSecs)) : 0;
  const ringSize = 36;
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);
  const color = phaseColor(state.phase);

  function jumpToFocus() {
    router.push('/workspace?tab=focus');
  }

  return (
    <button
      type="button"
      onClick={jumpToFocus}
      title={`${phaseLabel(state.phase)} · ${isPaused(state) ? 'Paused' : 'Running'} — click to open Focus`}
      style={{
        position: 'fixed',
        bottom: 'max(20px, env(safe-area-inset-bottom))',
        right: 20,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px 6px 8px',
        borderRadius: 999,
        border: `1.5px solid color-mix(in srgb, ${color} 35%, var(--border-2))`,
        background: 'var(--bg-elevated, var(--surface))',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        color: 'var(--text)',
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        backdropFilter: 'blur(8px)',
      }}
    >
      <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} aria-hidden style={{ flexShrink: 0 }}>
        <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke="var(--surface-2)" strokeWidth={3} />
        <circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
          style={{ transition: 'stroke-dashoffset 0.6s linear' }}
        />
      </svg>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{mm}:{ss}</span>
        <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {isPaused(state) ? 'Paused' : phaseLabel(state.phase).replace(/^[^\w]+/, '')}
        </span>
      </span>
    </button>
  );
}
