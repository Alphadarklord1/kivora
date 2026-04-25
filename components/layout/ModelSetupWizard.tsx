'use client';

import { useEffect, useState } from 'react';
import { storageKeys, writeCompatStorage } from '@/lib/storage/keys';
import { useI18n } from '@/lib/i18n/useI18n';

interface ModelSetupWizardProps {
  onComplete: () => void;
}

interface WizardModel {
  key: string;
  modelId: string;
  quantization: string;
  recommendedFor: 'laptop' | 'laptop-pc' | 'pc';
  minRamGb: number;
  sizeBytes: number;
  bundled: boolean;
  isInstalled: boolean;
  installedSource: 'bundled' | 'userData' | 'none';
  isDownloading: boolean;
  downloadProgress?: { percent: number; state: string } | null;
}

const MODEL_FRIENDLY: Record<string, { name: string; tagline: string; icon: string; who: string }> = {
  mini:     { name: 'Mini',     icon: '⚡', tagline: 'Fast & included',   who: 'Perfect for most students — instant responses, 8 GB RAM' },
  balanced: { name: 'Balanced', icon: '🧠', tagline: 'Better answers',    who: 'Richer explanations, slightly slower — 16 GB RAM' },
  pro:      { name: 'Pro',      icon: '🚀', tagline: 'Best quality',      who: 'Strongest reasoning and writing — 24 GB RAM' },
};

