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
        setMinutes(m => (m > 0 ? m - 1 : 0));
        return 59;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (minutes === 0 && seconds === 0) {
      setRunning(false);
    }
  }, [minutes, seconds]);

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
        <span className={`focus-status ${running ? 'active' : ''}`}>
          {running ? 'In Session' : 'Ready'}
        </span>
      </div>

      <div className="focus-time">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </div>
      <div className="focus-bar">
        <div className="focus-bar-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="focus-actions">
        <button className="btn small" onClick={() => setRunning(prev => !prev)}>
          {running ? 'Pause' : 'Start'}
        </button>
        <button className="btn small secondary" onClick={reset}>
          Reset
        </button>
      </div>

      <style jsx>{`
        .focus-timer {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: var(--space-3);
          box-shadow: var(--shadow-sm);
          min-width: 200px;
        }

        .focus-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-2);
        }

        .focus-title {
          font-size: var(--font-meta);
          font-weight: 600;
        }

        .focus-status {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          background: var(--bg-inset);
          padding: 2px 8px;
          border-radius: var(--radius-full);
        }

        .focus-status.active {
          color: var(--primary);
          background: rgba(37, 99, 235, 0.12);
        }

        .focus-time {
          font-size: var(--font-xl);
          font-weight: 700;
          letter-spacing: 0.04em;
          margin-bottom: var(--space-2);
        }

        .focus-bar {
          height: 6px;
          background: var(--bg-inset);
          border-radius: var(--radius-full);
          overflow: hidden;
          margin-bottom: var(--space-2);
        }

        .focus-bar-fill {
          height: 100%;
          background: var(--primary);
          transition: width 0.2s ease;
        }

        .focus-actions {
          display: flex;
          gap: var(--space-2);
        }
      `}</style>
    </div>
  );
}
