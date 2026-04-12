'use client';

import { useState, useEffect } from 'react';
import { getGamificationState, type GamificationState } from '@/lib/gamification/index';

interface LevelBadgeProps {
  compact?: boolean;
}

export function LevelBadge({ compact = false }: LevelBadgeProps) {
  const [state, setState] = useState<GamificationState | null>(() => {
    if (typeof window === 'undefined') return null;
    return getGamificationState();
  });

  useEffect(() => {
    // Re-sync whenever another tab/window writes to storage
    function onStorage(e: StorageEvent) {
      if (e.key?.startsWith('kivora-gamification')) {
        setState(getGamificationState());
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  if (!state) return null;

  // ── Compact pill ─────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className="level-badge-compact" title={`${state.levelTitle} — ${state.xp} XP`}>
        <span className="level-badge-compact-star">⭐</span>
        <span className="level-badge-compact-text">Lv.{state.level}</span>

        <style jsx>{`
          .level-badge-compact {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            border-radius: 20px;
            background: linear-gradient(135deg, var(--accent, #4f86f7) 0%, #7c53e8 100%);
            color: #fff;
            font-size: 11px;
            font-weight: 700;
            cursor: default;
            user-select: none;
            white-space: nowrap;
          }

          .level-badge-compact-star {
            font-size: 12px;
            line-height: 1;
          }

          .level-badge-compact-text {
            line-height: 1;
          }
        `}</style>
      </div>
    );
  }

  // ── Full badge with XP bar ────────────────────────────────────────────────
  const progressPct = Math.round(state.xpProgress * 100);

  return (
    <div className="level-badge-full">
      <div className="level-badge-header">
        <div className="level-badge-pill">
          <span className="level-badge-star">⭐</span>
          <span className="level-badge-lv">Lv.{state.level}</span>
          <span className="level-badge-title">{state.levelTitle}</span>
        </div>
        <div className="level-badge-xp-count">
          {state.xp.toLocaleString()} XP
        </div>
      </div>

      <div className="level-badge-bar-track" title={`${progressPct}% to next level`}>
        <div
          className="level-badge-bar-fill"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {state.xpToNextLevel > 0 ? (
        <div className="level-badge-next">
          {state.xpToNextLevel.toLocaleString()} XP to next level
        </div>
      ) : (
        <div className="level-badge-next level-badge-max">Max level reached!</div>
      )}

      <style jsx>{`
        .level-badge-full {
          padding: 16px 18px;
          background: var(--bg-2, rgba(255,255,255,0.04));
          border: 1px solid var(--border-2, rgba(255,255,255,0.1));
          border-radius: 12px;
        }

        .level-badge-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .level-badge-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 20px;
          background: linear-gradient(135deg, var(--accent, #4f86f7) 0%, #7c53e8 100%);
          color: #fff;
          font-weight: 700;
        }

        .level-badge-star {
          font-size: 14px;
          line-height: 1;
        }

        .level-badge-lv {
          font-size: 13px;
          line-height: 1;
        }

        .level-badge-title {
          font-size: 13px;
          line-height: 1;
        }

        .level-badge-xp-count {
          font-size: 13px;
          font-weight: 700;
          color: #f7c948;
        }

        .level-badge-bar-track {
          height: 8px;
          border-radius: 4px;
          background: var(--border-2, rgba(255,255,255,0.1));
          overflow: hidden;
        }

        .level-badge-bar-fill {
          height: 100%;
          border-radius: 4px;
          background: linear-gradient(90deg, var(--accent, #4f86f7) 0%, #7c53e8 100%);
          transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          min-width: 4px;
        }

        .level-badge-next {
          margin-top: 5px;
          font-size: 11px;
          color: var(--text-3, rgba(255,255,255,0.45));
          text-align: right;
        }

        .level-badge-max {
          color: #f7c948;
        }
      `}</style>
    </div>
  );
}
