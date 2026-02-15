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
    'Plan your study schedule and track progress': 'خطط جدول دراستك وتابع تقدمك',
    'No Study Plans Yet': 'لا توجد خطط دراسة بعد',
    'Create your first plan to organize your study schedule with smart time allocation.': 'أنشئ خطتك الأولى لتنظيم جدول دراستك بتوزيع وقت ذكي.',
    'Create Study Plan': 'إنشاء خطة دراسة',
    'Select a plan from the sidebar or create a new one': 'اختر خطة من الشريط الجانبي أو أنشئ خطة جديدة',
  });
  const { plans, loading, createPlan, updatePlan, deletePlan, updateProgress } = useStudyPlans();
  const timer = useStudyTimer();

  const [view, setView] = useState<View>('list');
  const [selectedPlan, setSelectedPlan] = useState<StudyPlan | null>(null);
  const [generatedSchedule, setGeneratedSchedule] = useState<GeneratedSchedule | null>(null);
  const [pendingData, setPendingData] = useState<PendingPlan | null>(null);
  const [saving, setSaving] = useState(false);

  // Auto-resume timer view on mount (intentional sync from external state)
  useEffect(() => {
    if (timer.isActive && timer.currentPlanId && plans.length > 0) {
      const plan = plans.find(p => p.id === timer.currentPlanId);
      if (plan) {
        setSelectedPlan(plan); // eslint-disable-line react-hooks/set-state-in-effect
        setView('timer');
      }
    }
  }, [timer.isActive, timer.currentPlanId, plans]);

  // Keep selectedPlan in sync with plans array
  useEffect(() => {
    setSelectedPlan(prev => { // eslint-disable-line react-hooks/set-state-in-effect
      if (!prev) return prev;
      const updated = plans.find(p => p.id === prev.id);
      return updated || prev;
    });
  }, [plans]);

  const handleNewPlan = useCallback(() => {
    setSelectedPlan(null);
    setGeneratedSchedule(null);
    setPendingData(null);
    setView('form');
  }, []);

  const handleGenerate = useCallback((data: PendingPlan) => {
    const schedule = generateStudySchedule(
      new Date(data.examDate),
      data.topics,
      data.dailyMinutes
    );
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
  }, [selectedPlan, deletePlan, timer]);

  const handleBackToSchedule = useCallback(() => {
    setView('schedule');
  }, []);

  const handleCancel = useCallback(() => {
    if (selectedPlan) {
      setView('schedule');
    } else {
      setView('list');
    }
  }, [selectedPlan]);

  const scheduleTitle = selectedPlan?.title || pendingData?.title || '';

  return (
    <div className="planner-page">
      <div className="page-header">
        <h1>{t('Study Planner')}</h1>
        <p>{t('Plan your study schedule and track progress')}</p>
      </div>

      <div className="planner-layout">
        <aside className="planner-sidebar">
          <PlanList
            plans={plans}
            loading={loading}
            selectedPlanId={selectedPlan?.id ?? null}
            onSelectPlan={handleSelectPlan}
            onNewPlan={handleNewPlan}
            onDeletePlan={(id) => handleDelete(id)}
          />
        </aside>

        <main className="planner-main">
          {view === 'form' && (
            <PlanForm onGenerate={handleGenerate} onCancel={handleCancel} />
          )}

          {view === 'schedule' && (
            <PlanSchedule
              plan={selectedPlan}
              generatedSchedule={generatedSchedule}
              title={scheduleTitle}
              onToggleDay={handleToggleDay}
              onSaveNotes={handleSaveNotes}
              onStartTimer={handleStartTimer}
              onSave={!selectedPlan ? handleSave : undefined}
              onDelete={selectedPlan ? () => handleDelete() : undefined}
              saving={saving}
            />
          )}

          {view === 'timer' && (
            <PlanTimer plan={selectedPlan} onBack={handleBackToSchedule} />
          )}

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
              <button className="create-btn" onClick={handleNewPlan}>
                {t('Create Study Plan')}
              </button>
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
          max-width: 1200px;
          margin: 0 auto;
        }
        .page-header {
          margin-bottom: var(--space-5);
        }
        .page-header h1 {
          font-size: var(--font-2xl);
          font-weight: 700;
          margin-bottom: var(--space-1);
        }
        .page-header p {
          color: var(--text-muted);
        }
        .planner-layout {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: var(--space-5);
          align-items: start;
        }
        .planner-sidebar {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-3);
          position: sticky;
          top: var(--space-4);
          max-height: calc(100vh - 120px);
          overflow-y: auto;
        }
        .planner-main {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-5);
          min-height: 400px;
        }
        .empty-state, .select-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: var(--space-3);
          padding: var(--space-8) var(--space-4);
          color: var(--text-muted);
        }
        .empty-state h3 {
          font-size: var(--font-body);
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }
        .empty-state p, .select-state p {
          font-size: var(--font-meta);
          max-width: 320px;
          margin: 0;
        }
        .create-btn {
          padding: var(--space-2) var(--space-4);
          border: none;
          border-radius: var(--radius-md);
          background: var(--primary);
          color: white;
          font-size: var(--font-meta);
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-fast);
        }
        .create-btn:hover { background: var(--primary-hover); }

        @media (max-width: 768px) {
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
