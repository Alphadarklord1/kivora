'use client';

import { useStudyTimer } from '@/lib/planner/timer-store';
import { StudyPlan } from '@/hooks/useStudyPlans';
import { useI18n } from '@/lib/i18n/useI18n';

interface PlanTimerProps {
  plan: StudyPlan | null;
  onBack: () => void;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function PlanTimer({ plan, onBack }: PlanTimerProps) {
  const { t } = useI18n({
    'Back to Schedule': 'العودة إلى الجدول',
    'Break Time': 'وقت الاستراحة',
    'Study Session': 'جلسة دراسة',
    '{count} sessions completed': 'تم إكمال {count} جلسات',
    ' (long break)': ' (استراحة طويلة)',
    ' (short break)': ' (استراحة قصيرة)',
    Pause: 'إيقاف مؤقت',
    Resume: 'استئناف',
    Start: 'بدء',
    Reset: 'إعادة تعيين',
    Duration: 'المدة',
    'Day {n}': 'اليوم {n}',
    '{count} topics': '{count} موضوعات',
    learn: 'تعلّم',
    practice: 'تدرّب',
    review: 'راجع',
  });
  const timer = useStudyTimer();

  const dayIndex = timer.currentDayIndex;
  const currentDay = plan?.schedule?.days?.[dayIndex ?? -1] ?? null;

  const presets = [
    { label: '25m', value: 25 * 60 },
    { label: '45m', value: 45 * 60 },
    { label: '60m', value: 60 * 60 },
  ];

  return (
    <div className="plan-timer">
      <button className="back-btn" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        {t('Back to Schedule')}
      </button>

      <div className={`timer-container ${timer.breakMode ? 'break' : ''}`}>
        <span className="timer-label">{timer.breakMode ? t('Break Time') : t('Study Session')}</span>
        <div className="timer-display">{formatTime(timer.seconds)}</div>
        <span className="timer-sessions">
          {t('{count} sessions completed', { count: timer.sessionsCompleted })}
          {timer.breakMode && (timer.sessionsCompleted % 4 === 0 ? t(' (long break)') : t(' (short break)'))}
        </span>
      </div>

      <div className="timer-controls">
        {timer.isRunning ? (
          <button className="control-btn pause" onClick={timer.pauseTimer}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            {t('Pause')}
          </button>
        ) : (
          <button className="control-btn start" onClick={timer.resumeTimer}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            {timer.seconds < timer.duration ? t('Resume') : t('Start')}
          </button>
        )}
        <button className="control-btn reset" onClick={timer.resetTimer}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          {t('Reset')}
        </button>
      </div>

      <div className="presets">
        <span className="presets-label">{t('Duration')}</span>
        <div className="preset-btns">
          {presets.map(p => (
            <button
              key={p.label}
              className={`preset-btn ${timer.duration === p.value ? 'active' : ''}`}
              onClick={() => timer.setDuration(p.value)}
              disabled={timer.isRunning}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {currentDay && (
        <div className="day-info">
          <h4>{t('Day {n}', { n: currentDay.dayNumber })} — {t('{count} topics', { count: currentDay.topics.length })}</h4>
          <div className="day-topics-list">
            {currentDay.topics.map((topic, i) => (
              <div key={i} className="timer-topic">
                <span className="timer-topic-name">{topic.name}</span>
                <span className={`task-badge ${topic.tasks[0]}`}>{t(topic.tasks[0])}</span>
                <span className="timer-topic-dur">{topic.duration}m</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .plan-timer {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-5);
          padding: var(--space-4) 0;
        }
        .back-btn {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          align-self: flex-start;
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: var(--font-meta);
          color: var(--text-muted);
          padding: var(--space-1) 0;
        }
        .back-btn:hover { color: var(--text-primary); }

        .timer-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-6);
          border-radius: var(--radius-lg);
          background: var(--bg-inset);
          width: 100%;
          max-width: 360px;
          transition: background 0.3s;
        }
        .timer-container.break {
          background: color-mix(in srgb, var(--success) 10%, var(--bg-inset));
        }
        .timer-label {
          font-size: var(--font-meta);
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .timer-display {
          font-size: 64px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: var(--text-primary);
          line-height: 1;
        }
        .timer-sessions {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .timer-controls {
          display: flex;
          gap: var(--space-3);
        }
        .control-btn {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-3) var(--space-5);
          border: none;
          border-radius: var(--radius-md);
          cursor: pointer;
          font-size: var(--font-body);
          font-weight: 600;
          transition: var(--transition-fast);
        }
        .control-btn.start {
          background: var(--primary);
          color: white;
        }
        .control-btn.start:hover { background: var(--primary-hover); }
        .control-btn.pause {
          background: var(--warning);
          color: white;
        }
        .control-btn.reset {
          background: var(--bg-inset);
          color: var(--text-secondary);
          border: 1px solid var(--border-subtle);
        }
        .control-btn.reset:hover { background: var(--bg-hover, var(--bg-inset)); }

        .presets {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .presets-label {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }
        .preset-btns {
          display: flex;
          gap: var(--space-1);
          background: var(--bg-inset);
          border-radius: var(--radius-sm);
          padding: 2px;
        }
        .preset-btn {
          padding: var(--space-1) var(--space-3);
          border: none;
          border-radius: var(--radius-sm);
          background: transparent;
          cursor: pointer;
          font-size: var(--font-meta);
          font-weight: 500;
          color: var(--text-muted);
          transition: var(--transition-fast);
        }
        .preset-btn.active {
          background: var(--bg-surface);
          color: var(--text-primary);
          box-shadow: 0 1px 2px rgba(0,0,0,0.06);
        }
        .preset-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .day-info {
          width: 100%;
          max-width: 360px;
          padding: var(--space-3);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        }
        .day-info h4 {
          font-size: var(--font-meta);
          font-weight: 600;
          margin: 0 0 var(--space-2) 0;
        }
        .day-topics-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }
        .timer-topic {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .timer-topic-name {
          flex: 1;
          font-size: var(--font-meta);
          color: var(--text-primary);
        }
        .task-badge {
          display: inline-block;
          padding: 1px 6px;
          border-radius: var(--radius-sm);
          font-size: 10px;
          font-weight: 500;
        }
        .task-badge.learn { background: var(--primary-muted); color: var(--primary); }
        .task-badge.practice { background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning); }
        .task-badge.review { background: color-mix(in srgb, var(--success) 15%, transparent); color: var(--success); }
        .timer-topic-dur {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        @media (max-width: 600px) {
          .timer-display { font-size: 48px; }
          .timer-container { padding: var(--space-4); }
        }
      `}</style>
    </div>
  );
}
