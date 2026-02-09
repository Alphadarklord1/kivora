'use client';

import { useEffect, useMemo, useState } from 'react';

interface FocusTimerProps {
  initialMinutes?: number;
}

export function FocusTimer({ initialMinutes = 25 }: FocusTimerProps) {
  const [minutes, setMinutes] = useState(initialMinutes);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setSeconds(prev => {
        if (prev > 0) return prev - 1;
        setMinutes(m => {
          if (m > 0) return m - 1;
          setRunning(false);
          return 0;
        });
        return 59;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  const progress = useMemo(() => {
    const total = initialMinutes * 60;
    const remaining = minutes * 60 + seconds;
    return Math.max(0, Math.min(100, ((total - remaining) / total) * 100));
  }, [initialMinutes, minutes, seconds]);

  const reset = () => {
    setMinutes(initialMinutes);
    setSeconds(0);
    setRunning(false);
  };

  return (
    <div className="focus-timer">
      <div className="focus-header">
        <span className="focus-title">Focus Mode</span>
        <span className={`focus-dot ${running ? 'active' : ''}`} aria-label={running ? 'Running' : 'Idle'} />
      </div>

      <div className={`focus-time ${running ? 'running' : ''}`}>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </div>
      <div className="focus-bar">
        <div className="focus-bar-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="focus-actions">
        <button className={`focus-btn primary ${running ? 'running' : ''}`} onClick={() => setRunning(prev => !prev)}>
          {running ? 'Pause' : 'Start'}
        </button>
        <button className="focus-btn ghost" onClick={reset}>
          Reset
        </button>
      </div>

      <style jsx>{`
        .focus-timer {
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          padding: var(--space-4);
          box-shadow: var(--shadow-sm);
          min-width: 200px;
          transition: box-shadow 0.2s ease, transform 0.2s ease;
        }

        .focus-timer:hover {
          box-shadow: var(--shadow-md);
          transform: translateY(-1px);
        }

        .focus-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-2);
        }

        .focus-title {
          font-size: var(--font-body);
          font-weight: 600;
        }

        .focus-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--border-strong);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--bg-hover) 72%, transparent);
          transition: all 0.2s ease;
        }

        .focus-dot.active {
          background: var(--primary);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 20%, transparent);
        }

        .focus-time {
          font-size: clamp(30px, 3vw, 36px);
          font-weight: 700;
          letter-spacing: 0.03em;
          margin-bottom: var(--space-3);
          line-height: 1;
          transition: color 0.2s ease;
        }

        .focus-time.running {
          color: var(--primary);
          animation: timer-pulse 1.8s ease-in-out infinite;
        }

        .focus-bar {
          height: 8px;
          background: var(--bg-inset);
          border-radius: var(--radius-full);
          overflow: hidden;
          margin-bottom: var(--space-3);
        }

        .focus-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, color-mix(in srgb, var(--primary) 90%, white), var(--primary));
          transition: width 0.2s ease, filter 0.2s ease;
          filter: saturate(1.1);
        }

        .focus-actions {
          display: flex;
          gap: var(--space-2);
        }

        .focus-btn {
          min-height: 34px;
          padding: 0 var(--space-3);
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          color: var(--text-secondary);
          font-size: var(--font-meta);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .focus-btn:hover {
          border-color: var(--border-default);
          color: var(--text-primary);
          background: var(--bg-hover);
        }

        .focus-btn.primary {
          background: var(--primary);
          border-color: color-mix(in srgb, var(--primary) 60%, var(--border-default));
          color: white;
        }

        .focus-btn.primary:hover {
          background: var(--primary-hover);
          color: white;
        }

        .focus-btn.primary.running {
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 30%, transparent), 0 0 18px color-mix(in srgb, var(--primary) 35%, transparent);
        }

        .focus-btn.ghost {
          background: transparent;
          border-color: var(--border-default);
          color: var(--text-muted);
        }

        .focus-btn.ghost:hover {
          color: var(--text-primary);
          background: var(--bg-inset);
        }

        .focus-btn:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--primary) 72%, transparent);
          outline-offset: 2px;
        }

        .focus-btn:active {
          transform: scale(0.98);
        }

        @keyframes timer-pulse {
          0% { opacity: 1; }
          50% { opacity: 0.8; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