function formatSize(bytes: number) {
  if (!bytes || bytes <= 0) return '';
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function getInstallErrorMessage(status: string | undefined, fallback: string | undefined) {
  const map: Record<string, string> = {
    network_error: 'Download failed — check your connection. Mini will be used for now.',
    checksum_error: 'Model file failed verification. Mini will be used for now.',
    disk_error:    'Not enough disk space. Mini will be used for now.',
  };
  if (status && map[status]) return map[status];
  return fallback ?? 'Something went wrong. Mini will be used for now.';
}

type Step = 'welcome' | 'offline-ai' | 'model' | 'done';

export function ModelSetupWizard({ onComplete }: ModelSetupWizardProps) {
  const { t, isRTL } = useI18n();
  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<WizardModel[]>([]);
  const [recommendedModelKey, setRecommendedModelKey] = useState<string>('mini');
  const [busyModelKey, setBusyModelKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!window.electronAPI?.desktopAI) return;
    const [listResult, selection] = await Promise.all([
      window.electronAPI.desktopAI.listModels(),
      window.electronAPI.desktopAI.getSelection(),
    ]);
    setModels(listResult.models as WizardModel[]);
    setRecommendedModelKey(selection.recommendedModelKey);
  };

  useEffect(() => {
    if (!window.electronAPI?.desktopAI) return;
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      try { await refresh(); } catch { /* non-fatal */ }
      finally { if (mounted) setLoading(false); }
    };

    unsubscribe = window.electronAPI.desktopAI.onDownloadProgress(() => { void refresh(); });
    void init();
    return () => { mounted = false; unsubscribe?.(); };
  }, []);

  const complete = async (modelKey: string) => {
    if (!window.electronAPI?.desktopAI) return;
    writeCompatStorage(localStorage, storageKeys.modelSetupDone, 'true');
    await window.electronAPI.desktopAI.completeSetup({ selectedModelKey: modelKey });
    setStep('done');
  };

  const handleUseModel = async (model: WizardModel) => {
    if (!window.electronAPI?.desktopAI) return;
    setBusyModelKey(model.key);
    setError(null);
    try {
      if (!model.isInstalled) {
        const installResult = await window.electronAPI.desktopAI.installModel(model.key);
        if (!installResult.ok) {
          setError(getInstallErrorMessage(installResult.status, installResult.message));
          return;
        }
      }
      const switchResult = await window.electronAPI.desktopAI.setModel(model.key);
      if (!switchResult.ok) {
        setError(switchResult.message ?? 'Could not activate model');
        return;
      }
      await complete(model.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setBusyModelKey(null);
      await refresh();
    }
  };

  const handleSkip = async () => {
    const mini = models.find(m => m.key === 'mini');
    if (mini) { await handleUseModel(mini); return; }
    await complete('mini');
  };

  const bundledMini = models.find(m => m.key === 'mini' && m.isInstalled && m.installedSource === 'bundled');

  return (
    <div className="overlay" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="card">

        {/* ── Step indicator ── */}
        <div className="step-dots">
          {(['welcome', 'offline-ai', 'model'] as Step[]).map((s, i) => (
            <span key={s} className={`dot ${step === s || (step === 'done' && i === 2) ? 'active' : ''} ${
              (['welcome', 'offline-ai', 'model'] as Step[]).indexOf(step) > i ? 'done' : ''
            }`} />
          ))}
        </div>

        {/* ── Step 1: Welcome ── */}
        {step === 'welcome' && (
          <div className="step">
            <div className="big-icon">K</div>
            <h2>Welcome to Kivora on your Mac</h2>
            <p className="lead">Your study workspace is now installed. Here's what makes the desktop app different from the web version:</p>
            <div className="feature-list">
              <div className="feature-row">
                <span className="feat-icon">🔒</span>
                <div>
                  <strong>Offline AI, fully private</strong>
                  <span>An AI model runs on your Mac — nothing leaves your device. No internet required for summaries, quizzes, or math help.</span>
                </div>
              </div>
              <div className="feature-row">
                <span className="feat-icon">⚡</span>
                <div>
                  <strong>Instant responses</strong>
                  <span>No server round-trips. Responses start appearing in under a second because the model is right here.</span>
                </div>
              </div>
              <div className="feature-row">
                <span className="feat-icon">📶</span>
                <div>
                  <strong>Works anywhere</strong>
                  <span>Library, campus café, or a flight with no Wi-Fi — Kivora works the same everywhere.</span>
                </div>
              </div>
            </div>
            <div className="actions">
              <button className="btn-primary" onClick={() => setStep('offline-ai')}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: What offline AI means ── */}
        {step === 'offline-ai' && (
          <div className="step">
            <div className="big-icon">🧠</div>
            <h2>Your AI runs on your Mac</h2>
            <p className="lead">Most AI tools send your notes and questions to a cloud server. Kivora desktop is different.</p>
            <div className="privacy-grid">
              <div className="privacy-card good">
                <strong>✓ With Kivora desktop</strong>
                <ul>
                  <li>Your notes stay on your Mac</li>
                  <li>Works without internet</li>
                  <li>No API key or account needed for AI</li>
                  <li>Runs at full speed even on slow connections</li>
                </ul>
              </div>
              <div className="privacy-card neutral">
                <strong>Cloud AI (web version)</strong>
                <ul>
                  <li>Needs internet for every AI request</li>
                  <li>Text is sent to Groq / OpenAI servers</li>
                  <li>Faster on powerful cloud hardware</li>
                  <li>Requires an API key or Kivora account</li>
                </ul>
              </div>
            </div>
            <p className="note">You can still connect to cloud AI from the desktop app by going to Settings → Runtime. The local model is just the default.</p>
            <div className="actions">
              <button className="btn-ghost" onClick={() => setStep('welcome')}>← Back</button>
              <button className="btn-primary" onClick={() => setStep('model')}>
                Choose my model →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Model picker ── */}
        {step === 'model' && (
          <div className="step">
            <h2>Pick your offline AI model</h2>
            <p className="lead">
              {bundledMini
                ? 'Mini is already bundled in this download — you can start right away. Larger models can be downloaded later from Settings → AI & Downloads.'
                : 'Choose a model to use offline. Mini is the fastest and works on any Mac.'}
            </p>

            {loading ? (
              <div className="loading-models">Loading…</div>
            ) : (
              <div className="model-grid">
                {models.map(model => {
                  const friendly = MODEL_FRIENDLY[model.key] ?? { name: model.key, icon: '🤖', tagline: '', who: '' };
                  const isRecommended = model.key === recommendedModelKey;
                  const isBusy = busyModelKey === model.key;
                  const progress = model.downloadProgress?.percent ?? 0;
                  return (
                    <div key={model.key} className={`model-card ${isRecommended ? 'recommended' : ''} ${model.isInstalled ? 'installed' : ''}`}>
                      {isRecommended && <div className="rec-badge">Recommended for your Mac</div>}
                      <div className="model-icon">{friendly.icon}</div>
                      <div className="model-name">{friendly.name}</div>
                      <div className="model-tagline">{friendly.tagline}</div>
                      <div className="model-who">{friendly.who}</div>
                      <div className="model-size">
                        {formatSize(model.sizeBytes)}
                        {model.isInstalled && model.installedSource === 'bundled' && (
                          <span className="chip included">Included</span>
                        )}
                        {model.isInstalled && model.installedSource === 'userData' && (
                          <span className="chip installed-chip">Installed</span>
                        )}
                        {!model.isInstalled && <span className="chip download">Download</span>}
                      </div>
                      {model.isDownloading && (
                        <div className="progress-bar-wrap">
                          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                          <span className="progress-label">{progress}%</span>
                        </div>
                      )}
                      <button
                        className={`model-btn ${isRecommended ? 'primary' : 'secondary'}`}
                        onClick={() => handleUseModel(model)}
                        disabled={Boolean(busyModelKey)}
                      >
                        {isBusy
                          ? (model.isDownloading ? `Downloading… ${progress}%` : 'Setting up…')
                          : model.isInstalled ? 'Use this model' : 'Download & use'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {error && <div className="error-box">⚠ {error}</div>}

            <div className="actions" style={{ marginTop: 8 }}>
              <button className="btn-ghost" onClick={() => setStep('offline-ai')}>← Back</button>
              <button className="skip-btn" onClick={handleSkip} disabled={Boolean(busyModelKey)}>
                {error ? 'Continue with Mini' : 'Start with Mini (fastest)'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Done ── */}
        {step === 'done' && (
          <div className="step done-step">
            <div className="big-icon">✓</div>
            <h2>You're all set</h2>
            <p className="lead">Kivora is ready. Your offline AI model is loaded and running in the background.</p>
            <div className="done-tips">
              <div className="done-tip">
                <strong>Start in Workspace</strong>
                <span>Upload a PDF or paste your notes, then pick a tool — Summary, Quiz, Flashcards, or Notes.</span>
              </div>
              <div className="done-tip">
                <strong>Use Math for problem-solving</strong>
                <span>Write a question or scan a photo of your worksheet — the solver shows step-by-step working.</span>
              </div>
              <div className="done-tip">
                <strong>Add more models later</strong>
                <span>Settings → AI & Downloads to install Balanced or Pro for richer answers.</span>
              </div>
            </div>
            <div className="actions">
              <button className="btn-primary btn-lg" onClick={onComplete}>
                Open Kivora
              </button>
            </div>
          </div>
        )}

      </div>

      <style jsx>{`
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.82);
          backdrop-filter: blur(6px);
          z-index: 2100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .card {
          width: min(680px, 100%);
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 24px;
          padding: 36px 40px 32px;
          color: var(--text-primary);
          box-shadow: 0 32px 80px rgba(0,0,0,0.35);
          display: flex;
          flex-direction: column;
          gap: 24px;
          max-height: 90dvh;
          overflow-y: auto;
        }

        /* Step dots */
        .step-dots {
          display: flex;
          gap: 8px;
          justify-content: center;
        }
        .dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--border-subtle);
          transition: background 0.2s, transform 0.2s;
        }
        .dot.active { background: var(--primary); transform: scale(1.25); }
        .dot.done   { background: color-mix(in srgb, var(--primary) 50%, var(--border-subtle)); }

        /* Step container */
        .step {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .big-icon {
          font-size: 42px;
          line-height: 1;
          text-align: center;
          font-weight: 800;
          color: var(--primary);
          letter-spacing: -1px;
        }
        h2 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 700;
          text-align: center;
          line-height: 1.3;
          color: var(--text-primary);
        }
        .lead {
          margin: 0;
          font-size: 0.9rem;
          color: var(--text-secondary);
          line-height: 1.6;
          text-align: center;
        }

        /* Step 1: feature list */
        .feature-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .feature-row {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 12px 14px;
          border-radius: 12px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
        }
        .feat-icon {
          font-size: 22px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .feature-row div {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .feature-row strong {
          font-size: 0.88rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .feature-row span {
          font-size: 0.8rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        /* Step 2: privacy grid */
        .privacy-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .privacy-card {
          border-radius: 12px;
          padding: 14px 16px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
        }
        .privacy-card.good {
          border-color: color-mix(in srgb, var(--success, #22c55e) 35%, var(--border-subtle));
          background: color-mix(in srgb, var(--success, #22c55e) 5%, var(--bg-surface));
        }
        .privacy-card strong {
          display: block;
          font-size: 0.82rem;
          font-weight: 700;
          margin-bottom: 8px;
          color: var(--text-primary);
        }
        .privacy-card ul {
          margin: 0;
          padding: 0 0 0 16px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .privacy-card li {
          font-size: 0.78rem;
          color: var(--text-secondary);
          line-height: 1.45;
        }
        .note {
          font-size: 0.78rem;
          color: var(--text-muted);
          padding: 10px 14px;
          border-radius: 10px;
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          line-height: 1.5;
          text-align: left;
          margin: 0;
        }

        /* Step 3: model grid */
        .loading-models {
          text-align: center;
          color: var(--text-muted);
          padding: 20px;
          font-size: 0.85rem;
        }
        .model-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
          gap: 12px;
        }
        .model-card {
          position: relative;
          border: 1.5px solid var(--border-subtle);
          border-radius: 16px;
          padding: 16px 14px 14px;
          background: var(--bg-surface);
          display: flex;
          flex-direction: column;
          gap: 6px;
          transition: border-color 0.15s;
        }
        .model-card.recommended {
          border-color: color-mix(in srgb, var(--primary) 45%, var(--border-subtle));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 15%, transparent);
        }
        .rec-badge {
          position: absolute;
          top: -10px;
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 10px;
          border-radius: 999px;
          background: var(--primary);
          color: #fff;
          letter-spacing: 0.02em;
        }
        .model-icon { font-size: 28px; text-align: center; }
        .model-name {
          font-size: 1rem;
          font-weight: 700;
          text-align: center;
          color: var(--text-primary);
        }
        .model-tagline {
          font-size: 0.75rem;
          font-weight: 600;
          text-align: center;
          color: var(--primary);
        }
        .model-who {
          font-size: 0.72rem;
          color: var(--text-muted);
          text-align: center;
          line-height: 1.45;
        }
        .model-size {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 4px;
        }
        .chip {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 999px;
        }
        .chip.included     { background: color-mix(in srgb, #22c55e 15%, transparent); color: #16a34a; }
        .chip.installed-chip { background: color-mix(in srgb, var(--primary) 15%, transparent); color: var(--primary); }
        .chip.download     { background: var(--bg-inset); color: var(--text-muted); border: 1px solid var(--border-subtle); }
        .progress-bar-wrap {
          position: relative;
          height: 6px;
          border-radius: 999px;
          background: var(--bg-inset);
          overflow: hidden;
          margin-top: 4px;
        }
        .progress-bar-fill {
          position: absolute;
          inset: 0;
          width: 0;
          background: var(--primary);
          border-radius: inherit;
          transition: width 0.3s ease;
        }
        .progress-label {
          position: absolute;
          right: 0;
          top: -18px;
          font-size: 10px;
          color: var(--text-muted);
        }
        .model-btn {
          margin-top: 8px;
          width: 100%;
          border-radius: 10px;
          padding: 9px 10px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: opacity 0.15s;
          border: none;
        }
        .model-btn.primary   { background: var(--primary); color: #fff; }
        .model-btn.secondary { background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid var(--border-subtle); }
        .model-btn:disabled  { opacity: 0.5; cursor: not-allowed; }
        .error-box {
          font-size: 0.82rem;
          color: #f87171;
          padding: 10px 14px;
          border-radius: 10px;
          background: rgba(248,113,113,0.08);
          border: 1px solid rgba(248,113,113,0.18);
        }

        /* Step 4: done */
        .done-step { align-items: center; text-align: center; }
        .done-tips {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
          text-align: left;
        }
        .done-tip {
          padding: 12px 14px;
          border-radius: 12px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .done-tip strong {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .done-tip span {
          font-size: 0.78rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        /* Actions row */
        .actions {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .btn-primary {
          padding: 10px 24px;
          border-radius: 10px;
          border: none;
          background: var(--primary);
          color: #fff;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .btn-primary.btn-lg { padding: 12px 32px; font-size: 1rem; }
        .btn-primary:hover  { opacity: 0.88; }
        .btn-ghost {
          padding: 10px 16px;
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          background: transparent;
          color: var(--text-secondary);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
        }
        .skip-btn {
          padding: 10px 16px;
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          background: transparent;
          color: var(--text-secondary);
          font-size: 0.82rem;
          cursor: pointer;
        }
        .skip-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        @media (max-width: 520px) {
          .card { padding: 24px 20px 20px; }
          .privacy-grid { grid-template-columns: 1fr; }
          .model-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
