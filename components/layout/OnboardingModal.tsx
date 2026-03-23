'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const STEPS = [
  {
    icon: '🎓',
    title: 'Welcome to Kivora',
    desc: 'Your AI-powered study workspace — upload your materials, generate summaries and quizzes, study with smart flashcards, and solve math problems. Everything in one place.',
    highlight: null,
    tip: null,
    actionLabel: 'Open workspace',
    href: '/workspace',
  },
  {
    icon: '🤖',
    title: 'Upload & generate in seconds',
    desc: 'Upload a lecture slide, PDF, or Word doc. Then pick a tool — Summary, Quiz, MCQ, Flashcards, or Notes — and Kivora generates exam-ready content instantly.',
    highlight: 'Workspace → Upload File → choose a tool',
    tip: 'Desktop installs include Mini local AI by default. Open Settings → AI & downloads if you want to switch models or add a bigger one later.',
    actionLabel: 'Open workspace',
    href: '/workspace',
  },
  {
    icon: '🃏',
    title: 'Scholar Hub for source study',
    desc: 'Use Scholar Hub to break down a source, build an example report, learn more in detail, and then check the student’s own writing.',
    highlight: 'Scholar Hub → Source Brief → Report Builder → Work Checker',
    tip: 'Flashcards and long-term review sets now live in Workspace, so Scholar Hub can stay focused on source understanding and writing support.',
    actionLabel: 'Open Scholar Hub',
    href: '/coach',
  },
  {
    icon: '🧮',
    title: 'Solve math step-by-step',
    desc: 'From algebra and calculus to matrices and vectors — get full working steps, LaTeX output, interactive graphs, and a built-in unit converter. Photograph a problem and AI extracts it for you.',
    highlight: 'Math in the sidebar → type any expression → hit Solve',
    tip: 'The solver tries a fast symbolic engine first, then falls back to your local Ollama model for trickier problems.',
    actionLabel: "Let's go →",
    href: '/math',
  },
];

export function OnboardingModal() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem('kivora-onboarded')) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setVisible(true);
      }
    } catch { /* noop */ }
  }, []);

  function dismiss() {
    try { localStorage.setItem('kivora-onboarded', '1'); } catch { /* noop */ }
    setVisible(false);
  }

  function jumpToCurrentStep() {
    const currentStep = STEPS[step];
    dismiss();
    if (currentStep.href) router.push(currentStep.href);
  }

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="ob-backdrop" onClick={e => { if (e.target === e.currentTarget) dismiss(); }}>
      <div className="ob-modal" role="dialog" aria-modal="true">
        <div className="ob-topline">
          <span className="ob-step-count">Step {step + 1} of {STEPS.length}</span>
          <button className="ob-close" onClick={dismiss} aria-label="Close onboarding">✕</button>
        </div>

        {/* Progress dots */}
        <div className="ob-dots">
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={`ob-dot${i === step ? ' active' : i < step ? ' done' : ''}`}
              onClick={() => setStep(i)}
              aria-label={`Step ${i + 1}`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="ob-content" key={step}>
          <div className="ob-icon">{current.icon}</div>
          <h2 className="ob-title">{current.title}</h2>
          <p className="ob-desc">{current.desc}</p>
          {current.highlight && (
            <div className="ob-highlight">
              <span className="ob-highlight-label">How to get started</span>
              <span className="ob-highlight-text">{current.highlight}</span>
            </div>
          )}
          {current.tip && (
            <div className="ob-tip">
              <span className="ob-tip-icon">💡</span>
              <span>{current.tip}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="ob-actions">
          <button className="ob-skip" onClick={dismiss}>Skip tour</button>
          <div className="ob-nav">
            {current.actionLabel && (
              <button className="ob-jump" onClick={jumpToCurrentStep}>{current.actionLabel}</button>
            )}
            {step > 0 && (
              <button className="ob-back" onClick={() => setStep(s => s - 1)}>← Back</button>
            )}
            {isLast ? (
              <button className="ob-primary" onClick={jumpToCurrentStep}>Get started →</button>
            ) : (
              <button className="ob-primary" onClick={() => setStep(s => s + 1)}>Next →</button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .ob-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.55);
          display: flex; align-items: center; justify-content: center;
          z-index: 9999; backdrop-filter: blur(4px);
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .ob-modal {
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          border-radius: 20px; width: 480px; max-width: calc(100vw - 32px);
          padding: 32px; display: flex; flex-direction: column; gap: 24px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.35);
          animation: slideUp 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }
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
        @keyframes slideUp { from { transform: translateY(24px) scale(0.97); opacity: 0; } to { transform: none; opacity: 1; } }
        .ob-dots { display: flex; justify-content: center; gap: 8px; }
        .ob-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--border-mid, var(--border-subtle)); border: none;
          cursor: pointer; transition: all 0.2s; padding: 0;
        }
        .ob-dot.active { background: var(--primary); width: 24px; border-radius: 4px; }
        .ob-dot.done { background: color-mix(in srgb, var(--primary) 50%, var(--border-subtle)); }
        .ob-content {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          text-align: center; animation: contentFade 0.2s ease;
        }
        @keyframes contentFade { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: none; } }
        .ob-icon { font-size: 52px; line-height: 1; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.2)); }
        .ob-title { font-size: 22px; font-weight: 700; margin: 0; color: var(--text-primary); }
        .ob-desc { font-size: 14px; color: var(--text-secondary); line-height: 1.7; margin: 0; max-width: 380px; }
        .ob-highlight {
          display: flex; flex-direction: column; gap: 4px;
          background: color-mix(in srgb, var(--primary) 8%, var(--bg-surface));
          border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
          border-radius: 10px; padding: 12px 16px; text-align: left; width: 100%;
        }
        .ob-highlight-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--primary); }
        .ob-highlight-text { font-size: 13px; color: var(--text-secondary); font-family: monospace; }
        .ob-tip {
          display: flex; align-items: flex-start; gap: 8px;
          background: color-mix(in srgb, #f59e0b 8%, var(--bg-surface));
          border: 1px solid color-mix(in srgb, #f59e0b 25%, transparent);
          border-radius: 10px; padding: 10px 14px; text-align: left; width: 100%;
          font-size: 12px; color: var(--text-secondary); line-height: 1.5;
        }
        .ob-tip-icon { flex-shrink: 0; }
        .ob-actions {
          display: flex; align-items: center; justify-content: space-between;
          padding-top: 4px; border-top: 1px solid var(--border-subtle);
        }
        .ob-skip { background: none; border: none; font-size: 13px; color: var(--text-muted); cursor: pointer; padding: 4px 8px; }
        .ob-skip:hover { color: var(--text-secondary); }
        .ob-nav { display: flex; align-items: center; gap: 8px; }
        .ob-jump,
        .ob-back {
          padding: 9px 16px; border-radius: 10px; border: 1.5px solid var(--border-subtle);
          background: transparent; color: var(--text-secondary); font-size: 13px;
          font-weight: 500; cursor: pointer; transition: all 0.12s;
        }
        .ob-jump:hover,
        .ob-back:hover { border-color: var(--primary); color: var(--primary); }
        .ob-primary {
          padding: 10px 22px; border-radius: 10px; border: none;
          background: var(--primary); color: white; font-size: 14px;
          font-weight: 600; cursor: pointer; transition: opacity 0.12s;
          box-shadow: 0 4px 14px color-mix(in srgb, var(--primary) 35%, transparent);
        }
        .ob-primary:hover { opacity: 0.88; }
      `}</style>
    </div>
  );
}
