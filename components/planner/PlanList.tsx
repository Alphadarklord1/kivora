'use client';

import { StudyPlan } from '@/hooks/useStudyPlans';
import { useState } from 'react';
import { formatScheduleDate } from '@/lib/planner/generate';

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
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = filter === 'all' ? plans : plans.filter(p => p.status === filter);
  const activePlans = plans.filter(p => p.status === 'active').length;
  const completedPlans = plans.filter(p => p.status === 'completed').length;

  return (
    <div className="plan-list">
      <div className="plan-list-header">
        <h3>Study Plans</h3>
        <button className="new-plan-btn" onClick={onNewPlan} title="Create new plan">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      <div className="filter-tabs">
        <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          All ({plans.length})
        </button>
        <button className={`filter-tab ${filter === 'active' ? 'active' : ''}`} onClick={() => setFilter('active')}>
          Active ({activePlans})
        </button>
        <button className={`filter-tab ${filter === 'completed' ? 'active' : ''}`} onClick={() => setFilter('completed')}>
          Done ({completedPlans})
        </button>
      </div>

      {loading ? (
        <div className="plan-list-loading">
          {[1, 2, 3].map(i => <div key={i} className="skeleton-card" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="plan-list-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <p>{filter === 'all' ? 'No plans yet' : `No ${filter} plans`}</p>
        </div>
      ) : (
        <div className="plans-scroll">
          {filtered.map(plan => (
            <button
              key={plan.id}
              className={`plan-card ${selectedPlanId === plan.id ? 'selected' : ''}`}
              onClick={() => onSelectPlan(plan)}
            >
              <div className="plan-card-header">
                <span className="plan-title">{plan.title}</span>
                <span className={`status-dot ${plan.status}`} title={plan.status} />
              </div>
              <div className="plan-meta">
                <span className="plan-date">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {formatScheduleDate(plan.examDate)}
                </span>
                <span className="plan-topics">{plan.topics.length} topics</span>
              </div>
              <div className="plan-progress-bar">
                <div className="plan-progress-fill" style={{ width: `${plan.progress}%` }} />
              </div>
              <span className="plan-progress-text">{plan.progress}%</span>
            </button>
          ))}
        </div>
      )}

      <style jsx>{`
        .plan-list {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .plan-list-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-3);
        }
        .plan-list-header h3 {
          font-size: var(--font-body);
          font-weight: 600;
          margin: 0;
        }
        .new-plan-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          background: transparent;
          cursor: pointer;
          color: var(--text-secondary);
          transition: var(--transition-fast);
        }
        .new-plan-btn:hover {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }
        .filter-tabs {
          display: flex;
          gap: 2px;
          background: var(--bg-inset);
          border-radius: var(--radius-sm);
          padding: 2px;
          margin-bottom: var(--space-3);
        }
        .filter-tab {
          flex: 1;
          padding: var(--space-1) var(--space-2);
          border: none;
          background: transparent;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: var(--font-tiny);
          font-weight: 500;
          color: var(--text-muted);
          transition: var(--transition-fast);
          white-space: nowrap;
        }
        .filter-tab.active {
          background: var(--bg-surface);
          color: var(--text-primary);
          box-shadow: 0 1px 2px rgba(0,0,0,0.06);
        }
        .plan-list-loading {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .skeleton-card {
          height: 80px;
          border-radius: var(--radius-md);
          background: var(--bg-inset);
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .plan-list-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-6) var(--space-2);
          color: var(--text-muted);
          font-size: var(--font-meta);
        }
        .plans-scroll {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          overflow-y: auto;
          flex: 1;
        }
        .plan-card {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
          padding: var(--space-3);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: transparent;
          cursor: pointer;
          text-align: left;
          transition: var(--transition-fast);
          width: 100%;
        }
        .plan-card:hover {
          border-color: var(--border-default);
          background: var(--bg-inset);
        }
        .plan-card.selected {
          border-color: var(--primary);
          background: var(--primary-muted);
        }
        .plan-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
        }
        .plan-title {
          font-size: var(--font-meta);
          font-weight: 600;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .status-dot.active { background: var(--success); }
        .status-dot.completed { background: var(--primary); }
        .status-dot.paused { background: var(--warning); }
        .plan-meta {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }
        .plan-date {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .plan-progress-bar {
          height: 3px;
          border-radius: 2px;
          background: var(--bg-inset);
          overflow: hidden;
        }
        .plan-progress-fill {
          height: 100%;
          border-radius: 2px;
          background: var(--primary);
          transition: width 0.3s;
        }
        .plan-progress-text {
          font-size: 10px;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
