'use client';

import { useEffect, useMemo, useState } from 'react';

interface ModelSetupWizardProps {
  isArabic: boolean;
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
  downloadProgress?: {
    percent: number;
    state: string;
  } | null;
}

function formatSize(bytes: number, isArabic: boolean) {
  if (!bytes || bytes <= 0) return isArabic ? 'الحجم غير متوفر' : 'Size unavailable';
  const gb = bytes / (1024 ** 3);
  return `${gb.toFixed(1)} GB`;
}

function getInstallErrorMessage(status: string | undefined, fallback: string | undefined, isArabic: boolean) {
  const map: Record<string, { en: string; ar: string }> = {
    network_error: {
      en: 'Could not download optional model. Continue with Mini offline.',
      ar: 'تعذر تنزيل النموذج الاختياري. يمكنك المتابعة بنموذج Mini بدون إنترنت.',
    },
    checksum_error: {
      en: 'Model integrity validation failed. Continue with Mini offline.',
      ar: 'فشل التحقق من سلامة النموذج. يمكنك المتابعة بنموذج Mini بدون إنترنت.',
    },
    disk_error: {
      en: 'Could not save model to disk. Continue with Mini offline.',
      ar: 'تعذر حفظ النموذج على القرص. يمكنك المتابعة بنموذج Mini بدون إنترنت.',
    },
  };

  if (status && map[status]) {
    return isArabic ? map[status].ar : map[status].en;
  }
  if (fallback) return fallback;
  return isArabic ? 'تعذر تثبيت النموذج.' : 'Failed to install model.';
}

