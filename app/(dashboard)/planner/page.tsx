'use client';

import { useEffect, useMemo, useState } from 'react';
import { generateStudySchedule, type GeneratedSchedule, type StudyTopic } from '@/lib/planner/generate';
import { useStudyPlans, type StudyPlan } from '@/hooks/useStudyPlans';
import { useStudyTimer } from '@/lib/planner/timer-store';
import { PlanForm, PlanList, PlanSchedule, PlanTimer, StudyTimerFloat } from '@/components/planner';
import { useI18n } from '@/lib/i18n/useI18n';

interface DraftPlan {
  title: string;
  examDate: string;
  dailyMinutes: number;
  topics: StudyTopic[];
  folderId: string | null;
  schedule: GeneratedSchedule;
}

export default function PlannerPage() {
  const { t } = useI18n({
    Planner: 'المخطط',
    'Outlook-style study calendar': 'تقويم دراسة بأسلوب Outlook',
    'Turn weak areas, files, and deadlines into an actual study schedule.': 'حوّل نقاط الضعف والملفات والمواعيد النهائية إلى جدول دراسة فعلي.',
    'New Plan': 'خطة جديدة',
    'Draft Plan': 'مسودة خطة',
    'No plan selected': 'لا توجد خطة محددة',
    'Create a study plan or select one from the left rail to open the calendar view.': 'أنشئ خطة دراسة أو اختر واحدة من الشريط الجانبي لفتح عرض التقويم.',
    'Save draft first to unlock full tracking and timer logging.': 'احفظ المسودة أولًا لتفعيل التتبع الكامل وتسجيل المؤقت.',
    'Delete this study plan?': 'هل تريد حذف خطة الدراسة هذه؟',
    'Could not save plan right now.': 'تعذر حفظ الخطة الآن.',
    'Could not delete plan right now.': 'تعذر حذف الخطة الآن.',
    'Could not update plan right now.': 'تعذر تحديث الخطة الآن.',
    'Draft saved.': 'تم حفظ المسودة.',
    'Timer started from draft.': 'تم بدء المؤقت من المسودة.',
    'Plan schedule': 'جدول الخطة',
    'Use the left rail to switch plans, create a new one, and manage your calendar like a real planner.': 'استخدم الشريط الأيسر للتبديل بين الخطط وإنشاء خطة جديدة وإدارة التقويم كمخطط فعلي.',
  });

  const {
    plans,
    loading,
    error,
    createPlan,
    deletePlan,
    updatePlan,
    updateProgress,
  } = useStudyPlans();
  const timer = useStudyTimer();

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [draftPlan, setDraftPlan] = useState<DraftPlan | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    if (draftPlan) return;
    if (!selectedPlanId && plans.length > 0) {
      setSelectedPlanId(plans[0].id);
    }
  }, [plans, selectedPlanId, draftPlan]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId]
  );

  const activeTitle = draftPlan?.title ?? selectedPlan?.title ?? t('Planner');

  const resetDraft = () => {
    setDraftPlan(null);
    setShowComposer(false);
    if (plans.length > 0 && !selectedPlanId) {
      setSelectedPlanId(plans[0].id);
    }
  };

  const handleGenerate = (data: {
    title: string;
    examDate: string;
    dailyMinutes: number;
    topics: StudyTopic[];
    folderId: string | null;
  }) => {
    const schedule = generateStudySchedule(new Date(data.examDate), data.topics, data.dailyMinutes);
    setDraftPlan({
      ...data,
      schedule,
    });
    setSelectedPlanId(null);
    setShowComposer(false);
    setShowTimer(false);
  };

  const persistDraft = async () => {
    if (!draftPlan) return null;
    setSavingDraft(true);
    const created = await createPlan(draftPlan);
    setSavingDraft(false);
    if (!created) {
      window.alert(t('Could not save plan right now.'));
      return null;
    }
    setDraftPlan(null);
    setSelectedPlanId(created.id);
    setShowComposer(false);
    return created;
  };

  const handleDeletePlan = async (planId: string) => {
    if (!window.confirm(t('Delete this study plan?'))) return;
    const ok = await deletePlan(planId);
    if (!ok) {
      window.alert(t('Could not delete plan right now.'));
      return;
    }

    if (selectedPlanId === planId) {
      const next = plans.find((plan) => plan.id !== planId);
      setSelectedPlanId(next?.id ?? null);
      setShowTimer(false);
    }
  };

  const updateDraftSchedule = (updater: (schedule: GeneratedSchedule) => GeneratedSchedule) => {
    setDraftPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        schedule: updater(current.schedule),
      };
    });
  };

  const handleToggleDay = async (dayIndex: number) => {
    if (draftPlan) {
      updateDraftSchedule((schedule) => ({
        ...schedule,
        days: schedule.days.map((day, index) =>
          index === dayIndex ? { ...day, completed: !day.completed } : day
        ),
      }));
      return;
    }

    if (!selectedPlan) return;
    const nextSchedule: GeneratedSchedule = {
      ...selectedPlan.schedule,
      days: selectedPlan.schedule.days.map((day, index) =>
        index === dayIndex ? { ...day, completed: !day.completed } : day
      ),
    };
    const updated = await updateProgress(selectedPlan.id, nextSchedule);
    if (!updated) {
      window.alert(t('Could not update plan right now.'));
    }
  };

  const handleSaveNotes = async (dayIndex: number, notes: string) => {
    if (draftPlan) {
      updateDraftSchedule((schedule) => ({
        ...schedule,
        days: schedule.days.map((day, index) =>
          index === dayIndex ? { ...day, notes } : day
        ),
      }));
      return;
    }

    if (!selectedPlan) return;
    const nextSchedule: GeneratedSchedule = {
      ...selectedPlan.schedule,
      days: selectedPlan.schedule.days.map((day, index) =>
        index === dayIndex ? { ...day, notes } : day
      ),
    };
    const updated = await updatePlan(selectedPlan.id, { schedule: nextSchedule });
    if (!updated) {
      window.alert(t('Could not update plan right now.'));
    }
  };

  const handleStartTimer = async (dayIndex: number) => {
    let planForTimer: StudyPlan | null = selectedPlan;

    if (!planForTimer && draftPlan) {
      planForTimer = await persistDraft();
      if (!planForTimer) return;
    }

    if (!planForTimer) return;
    timer.startTimer(planForTimer.id, planForTimer.title, dayIndex);
    setShowTimer(true);
  };

  return (
    <div className="planner-shell">
      <section className="planner-hero">
        <div>
          <p className="eyebrow">{t('Outlook-style study calendar')}</p>
          <h1>{t('Planner')}</h1>
          <p>{t('Turn weak areas, files, and deadlines into an actual study schedule.')}</p>
        </div>
        <div className="hero-actions">
          <button className="hero-btn ghost" onClick={() => {
            setDraftPlan(null);
            setShowComposer((open) => !open);
            setShowTimer(false);
          }}>
            {t('New Plan')}
          </button>
          {draftPlan && (
            <button className="hero-btn primary" onClick={persistDraft} disabled={savingDraft}>
              {savingDraft ? t('Saving...') : t('Save Plan')}
            </button>
          )}
        </div>
      </section>

      <div className="planner-layout">
        <aside className="planner-rail">
          <PlanList
            plans={plans}
            loading={loading}
            selectedPlanId={selectedPlanId}
            onSelectPlan={(plan) => {
              setSelectedPlanId(plan.id);
              setDraftPlan(null);
              setShowComposer(false);
              setShowTimer(false);
            }}
            onNewPlan={() => {
              setDraftPlan(null);
              setSelectedPlanId(null);
              setShowComposer(true);
              setShowTimer(false);
            }}
            onDeletePlan={handleDeletePlan}
          />
        </aside>

        <section className="planner-main">
          {error && !draftPlan && (
            <div className="planner-alert">{error}</div>
          )}

          {showTimer ? (
            <div className="planner-card">
              <PlanTimer plan={selectedPlan} onBack={() => setShowTimer(false)} />
            </div>
          ) : showComposer ? (
            <div className="planner-card composer">
              <PlanForm
                onGenerate={handleGenerate}
                onCancel={() => {
                  setShowComposer(false);
                  if (!selectedPlanId && plans[0]) setSelectedPlanId(plans[0].id);
                }}
              />
            </div>
          ) : draftPlan ? (
            <div className="planner-surface">
              <div className="draft-banner">
                <strong>{t('Draft Plan')}</strong>
                <span>{t('Save draft first to unlock full tracking and timer logging.')}</span>
              </div>
              <PlanSchedule
                plan={null}
                generatedSchedule={draftPlan.schedule}
                title={draftPlan.title}
                onToggleDay={handleToggleDay}
                onSaveNotes={handleSaveNotes}
                onStartTimer={handleStartTimer}
                onSave={persistDraft}
                saving={savingDraft}
              />
            </div>
          ) : selectedPlan ? (
            <div className="planner-surface">
              <PlanSchedule
                plan={selectedPlan}
                title={selectedPlan.title}
                onToggleDay={handleToggleDay}
                onSaveNotes={handleSaveNotes}
                onStartTimer={handleStartTimer}
                onDelete={() => handleDeletePlan(selectedPlan.id)}
              />
            </div>
          ) : (
            <div className="planner-empty planner-card">
              <p className="eyebrow">{t('Plan schedule')}</p>
              <h2>{t('No plan selected')}</h2>
              <p>{t('Create a study plan or select one from the left rail to open the calendar view.')}</p>
              <p className="muted">{t('Use the left rail to switch plans, create a new one, and manage your calendar like a real planner.')}</p>
              <button className="hero-btn primary" onClick={() => setShowComposer(true)}>{t('New Plan')}</button>
            </div>
          )}
        </section>
      </div>

      <StudyTimerFloat />

      <style jsx>{`
        .planner-shell {
          display: grid;
          gap: var(--space-4);
          padding: var(--space-4);
        }
        .planner-hero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-4);
          flex-wrap: wrap;
          padding: var(--space-5);
          border: 1px solid var(--border-subtle);
          border-radius: 28px;
          background:
            radial-gradient(circle at top right, color-mix(in srgb, var(--primary) 16%, transparent), transparent 30%),
            linear-gradient(180deg, var(--bg-elevated), var(--bg-surface));
          box-shadow: var(--shadow-md);
        }
        .eyebrow {
          margin: 0 0 6px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-muted);
        }
        .planner-hero h1 {
          margin: 0;
          font-size: clamp(2rem, 4vw, 3rem);
          line-height: 1;
          letter-spacing: -0.04em;
        }
        .planner-hero p {
          margin: 10px 0 0;
          max-width: 62ch;
          color: var(--text-muted);
          line-height: 1.7;
        }
        .hero-actions {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-wrap: wrap;
        }
        .hero-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 0 var(--space-4);
          border-radius: 999px;
          border: 1px solid var(--border-subtle);
          cursor: pointer;
          transition: var(--transition-fast);
          font-weight: var(--weight-semibold);
        }
        .hero-btn.primary {
          background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 65%, white 35%));
          border-color: transparent;
          color: white;
        }
        .hero-btn.ghost {
          background: var(--bg-surface);
          color: var(--text-secondary);
        }
        .hero-btn.ghost:hover {
          border-color: color-mix(in srgb, var(--primary) 35%, var(--border-subtle));
          color: var(--primary);
        }
        .planner-layout {
          display: grid;
          grid-template-columns: 320px minmax(0, 1fr);
          gap: var(--space-4);
          align-items: start;
        }
        .planner-rail {
          min-width: 0;
        }
        .planner-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .planner-card {
          border: 1px solid var(--border-subtle);
          border-radius: 28px;
          background: linear-gradient(180deg, var(--bg-elevated), var(--bg-surface));
          box-shadow: var(--shadow-md);
          padding: var(--space-4);
        }
        .planner-card.composer {
          padding: var(--space-5);
        }
        .planner-empty {
          text-align: start;
          min-height: 380px;
          justify-content: center;
          display: grid;
          align-content: center;
          gap: var(--space-2);
        }
        .planner-empty h2 {
          margin: 0;
          font-size: clamp(1.4rem, 3vw, 2.1rem);
        }
        .planner-empty p {
          margin: 0;
          color: var(--text-muted);
          line-height: 1.7;
        }
        .planner-empty .muted {
          font-size: var(--font-meta);
        }
        .planner-alert,
        .draft-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          flex-wrap: wrap;
          padding: var(--space-3) var(--space-4);
          border-radius: 18px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          color: var(--text-secondary);
        }
        .draft-banner {
          margin-bottom: var(--space-3);
          background: color-mix(in srgb, var(--warning) 8%, var(--bg-surface));
        }
        @media (max-width: 1080px) {
          .planner-layout {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
