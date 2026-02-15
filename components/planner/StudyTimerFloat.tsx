'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStudyTimer } from '@/lib/planner/timer-store';
import { useI18n } from '@/lib/i18n/useI18n';

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function StudyTimerFloat() {
  const { t } = useI18n({
    'Expand timer': 'توسيع المؤقت',
    'Study Session': 'جلسة دراسة',
    Minimize: 'تصغير',
    'Stop timer': 'إيقاف المؤقت',
    'Go to Planner': 'الانتقال إلى المخطط',
    Break: 'استراحة',
    Study: 'دراسة',
  });
  const timer = useStudyTimer();
  const router = useRouter();
  const [minimized, setMinimized] = useState(false);

  if (!timer.isActive) return null;

  if (minimized) {
    return (
      <>
        <button className="float-mini" onClick={() => setMinimized(false)} title={t('Expand timer')}>
          <span className={`mini-dot ${timer.isRunning ? 'running' : 'paused'} ${timer.breakMode ? 'break' : ''}`} />
          <span className="mini-time">{formatTime(timer.seconds)}</span>
        </button>
        <style jsx>{`
          .float-mini {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 999;
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-full);
            background: var(--bg-surface);
            box-shadow: 0 4px 12px rgba(0,0,0,0.12);
            cursor: pointer;
            transition: var(--transition-fast);
          }
          .float-mini:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.18); }
          .mini-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--primary);
          }
          .mini-dot.running { animation: blink 1.5s ease-in-out infinite; }
          .mini-dot.paused { background: var(--warning); }
          .mini-dot.break { background: var(--success); }
          @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
          .mini-time {
            font-size: 13px;
            font-weight: 600;
            font-variant-numeric: tabular-nums;
            color: var(--text-primary);
          }
          @media (max-width: 768px) {
            .float-mini { bottom: 80px; }
          }
        `}</style>
      </>
    );
  }

  return (
    <>
      <div className="float-card">
        <div className="float-header">
          <span className="float-title" title={timer.currentPlanTitle}>
            {timer.currentPlanTitle || t('Study Session')}
          </span>
          <div className="float-header-actions">
            <button className="float-icon-btn" onClick={() => setMinimized(true)} title={t('Minimize')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button className="float-icon-btn close" onClick={timer.clearTimer} title={t('Stop timer')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div className={`float-body ${timer.breakMode ? 'break' : ''}`} onClick={() => router.push('/planner')} title={t('Go to Planner')}>
          <span className="float-time">{formatTime(timer.seconds)}</span>
          <span className={`float-mode ${timer.breakMode ? 'break' : 'study'}`}>
            {timer.breakMode ? t('Break') : t('Study')}
          </span>
        </div>

        <div className="float-controls">
          {timer.isRunning ? (
            <button className="float-ctrl-btn" onClick={timer.pauseTimer}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            </button>
          ) : (
            <button className="float-ctrl-btn play" onClick={timer.resumeTimer}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
          )}
          <button className="float-ctrl-btn" onClick={timer.resetTimer}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          </button>
        </div>
      </div>

      <style jsx>{`
        .float-card {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 999;
          width: 200px;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          background: var(--bg-surface);
          box-shadow: 0 8px 24px rgba(0,0,0,0.14);
          overflow: hidden;
        }
        .float-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 10px;
          background: var(--bg-inset);
          border-bottom: 1px solid var(--border-subtle);
        }
        .float-title {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 120px;
        }
        .float-header-actions {
          display: flex;
          gap: 2px;
        }
        .float-icon-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: var(--radius-sm);
          color: var(--text-muted);
        }
        .float-icon-btn:hover { background: var(--bg-hover, var(--bg-inset)); color: var(--text-primary); }
        .float-icon-btn.close:hover { color: var(--error); }

        .float-body {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          padding: 12px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .float-body:hover { background: var(--bg-inset); }
        .float-body.break { background: color-mix(in srgb, var(--success) 8%, transparent); }
        .float-time {
          font-size: 24px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: var(--text-primary);
          line-height: 1;
        }
        .float-mode {
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          font-size: 10px;
          font-weight: 600;
        }
        .float-mode.study { background: var(--primary-muted); color: var(--primary); }
        .float-mode.break { background: color-mix(in srgb, var(--success) 15%, transparent); color: var(--success); }

        .float-controls {
          display: flex;
          justify-content: center;
          gap: var(--space-2);
          padding: 6px;
          border-top: 1px solid var(--border-subtle);
        }
        .float-ctrl-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 28px;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          background: transparent;
          cursor: pointer;
          color: var(--text-secondary);
          transition: var(--transition-fast);
        }
        .float-ctrl-btn:hover { border-color: var(--primary); color: var(--primary); }
        .float-ctrl-btn.play { background: var(--primary); color: white; border-color: var(--primary); }
        .float-ctrl-btn.play:hover { background: var(--primary-hover); }

        @media (max-width: 768px) {
          .float-card { bottom: 80px; }
        }
      `}</style>
    </>
  );
}