export function ModelSetupWizard({ isArabic, onComplete }: ModelSetupWizardProps) {
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<WizardModel[]>([]);
  const [recommendedModelKey, setRecommendedModelKey] = useState<string>('mini');
  const [busyModelKey, setBusyModelKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dictionary = useMemo(() => ({
    title: isArabic ? 'اختر نموذج الذكاء الاصطناعي المحلي' : 'Choose your local AI model',
    subtitle: isArabic
      ? 'يمكنك البدء فورًا بنموذج Mini بدون إنترنت، أو تثبيت نموذج أقوى لاحقًا.'
      : 'You can start immediately with Mini offline, or install a stronger model now.',
    recommended: isArabic ? 'موصى به' : 'Recommended',
    installed: isArabic ? 'مثبّت' : 'Installed',
    installUse: isArabic ? 'تثبيت واستخدام' : 'Install & Use',
    useNow: isArabic ? 'استخدام الآن' : 'Use Now',
    skipMini: isArabic ? 'تخطي والبدء بـ Mini' : 'Skip and start with Mini',
    continueMini: isArabic ? 'المتابعة بنموذج Mini' : 'Continue with Mini',
    working: isArabic ? 'جارٍ التنفيذ...' : 'Working...',
    laptop: isArabic ? 'لابتوب' : 'Laptop',
    balanced: isArabic ? 'متوازن' : 'Balanced',
    desktop: isArabic ? 'مكتبي' : 'Desktop',
    progress: isArabic ? 'جارٍ التنزيل' : 'Downloading',
  }), [isArabic]);

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
    let unsubscribe: (() => void) | null = null;
    let mounted = true;

    const init = async () => {
      try {
        await refresh();
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load models');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    unsubscribe = window.electronAPI.desktopAI.onDownloadProgress(() => {
      void refresh();
    });

    void init();
    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const complete = async (modelKey: string) => {
    if (!window.electronAPI?.desktopAI) return;
    localStorage.setItem('studypilot_model_setup_done', 'true');
    await window.electronAPI.desktopAI.completeSetup({ selectedModelKey: modelKey });
    onComplete();
  };

  const handleUseModel = async (model: WizardModel) => {
    if (!window.electronAPI?.desktopAI) return;
    setBusyModelKey(model.key);
    setError(null);
    try {
      if (!model.isInstalled) {
        const installResult = await window.electronAPI.desktopAI.installModel(model.key);
        if (!installResult.ok) {
          setError(getInstallErrorMessage(installResult.status, installResult.message, isArabic));
          return;
        }
      }

      const switchResult = await window.electronAPI.desktopAI.setModel(model.key);
      if (!switchResult.ok) {
        setError(switchResult.message || (isArabic ? 'تعذر تفعيل النموذج' : 'Failed to activate model'));
        return;
      }

      await complete(model.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : (isArabic ? 'حدث خطأ غير متوقع' : 'Unexpected error'));
    } finally {
      setBusyModelKey(null);
      await refresh();
    }
  };

  const handleSkip = async () => {
    const mini = models.find((model) => model.key === 'mini');
    if (mini) {
      await handleUseModel(mini);
      return;
    }
    await complete('mini');
  };

  const getRecommendationLabel = (recommendedFor: WizardModel['recommendedFor']) => {
    if (recommendedFor === 'laptop') return dictionary.laptop;
    if (recommendedFor === 'pc') return dictionary.desktop;
    return dictionary.balanced;
  };

  if (loading) {
    return (
      <div className="model-setup-overlay">
        <div className="model-setup-card">{isArabic ? 'جارٍ تحميل النماذج...' : 'Loading models...'}</div>
      </div>
    );
  }

  return (
    <div className="model-setup-overlay">
      <div className="model-setup-card" dir={isArabic ? 'rtl' : 'ltr'}>
        <h2>{dictionary.title}</h2>
        <p>{dictionary.subtitle}</p>

        <div className="model-grid">
          {models.map((model) => {
            const isRecommended = model.key === recommendedModelKey;
            const progress = model.downloadProgress?.percent ?? 0;
            return (
              <div key={model.key} className={`model-item ${isRecommended ? 'recommended' : ''}`}>
                <div className="model-head">
                  <strong>{model.modelId}</strong>
                  {isRecommended && <span className="badge">{dictionary.recommended}</span>}
                </div>
                <div className="meta">{model.quantization}</div>
                <div className="meta">{formatSize(model.sizeBytes, isArabic)}</div>
                <div className="meta">
                  {isArabic ? 'موصى به لـ' : 'Best for'}: {getRecommendationLabel(model.recommendedFor)} ({model.minRamGb}GB+ RAM)
                </div>
                <div className="meta">
                  {model.isInstalled ? dictionary.installed : (isArabic ? 'غير مثبّت' : 'Not installed')}
                </div>
                {model.isDownloading && (
                  <div className="progress-row">
                    <span>{dictionary.progress}</span>
                    <span>{progress}%</span>
                  </div>
                )}
                <button
                  className="action-btn"
                  onClick={() => handleUseModel(model)}
                  disabled={Boolean(busyModelKey)}
                >
                  {busyModelKey === model.key
                    ? dictionary.working
                    : model.isInstalled ? dictionary.useNow : dictionary.installUse}
                </button>
              </div>
            );
          })}
        </div>

        {error && <p className="error-text">{error}</p>}

        <button className="skip-btn" onClick={handleSkip} disabled={Boolean(busyModelKey)}>
          {error ? dictionary.continueMini : dictionary.skipMini}
        </button>
      </div>

      <style jsx>{`
        .model-setup-overlay {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.78);
          backdrop-filter: blur(4px);
          z-index: 2100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .model-setup-card {
          width: min(920px, 100%);
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 20px;
          color: var(--text-primary);
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
        }
        h2 {
          margin: 0;
          font-size: 1.5rem;
        }
        p {
          margin: 10px 0 0;
          color: var(--text-muted);
        }
        .model-grid {
          margin-top: 16px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }
        .model-item {
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 12px;
          background: var(--bg-base);
        }
        .model-item.recommended {
          border-color: var(--accent);
          box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.25);
        }
        .model-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .badge {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(59, 130, 246, 0.2);
          color: #93c5fd;
        }
        .meta {
          margin-top: 6px;
          font-size: 0.9rem;
          color: var(--text-muted);
        }
        .progress-row {
          margin-top: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        .action-btn {
          margin-top: 12px;
          width: 100%;
          border: none;
          border-radius: 10px;
          padding: 9px 12px;
          font-weight: 600;
          background: var(--accent);
          color: #fff;
          cursor: pointer;
        }
        .action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .skip-btn {
          margin-top: 16px;
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          padding: 9px 12px;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
        }
        .error-text {
          margin-top: 10px;
          color: #f87171;
        }
      `}</style>
    </div>
  );
}
