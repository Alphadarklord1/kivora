'use client';

import { useState, useEffect } from 'react';

const STEPS = [
  {
    icon: '🎓',
    title: 'Welcome to Kivora',
    desc: 'Your personal AI-powered study workspace. Everything you need to study smarter — in one place.',
    highlight: null,
    tip: null,
  },
  {
    icon: '📄',
    title: 'Upload your study material',
    desc: 'Upload your lecture slides, PDFs, or Word docs. Kivora extracts the content and keeps everything organized by folder.',
    highlight: 'Go to Workspace → click Upload File',
    tip: 'Files stay on your device. Only metadata syncs to the cloud.',
  },
  {
    icon: '🤖',
    title: 'Generate AI study content',
    desc: 'Select any uploaded file and instantly generate: summaries, quizzes, flashcards, MCQs, notes, and more — using AI that runs locally.',
    highlight: 'Select a file → choose a tool from the right panel',
    tip: 'Works offline too! Install a local AI model from the AI Models page.',
  },
  {
    icon: '📊',
    title: 'Track your progress',
    desc: 'Your quiz scores, study streaks, and weak areas are tracked automatically. Use the Planner to schedule study sessions.',
    highlight: 'Visit Analytics & Planner in the sidebar',
    tip: 'Flashcards use spaced repetition (SM-2) to show you cards right before you forget them.',
  },
  {
    icon: '🧮',
    title: 'Solve math step-by-step',
    desc: 'The Math page handles derivatives, integrals, limits, quadratics, matrices, and more — with full step-by-step explanations and interactive graphs.',
    highlight: 'Go to Math in the sidebar → type any expression',
    tip: 'You can also photograph a math problem and let AI extract it for you.',
  },
];

export function OnboardingModal() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem('kivora-onboarded')) {
        setVisible(true);
      }
    } catch { /* noop */ }
  }, []);

  function dismiss() {
    try { localStorage.setItem('kivora-onboarded', '1'); } catch { /* noop */ }
    setVisible(false);
  }

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="ob-backdrop" onClick={e => { if (e.target === e.currentTarget) dismiss(); }}>
      <div className="ob-modal" role="dialog" aria-modal="true">
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
            {step > 0 && (
              <button className="ob-back" onClick={() => setStep(s => s - 1)}>← Back</button>
            )}
            {isLast ? (
              <button className="ob-primary" onClick={dismiss}>Get started →</button>
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
        .ob-back {
          padding: 9px 16px; border-radius: 10px; border: 1.5px solid var(--border-subtle);
          background: transparent; color: var(--text-secondary); font-size: 13px;
          font-weight: 500; cursor: pointer; transition: all 0.12s;
        }
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
