'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStudyPlans, StudyPlan } from '@/hooks/useStudyPlans';
import { useStudyTimer } from '@/lib/planner/timer-store';
import { generateStudySchedule, GeneratedSchedule, StudyTopic } from '@/lib/planner/generate';
import { PlanList, PlanForm, PlanSchedule, PlanTimer } from '@/components/planner';
import { useI18n } from '@/lib/i18n/useI18n';

type View = 'list' | 'form' | 'schedule' | 'timer';

interface PendingPlan {
  title: string;
  examDate: string;
  dailyMinutes: number;
  topics: StudyTopic[];
  folderId: string | null;
}

export default function PlannerPage() {
  const { t } = useI18n({
    'Delete this study plan?': 'حذف خطة الدراسة هذه؟',
    'Study Planner': 'مخطط الدراسة',
    'Outlook-style calendar for your next exam sprint': 'تقويم دراسي بأسلوب Outlook لسباقك التالي نحو الاختبار',
    'No Study Plans Yet': 'لا توجد خطط دراسة بعد',
    'Create your first plan to organize your study schedule with smart time allocation.': 'أنشئ خطتك الأولى لتنظيم جدول دراستك بتوزيع وقت ذكي.',
    'Create Study Plan': 'إنشاء خطة دراسة',
    'Select a plan from the sidebar or create a new one': 'اختر خطة من الشريط الجانبي أو أنشئ خطة جديدة',
    'Calendar board': 'لوحة التقويم',
    Draft: 'مسودة',
    Saved: 'محفوظة',
    'Failed to load planner data': 'تعذر تحميل بيانات المخطط',
    'Try again': 'حاول مرة أخرى',
    'New Plan': 'خطة جديدة',
    active: 'نشطة',
  });
  const { plans, loading, error, fetchPlans, createPlan, updatePlan, deletePlan, updateProgress } = useStudyPlans();
  const timer = useStudyTimer();

  const [view, setView] = useState<View>('list');
  const [selectedPlan, setSelectedPlan] = useState<StudyPlan | null>(null);
  const [generatedSchedule, setGeneratedSchedule] = useState<GeneratedSchedule | null>(null);
  const [pendingData, setPendingData] = useState<PendingPlan | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (timer.isActive && timer.currentPlanId && plans.length > 0) {
      const plan = plans.find((entry) => entry.id === timer.currentPlanId);
      if (plan) {
        setSelectedPlan(plan);
        setView('timer');
      }
    }
  }, [timer.isActive, timer.currentPlanId, plans]);

  useEffect(() => {
    setSelectedPlan((prev) => {
      if (!prev) return prev;
      const updated = plans.find((plan) => plan.id === prev.id);
      return updated || prev;
    });
  }, [plans]);

  useEffect(() => {
    if (view === 'form' || view === 'timer' || selectedPlan || plans.length === 0) return;
    setSelectedPlan(plans[0]);
    setView('schedule');
  }, [plans, selectedPlan, view]);

  const handleNewPlan = useCallback(() => {
    setSelectedPlan(null);
    setGeneratedSchedule(null);
    setPendingData(null);
    setView('form');
  }, []);

  const handleGenerate = useCallback((data: PendingPlan) => {
    const schedule = generateStudySchedule(new Date(data.examDate), data.topics, data.dailyMinutes);
    setGeneratedSchedule(schedule);
    setPendingData(data);
    setView('schedule');
  }, []);

  const handleSave = useCallback(async () => {
    if (!generatedSchedule || !pendingData) return;
    setSaving(true);
    const newPlan = await createPlan({
      title: pendingData.title,
      examDate: pendingData.examDate,
      dailyMinutes: pendingData.dailyMinutes,
      topics: pendingData.topics,
      schedule: generatedSchedule,
      folderId: pendingData.folderId,
    });
    setSaving(false);
    if (newPlan) {
      setSelectedPlan(newPlan);
      setGeneratedSchedule(null);
      setPendingData(null);
      setView('schedule');
    }
  }, [generatedSchedule, pendingData, createPlan]);

  const handleSelectPlan = useCallback((plan: StudyPlan) => {
    setSelectedPlan(plan);
    setGeneratedSchedule(null);
    setPendingData(null);
    setView('schedule');
  }, []);

  const handleToggleDay = useCallback(async (dayIndex: number) => {
    if (!selectedPlan) return;
    const schedule = { ...selectedPlan.schedule };
    const days = [...schedule.days];
    days[dayIndex] = { ...days[dayIndex], completed: !days[dayIndex].completed };
    schedule.days = days;
    await updateProgress(selectedPlan.id, schedule);
  }, [selectedPlan, updateProgress]);

  const handleSaveNotes = useCallback(async (dayIndex: number, notes: string) => {
    if (!selectedPlan) return;
    const schedule = { ...selectedPlan.schedule };
    const days = [...schedule.days];
    days[dayIndex] = { ...days[dayIndex], notes };
    schedule.days = days;
    await updatePlan(selectedPlan.id, { schedule });
  }, [selectedPlan, updatePlan]);

  const handleStartTimer = useCallback((dayIndex: number) => {
    if (!selectedPlan) return;
    timer.startTimer(selectedPlan.id, selectedPlan.title, dayIndex);
    setView('timer');
  }, [selectedPlan, timer]);

  const handleDelete = useCallback(async (planId?: string) => {
    const id = planId || selectedPlan?.id;
    if (!id) return;
    if (!confirm(t('Delete this study plan?'))) return;
    const ok = await deletePlan(id);
    if (ok) {
      if (selectedPlan?.id === id) {
        setSelectedPlan(null);
        setView('list');
      }
      if (timer.currentPlanId === id) {
        timer.clearTimer();
      }
    }
  }, [selectedPlan, deletePlan, timer, t]);

  const handleBackToSchedule = useCallback(() => {
    setView('schedule');
  }, []);

  const handleCancel = useCallback(() => {
    if (selectedPlan || generatedSchedule) {
      setView('schedule');
    } else {
      setView('list');
    }
  }, [generatedSchedule, selectedPlan]);

  const scheduleTitle = selectedPlan?.title || pendingData?.title || '';
  const activePlanCount = plans.filter((plan) => plan.status === 'active').length;
  const calendarModeLabel = generatedSchedule ? t('Draft') : t('Saved');

  return (
    <div className="planner-page">
      <div className="planner-hero">
        <div>
          <p className="planner-eyebrow">{t('Calendar board')}</p>
          <h1>{t('Study Planner')}</h1>
          <p>{t('Outlook-style calendar for your next exam sprint')}</p>
        </div>
        <div className="planner-hero-actions">
          <div className="planner-chip">{calendarModeLabel}</div>
          <div className="planner-chip muted">{activePlanCount} {t('active')}</div>
          <button className="planner-primary-btn" onClick={handleNewPlan}>{t('New Plan')}</button>
        </div>
      </div>

      {error && (
        <div className="planner-error">
          <div>
            <strong>{t('Failed to load planner data')}</strong>
            <p>{error}</p>
          </div>
          <button className="planner-secondary-btn" onClick={() => void fetchPlans()}>{t('Try again')}</button>
        </div>
      )}

      <div className="planner-layout">
        <aside className="planner-sidebar">
          <PlanList
            plans={plans}
            loading={loading}
            selectedPlanId={selectedPlan?.id ?? null}
            onSelectPlan={handleSelectPlan}
            onNewPlan={handleNewPlan}
            onDeletePlan={(id) => void handleDelete(id)}
          />
        </aside>

        <main className="planner-main">
          {view === 'form' && <PlanForm onGenerate={handleGenerate} onCancel={handleCancel} />}

          {view === 'schedule' && (selectedPlan || generatedSchedule) && (
            <PlanSchedule
              plan={selectedPlan}
              generatedSchedule={generatedSchedule}
              title={scheduleTitle}
              onToggleDay={handleToggleDay}
              onSaveNotes={handleSaveNotes}
              onStartTimer={handleStartTimer}
              onSave={!selectedPlan ? handleSave : undefined}
              onDelete={selectedPlan ? () => void handleDelete() : undefined}
              saving={saving}
            />
          )}

          {view === 'timer' && <PlanTimer plan={selectedPlan} onBack={handleBackToSchedule} />}

          {view === 'list' && !loading && plans.length === 0 && (
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
                <line x1="10" y1="14" x2="14" y2="14"/>
                <line x1="12" y1="12" x2="12" y2="16"/>
              </svg>
              <h3>{t('No Study Plans Yet')}</h3>
              <p>{t('Create your first plan to organize your study schedule with smart time allocation.')}</p>
              <button className="planner-primary-btn" onClick={handleNewPlan}>{t('Create Study Plan')}</button>
            </div>
          )}

          {view === 'list' && !loading && plans.length > 0 && !selectedPlan && (
            <div className="select-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              <p>{t('Select a plan from the sidebar or create a new one')}</p>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .planner-page {
          max-width: 1560px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: var(--space-5);
        }
        .planner-hero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-4);
          flex-wrap: wrap;
        }
        .planner-eyebrow {
          margin: 0 0 6px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--text-muted);
        }
        .planner-hero h1 {
          margin: 0;
          font-size: clamp(2rem, 3vw, 2.8rem);
        }
        .planner-hero p {
          margin: var(--space-2) 0 0;
          color: var(--text-muted);
          max-width: 42ch;
        }
        .planner-hero-actions {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-wrap: wrap;
        }
        .planner-chip {
          display: inline-flex;
          align-items: center;
          padding: 6px 12px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--primary) 14%, transparent);
          color: var(--primary);
          font-size: var(--font-tiny);
          font-weight: var(--weight-semibold);
        }
        .planner-chip.muted {
          background: var(--bg-inset);
          color: var(--text-muted);
        }
        .planner-primary-btn,
        .planner-secondary-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: var(--transition-fast);
          font-size: var(--font-meta);
          font-weight: var(--weight-semibold);
          padding: var(--space-3) var(--space-4);
        }
        .planner-primary-btn {
          border: none;
          background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 65%, white 35%));
          color: white;
        }
        .planner-secondary-btn {
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          color: var(--text-secondary);
        }
        .planner-error {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          padding: var(--space-4);
          border: 1px solid color-mix(in srgb, var(--warning) 35%, var(--border-subtle));
          background: color-mix(in srgb, var(--warning) 10%, transparent);
          border-radius: 20px;
        }
        .planner-error p {
          margin: 6px 0 0;
          color: var(--text-muted);
          font-size: var(--font-meta);
        }
        .planner-layout {
          display: grid;
          grid-template-columns: 320px minmax(0, 1fr);
          gap: var(--space-5);
          align-items: start;
        }
        .planner-sidebar {
          position: sticky;
          top: var(--space-4);
          max-height: calc(100vh - 120px);
          overflow: hidden;
          border: 1px solid var(--border-subtle);
          border-radius: 28px;
          background: linear-gradient(180deg, var(--bg-elevated), var(--bg-surface));
          padding: var(--space-4);
        }
        .planner-main {
          min-width: 0;
          border: 1px solid var(--border-subtle);
          border-radius: 32px;
          background: linear-gradient(180deg, color-mix(in srgb, var(--bg-elevated) 92%, white 8%), var(--bg-surface));
          padding: var(--space-5);
          min-height: 720px;
        }
        .empty-state,
        .select-state {
          min-height: 520px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-3);
          text-align: center;
          color: var(--text-muted);
          padding: var(--space-5);
        }
        .empty-state h3 {
          margin: 0;
          color: var(--text-primary);
        }
        .empty-state p,
        .select-state p {
          margin: 0;
          max-width: 34ch;
        }
        @media (max-width: 1180px) {
          .planner-layout {
            grid-template-columns: 1fr;
          }
          .planner-sidebar {
            position: static;
            max-height: none;
          }
        }
      `}</style>
    </div>
  );
}
