'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/useI18n';

type OnboardingAction = {
  label: string;
  hint: string;
  href: string;
  accent: string;
};

type GoalKey = 'flashcards' | 'quiz' | 'research' | 'plan';
type SubjectKey = 'biology' | 'history' | 'math' | 'general';

type OnboardingStep = {
  icon: string;
  title: string;
  desc: string;
  highlight?: string | null;
  tip?: string | null;
  actionLabel?: string | null;
  href?: string | null;
  quickActions?: OnboardingAction[];
};

export function OnboardingModal() {
  const router = useRouter();
  const { t, isArabic } = useI18n();

  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return !localStorage.getItem('kivora-onboarded');
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<GoalKey>('flashcards');
  const [subject, setSubject] = useState<SubjectKey>('biology');

  const subjectLabel = useMemo<Record<SubjectKey, string>>(() => ({
    biology: t('Biology'),
    history: t('History'),
    math: t('Math'),
    general: t('General study'),
  }), [t]);

  const goalLabel = useMemo<Record<GoalKey, string>>(() => ({
    flashcards: t('Flashcards'),
    quiz: t('Quiz'),
    research: t('Research'),
    plan: t('Study plan'),
  }), [t]);

  const starterTopic = useMemo<Record<SubjectKey, string>>(() => ({
    biology: 'cell respiration',
    history: 'causes of World War I',
    math: 'derivatives practice',
    general: 'study strategies for finals',
  }), []);

  const goalHref = useCallback((selectedGoal: GoalKey, selectedSubject: SubjectKey) => {
    const topic = starterTopic[selectedSubject];
    switch (selectedGoal) {
      case 'flashcards':
        return `/workspace?tab=flashcards&starter=${encodeURIComponent(topic)}`;
      case 'quiz':
        return `/workspace?tab=generate&starter=${encodeURIComponent(topic)}&tool=quiz`;
      case 'research':
        return `/coach?starter=${encodeURIComponent(topic)}&section=research`;
      case 'plan':
        return `/planner?starter=${encodeURIComponent(topic)}`;
      default:
        return '/workspace';
    }
  }, [starterTopic]);

  const steps = useMemo<OnboardingStep[]>(() => ([
    {
      icon: '🎓',
      title: t('Welcome to Kivora'),
      desc: t('Choose the fastest path to your first useful study result. You can upload material, paste notes, or start from a subject without bringing anything in yet.'),
      highlight: t('Start with one lane, not the whole app.'),
      tip: t('Use the quick actions on this step to get to your first result fast.'),
      quickActions: [
        { label: t('Upload a file'), hint: t('Drop in a PDF, slides, or notes and generate from it.'), href: '/workspace', accent: '#4f86f7' },
        { label: t('Paste text'), hint: t('Skip the file step and generate from lecture notes or copied text.'), href: '/workspace?tab=generate', accent: '#7c3aed' },
        { label: t('Starter path'), hint: t('Open a pre-filled research, writing, math, or planning path.'), href: '/library', accent: '#10b981' },
      ],
    },
    {
      icon: '🧭',
      title: t('Choose your first goal'),
      desc: t('Pick the outcome you want first. Kivora will take you to the shortest path instead of dropping you into every tool at once.'),
      tip: t('You can start immediately in guest mode and connect sync later if you want cross-device history.'),
      quickActions: [
        { label: t('Generate my first flashcards'), hint: t('Open Workspace with flashcards ready as the destination.'), href: goalHref('flashcards', subject), accent: '#52b788' },
        { label: t('Build my first quiz'), hint: t('Start from text or a file and turn it into MCQs in one flow.'), href: goalHref('quiz', subject), accent: '#f59e0b' },
        { label: t('Research a topic'), hint: t('Open Scholar Hub with a starter topic and save sources from there.'), href: goalHref('research', subject), accent: '#0ea5e9' },
        { label: t('Plan an exam'), hint: t('Go straight to a first study plan with your exam date and topics.'), href: goalHref('plan', subject), accent: '#a855f7' },
      ],
    },
    {
      icon: '⚡',
      title: t('Turn inputs into something you can study'),
      desc: t('The first useful win is simple: upload or paste, pick one tool, then review or save it. Aim for one deck, one quiz, or one outline in under two minutes.'),
      highlight: `${goalLabel[goal]} · ${subjectLabel[subject]}`,
      tip: t('Everything generated here can move into Library, Planner, or Flashcard review without starting over.'),
      actionLabel: goal === 'research' ? t('Open Scholar Hub') : goal === 'plan' ? t('Open planner') : t('Start first session'),
      href: goalHref(goal, subject),
    },
    {
      icon: '🔍',
      title: t('Research, save, then study'),
      desc: t('Scholar Hub is strongest when you save what matters and send it into Workspace or your references library.'),
      highlight: t('Scholar Hub → Save source or Send to Workspace'),
      tip: t('If you only do one thing after sign-up, make it this: find one useful source and turn it into study material.'),
      actionLabel: t('Open my first path'),
      href: goalHref(goal, subject),
    },
  ]), [goal, goalHref, goalLabel, subject, subjectLabel, t]);

  function dismiss() {
    try {
      localStorage.setItem('kivora-onboarded', '1');
    } catch {
      // ignore storage issues
    }
    setVisible(false);
  }

  function jumpToCurrentStep() {
    const currentStep = steps[step];
    dismiss();
    if (currentStep.href) router.push(currentStep.href);
  }

  function handleQuickAction(href: string) {
    dismiss();
    router.push(href);
  }

  if (!visible) return null;

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="ob-backdrop" onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}>
      <div className="ob-modal" role="dialog" aria-modal="true" dir={isArabic ? 'rtl' : 'ltr'}>
        <div className="ob-topline">
          <span className="ob-step-count">{t('Step {current} of {total}', { current: step + 1, total: steps.length })}</span>
          <button className="ob-close" onClick={dismiss} aria-label={t('Close onboarding')}>✕</button>
        </div>

        <div className="ob-dots">
          {steps.map((_, i) => (
            <button
              key={i}
              className={`ob-dot${i === step ? ' active' : i < step ? ' done' : ''}`}
              onClick={() => setStep(i)}
              aria-label={`${t('Step {current} of {total}', { current: i + 1, total: steps.length })}`}
            />
          ))}
        </div>

        <div className="ob-content" key={step}>
          <div className="ob-icon">{current.icon}</div>
          <h2 className="ob-title">{current.title}</h2>
          <p className="ob-desc">{current.desc}</p>
          {current.highlight && (
            <div className="ob-highlight">
              <span className="ob-highlight-label">{t('How to get started')}</span>
              <span className="ob-highlight-text">{current.highlight}</span>
            </div>
          )}
          {current.tip && (
            <div className="ob-tip">
              <span className="ob-tip-icon">💡</span>
              <span>{current.tip}</span>
            </div>
          )}
          {step === 0 ? (
            <div className="ob-picker">
              <span className="ob-picker-title">{t('Pick a subject')}</span>
              <div className="ob-chip-row">
                {(Object.keys(subjectLabel) as SubjectKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`ob-chip${subject === key ? ' active' : ''}`}
                    onClick={() => setSubject(key)}
                  >
                    {subjectLabel[key]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {step === 1 ? (
            <div className="ob-picker">
              <span className="ob-picker-title">{t('Pick your first result')}</span>
              <div className="ob-chip-row">
                {(Object.keys(goalLabel) as GoalKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`ob-chip${goal === key ? ' active' : ''}`}
                    onClick={() => setGoal(key)}
                  >
                    {goalLabel[key]}
                  </button>
                ))}
              </div>
              <div className="ob-selection-note">
                {t('We will open {goal} for {subject} first.', {
                  goal: goalLabel[goal],
                  subject: subjectLabel[subject],
                })}
              </div>
            </div>
          ) : null}
          {current.quickActions?.length ? (
            <div className="ob-quick-start">
              <span className="ob-quick-title">{t('Fastest first win')}</span>
              <div className="ob-quick-grid">
                {current.quickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className="ob-quick-card"
                    onClick={() => handleQuickAction(action.href)}
                    style={{ ['--accent' as string]: action.accent }}
                  >
                    <strong>{action.label}</strong>
                    <span>{action.hint}</span>
                    <em>{t('Start here')} →</em>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="ob-actions">
          <button className="ob-skip" onClick={dismiss}>{t('Skip tour')}</button>
          <div className="ob-nav">
            {current.actionLabel ? (
              <button className="ob-jump" onClick={jumpToCurrentStep}>{current.actionLabel}</button>
            ) : null}
            {step > 0 ? (
              <button className="ob-back" onClick={() => setStep((s) => s - 1)}>
                {isArabic ? '→ ' : '← '}
                {t('Back')}
              </button>
            ) : null}
            {isLast ? (
              <button className="ob-primary" onClick={jumpToCurrentStep}>{t('Get started →')}</button>
            ) : (
              <button className="ob-primary" onClick={() => setStep((s) => s + 1)}>{t('Next →')}</button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .ob-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          backdrop-filter: blur(4px);
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .ob-modal {
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 24px;
          width: 620px;
          max-width: calc(100vw - 32px);
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
          animation: slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes slideUp { from { transform: translateY(24px) scale(0.97); opacity: 0; } to { transform: none; opacity: 1; } }
        .ob-topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .ob-step-count {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .ob-close {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          border: 1px solid var(--border-subtle);
          background: color-mix(in srgb, var(--bg-surface) 78%, transparent);
          color: var(--text-secondary);
          cursor: pointer;
        }
        .ob-dots { display: flex; justify-content: center; gap: 8px; }
        .ob-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--border-mid, var(--border-subtle));
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          padding: 0;
        }
        .ob-dot.active { background: var(--primary); width: 24px; border-radius: 4px; }
        .ob-dot.done { background: color-mix(in srgb, var(--primary) 50%, var(--border-subtle)); }
        .ob-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          text-align: center;
          animation: contentFade 0.2s ease;
        }
        @keyframes contentFade { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: none; } }
        .ob-icon { font-size: 52px; line-height: 1; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.2)); }
        .ob-title { font-size: 24px; font-weight: 700; margin: 0; color: var(--text-primary); }
        .ob-desc { font-size: 14px; color: var(--text-secondary); line-height: 1.7; margin: 0; max-width: 46ch; }
        .ob-highlight,
        .ob-tip,
        .ob-quick-start,
        .ob-picker,
        .ob-selection-note {
          width: 100%;
          border-radius: 14px;
          text-align: left;
        }
        .ob-picker {
          display: grid;
          gap: 10px;
          padding: 14px;
          border: 1px solid var(--border-subtle);
          background: color-mix(in srgb, var(--bg-surface) 86%, transparent);
        }
        .ob-picker-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .ob-chip-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ob-chip {
          border-radius: 999px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          color: var(--text-secondary);
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .ob-chip.active {
          background: color-mix(in srgb, var(--primary) 12%, var(--bg-surface));
          border-color: color-mix(in srgb, var(--primary) 40%, var(--border-subtle));
          color: var(--text-primary);
        }
        .ob-selection-note {
          padding: 10px 12px;
          background: color-mix(in srgb, var(--primary) 7%, var(--bg-surface));
          border: 1px solid color-mix(in srgb, var(--primary) 22%, transparent);
          font-size: 12px;
          color: var(--text-secondary);
        }
        .ob-highlight {
          display: flex;
          flex-direction: column;
          gap: 4px;
          background: color-mix(in srgb, var(--primary) 8%, var(--bg-surface));
          border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
          padding: 12px 16px;
        }
        .ob-highlight-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--primary); }
        .ob-highlight-text { font-size: 13px; color: var(--text-secondary); font-family: monospace; }
        .ob-tip {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          background: color-mix(in srgb, #f59e0b 8%, var(--bg-surface));
          border: 1px solid color-mix(in srgb, #f59e0b 25%, transparent);
          padding: 10px 14px;
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        .ob-tip-icon { flex-shrink: 0; }
        .ob-quick-start {
          display: grid;
          gap: 12px;
          padding: 14px;
          background: color-mix(in srgb, var(--bg-surface) 82%, transparent);
          border: 1px solid var(--border-subtle);
        }
        .ob-quick-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .ob-quick-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .ob-quick-card {
          display: grid;
          gap: 6px;
          text-align: left;
          padding: 14px;
          border-radius: 14px;
          border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border-subtle));
          background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 12%, var(--bg-elevated)), var(--bg-elevated));
          color: inherit;
          cursor: pointer;
        }
        .ob-quick-card strong {
          font-size: 13px;
          color: var(--text-primary);
        }
        .ob-quick-card span {
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        .ob-quick-card em {
          font-size: 11px;
          color: var(--accent);
          font-style: normal;
          font-weight: 700;
        }
        .ob-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .ob-skip,
        .ob-back,
        .ob-jump,
        .ob-primary {
          border-radius: 12px;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid var(--border-subtle);
        }
        .ob-skip, .ob-back, .ob-jump {
          background: var(--bg-surface);
          color: var(--text-secondary);
        }
        .ob-primary {
          background: var(--primary);
          color: white;
          border-color: color-mix(in srgb, var(--primary) 76%, black);
        }
        .ob-nav {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
        }
        @media (max-width: 720px) {
          .ob-modal {
            padding: 22px;
          }
          .ob-quick-grid {
            grid-template-columns: 1fr;
          }
          .ob-actions, .ob-nav {
            width: 100%;
          }
          .ob-skip,
          .ob-back,
          .ob-jump,
          .ob-primary {
            flex: 1 1 auto;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
