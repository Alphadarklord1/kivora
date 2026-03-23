'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Achievement } from '@/lib/gamification/index';

// ── Types ──────────────────────────────────────────────────────────────────

interface ToastEntry {
  achievement: Achievement;
  id:          number;
}

// ── Hook ───────────────────────────────────────────────────────────────────

let _toastCounter = 0;

export function useAchievementToast() {
  const [queue,   setQueue]   = useState<ToastEntry[]>([]);
  const [visible, setVisible] = useState<ToastEntry | null>(null);
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When a new item enters the queue and nothing is visible, show it
  useEffect(() => {
    if (visible || queue.length === 0) return;

    const next = queue[0];
    setQueue(q => q.slice(1));
    setVisible(next);

    timerRef.current = setTimeout(() => {
      setVisible(null);
    }, 4000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [queue, visible]);

  const show = useCallback((achievement: Achievement) => {
    setQueue(q => [...q, { achievement, id: ++_toastCounter }]);
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(null);
  }, []);

  const toastJsx = visible ? (
    <AchievementToastUI entry={visible} onDismiss={dismiss} />
  ) : null;

  return { show, toastJsx };
}

// ── UI component ───────────────────────────────────────────────────────────

interface AchievementToastUIProps {
  entry:     ToastEntry;
  onDismiss: () => void;
}

function AchievementToastUI({ entry, onDismiss }: AchievementToastUIProps) {
  const [exiting, setExiting] = useState(false);

  // Animate out before the parent clears it
  function handleDismiss() {
    setExiting(true);
    setTimeout(onDismiss, 300);
  }

  return (
    <div
      className={`achievement-toast${exiting ? ' achievement-toast-exit' : ''}`}
      role="alert"
      aria-live="polite"
    >
      <div className="achievement-toast-icon">{entry.achievement.icon}</div>

      <div className="achievement-toast-body">
        <div className="achievement-toast-label">Achievement unlocked!</div>
        <div className="achievement-toast-title">{entry.achievement.title}</div>
        <div className="achievement-toast-desc">{entry.achievement.description}</div>
      </div>

      <div className="achievement-toast-xp">+{entry.achievement.xp} XP</div>

      <button
        className="achievement-toast-close"
        onClick={handleDismiss}
        aria-label="Dismiss"
      >
        ×
      </button>

      {/* Progress bar that depletes over 4 s */}
      <div className="achievement-toast-progress" />

      <style jsx>{`
        .achievement-toast {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9999;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 16px 14px 14px;
          background: var(--bg-2, #1e1e2e);
          border: 1px solid var(--border-2, rgba(255,255,255,0.12));
          border-radius: 14px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.35);
          max-width: 320px;
          min-width: 260px;
          animation: toast-slide-in 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards;
          overflow: hidden;
        }

        .achievement-toast-exit {
          animation: toast-slide-out 0.3s ease-in forwards;
        }

        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }

        @keyframes toast-slide-out {
          from { opacity: 1; transform: translateY(0)    scale(1);    }
          to   { opacity: 0; transform: translateY(12px) scale(0.95); }
        }

        .achievement-toast-icon {
          font-size: 28px;
          line-height: 1;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .achievement-toast-body {
          flex: 1;
          min-width: 0;
        }

        .achievement-toast-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--accent, #4f86f7);
          margin-bottom: 2px;
        }

        .achievement-toast-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary, #e8eaf6);
          line-height: 1.2;
        }

        .achievement-toast-desc {
          font-size: 11px;
          color: var(--text-3, rgba(255,255,255,0.5));
          margin-top: 3px;
          line-height: 1.4;
        }

        .achievement-toast-xp {
          font-size: 13px;
          font-weight: 800;
          color: #f7c948;
          flex-shrink: 0;
          align-self: center;
          white-space: nowrap;
        }

        .achievement-toast-close {
          position: absolute;
          top: 8px;
          right: 8px;
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-3, rgba(255,255,255,0.4));
          font-size: 16px;
          line-height: 1;
          padding: 2px 4px;
          border-radius: 4px;
          transition: color 0.15s;
        }

        .achievement-toast-close:hover {
          color: var(--text-primary, #e8eaf6);
        }

        .achievement-toast-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 3px;
          width: 100%;
          background: var(--accent, #4f86f7);
          border-radius: 0 0 14px 14px;
          transform-origin: left center;
          animation: toast-progress 4s linear forwards;
        }

        @keyframes toast-progress {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
}
