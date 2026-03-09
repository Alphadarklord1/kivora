'use client';

import { StudyPlan } from '@/hooks/useStudyPlans';
import { useMemo, useState } from 'react';
import { formatScheduleDate } from '@/lib/planner/generate';
import { useI18n } from '@/lib/i18n/useI18n';

interface PlanListProps {
  plans: StudyPlan[];
  loading: boolean;
  selectedPlanId: string | null;
  onSelectPlan: (plan: StudyPlan) => void;
  onNewPlan: () => void;
  onDeletePlan: (planId: string) => void;
}

type Filter = 'all' | 'active' | 'completed';

export function PlanList({ plans, loading, selectedPlanId, onSelectPlan, onNewPlan, onDeletePlan }: PlanListProps) {
  const { t, locale, formatNumber } = useI18n({
    'Study Plans': 'خطط الدراسة',
    'Calendar view': 'عرض التقويم',
    'Create new plan': 'إنشاء خطة جديدة',
    All: 'الكل',
    Active: 'نشطة',
    Done: 'منتهية',
    'No plans yet': 'لا توجد خطط بعد',
    'No {filter} plans': 'لا توجد خطط {filter}',
    active: 'نشطة',
    completed: 'منتهية',
    paused: 'متوقفة',
    '{count} topics': '{count} موضوعات',
    '{count}% complete': 'مكتمل بنسبة {count}%',
    '{count}m/day': '{count} دقيقة/يوم',
    'Delete plan': 'حذف الخطة',
    Exam: 'الاختبار',
    Today: 'اليوم',
  });
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    return filter === 'all' ? plans : plans.filter((p) => p.status === filter);
  }, [filter, plans]);

  const activePlans = plans.filter((p) => p.status === 'active').length;
  const completedPlans = plans.filter((p) => p.status === 'completed').length;

  return (
    <div className="plan-list">
      <div className="plan-rail-header">
        <div>
          <p className="eyebrow">{t('Calendar view')}</p>
          <h3>{t('Study Plans')}</h3>
        </div>
        <button className="new-plan-btn" onClick={onNewPlan} title={t('Create new plan')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      <div className="filter-tabs">
        <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          {t('All')} <span>{formatNumber(plans.length)}</span>
        </button>
        <button className={`filter-tab ${filter === 'active' ? 'active' : ''}`} onClick={() => setFilter('active')}>
          {t('Active')} <span>{formatNumber(activePlans)}</span>
        </button>
        <button className={`filter-tab ${filter === 'completed' ? 'active' : ''}`} onClick={() => setFilter('completed')}>
          {t('Done')} <span>{formatNumber(completedPlans)}</span>
        </button>
      </div>

      {loading ? (
        <div className="plan-list-loading">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton-card" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="plan-list-empty">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <p>{filter === 'all' ? t('No plans yet') : t('No {filter} plans', { filter: t(filter) })}</p>
        </div>
      ) : (
        <div className="plans-scroll">
          {filtered.map((plan) => {
            const examDate = new Date(plan.examDate);
            const isToday = examDate.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];

            return (
              <button
                key={plan.id}
                className={`plan-card ${selectedPlanId === plan.id ? 'selected' : ''}`}
                onClick={() => onSelectPlan(plan)}
              >
                <div className="plan-card-header">
                  <div>
                    <span className="plan-title">{plan.title}</span>
                    <div className="plan-subtitle">
                      <span className={`status-dot ${plan.status}`} />
                      {t(plan.status)}
                    </div>
                  </div>
                  <button
                    className="delete-plan-btn"
                    title={t('Delete plan')}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeletePlan(plan.id);
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </div>

                <div className="plan-meta-grid">
                  <div>
                    <span className="meta-label">{t('Exam')}</span>
                    <span className="meta-value">{formatScheduleDate(plan.examDate, locale)}</span>
                  </div>
                  <div>
                    <span className="meta-label">{t('{count} topics', { count: plan.topics.length })}</span>
                    <span className="meta-value">{t('{count}m/day', { count: plan.dailyMinutes })}</span>
                  </div>
                </div>

                <div className="plan-progress-row">
                  <div className="plan-progress-bar">
                    <div className="plan-progress-fill" style={{ width: `${plan.progress}%` }} />
                  </div>
                  <span className="plan-progress-text">{t('{count}% complete', { count: plan.progress })}</span>
                </div>

                {isToday && <span className="today-chip">{t('Today')}</span>}
              </button>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .plan-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          height: 100%;
        }
        .plan-rail-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-3);
        }
        .eyebrow {
          margin: 0 0 6px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-muted);
        }
        .plan-rail-header h3 {
          font-size: var(--font-lg);
          margin: 0;
        }
        .new-plan-btn,
        .delete-plan-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-surface);
          color: var(--text-secondary);
          cursor: pointer;
          transition: var(--transition-fast);
        }
        .new-plan-btn {
          width: 36px;
          height: 36px;
        }
        .new-plan-btn:hover {
          background: var(--primary);
          border-color: var(--primary);
          color: white;
        }
        .delete-plan-btn {
          width: 28px;
          height: 28px;
          opacity: 0;
        }
        .delete-plan-btn:hover {
          color: var(--danger);
          border-color: color-mix(in srgb, var(--danger) 40%, var(--border-subtle));
        }
        .filter-tabs {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          padding: 6px;
          border-radius: var(--radius-lg);
          background: var(--bg-inset);
        }
        .filter-tab {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
          border: none;
          border-radius: var(--radius-md);
          background: transparent;
          color: var(--text-muted);
          font-size: var(--font-tiny);
          padding: var(--space-2) var(--space-3);
          cursor: pointer;
          transition: var(--transition-fast);
        }
        .filter-tab.active {
          background: var(--bg-surface);
          color: var(--text-primary);
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1);
        }
        .plan-list-loading,
        .plans-scroll {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          flex: 1;
          overflow-y: auto;
          padding-right: 2px;
        }
        .skeleton-card {
          height: 104px;
          border-radius: var(--radius-lg);
          background: linear-gradient(90deg, var(--bg-inset), color-mix(in srgb, var(--bg-elevated) 60%, var(--bg-inset)), var(--bg-inset));
          background-size: 200% 100%;
          animation: pulse-slide 1.6s ease infinite;
        }
        @keyframes pulse-slide {
          0% { background-position: 0% 0; }
          100% { background-position: -200% 0; }
        }
        .plan-list-empty {
          display: grid;
          place-items: center;
          gap: var(--space-2);
          border: 1px dashed var(--border-subtle);
          border-radius: var(--radius-lg);
          min-height: 220px;
          color: var(--text-muted);
          text-align: center;
          padding: var(--space-5);
        }
        .plan-card {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          width: 100%;
          text-align: start;
          border: 1px solid var(--border-subtle);
          border-radius: 20px;
          background: linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 92%, white 8%), var(--bg-surface));
          padding: var(--space-4);
          cursor: pointer;
          transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
          position: relative;
        }
        .plan-card:hover {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--primary) 40%, var(--border-subtle));
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
        }
        .plan-card:hover .delete-plan-btn,
        .plan-card.selected .delete-plan-btn {
          opacity: 1;
        }
        .plan-card.selected {
          border-color: color-mix(in srgb, var(--primary) 45%, var(--border-subtle));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 22%, transparent), 0 16px 36px rgba(37, 99, 235, 0.12);
        }
        .plan-card-header,
        .plan-progress-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
        }
        .plan-title {
          display: block;
          font-size: var(--font-body);
          font-weight: var(--weight-semibold);
          color: var(--text-primary);
        }
        .plan-subtitle {
          margin-top: 6px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: var(--font-tiny);
          color: var(--text-muted);
          text-transform: capitalize;
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
        }
        .status-dot.active { background: var(--success); }
        .status-dot.completed { background: var(--primary); }
        .status-dot.paused { background: var(--warning); }
        .plan-meta-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--space-2);
        }
        .meta-label,
        .plan-progress-text {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }
        .meta-label {
          display: block;
          margin-bottom: 4px;
        }
        .meta-value {
          display: block;
          font-size: var(--font-meta);
          color: var(--text-primary);
          font-weight: var(--weight-medium);
        }
        .plan-progress-bar {
          flex: 1;
          height: 8px;
          border-radius: 999px;
          background: var(--bg-inset);
          overflow: hidden;
        }
        .plan-progress-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, var(--primary), color-mix(in srgb, var(--primary) 50%, white 50%));
        }
        .today-chip {
          position: absolute;
          top: var(--space-3);
          inset-inline-end: 44px;
          padding: 2px 10px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--success) 15%, transparent);
          color: var(--success);
          font-size: 10px;
          font-weight: var(--weight-semibold);
        }
        @media (max-width: 720px) {
          .plan-meta-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
