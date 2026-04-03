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
  downloadProgress?: {
    percent: number;
    state: string;
  } | null;
}

function formatSize(bytes: number, sizeUnavailable: string) {
  if (!bytes || bytes <= 0) return sizeUnavailable;
  const gb = bytes / (1024 ** 3);
  return `${gb.toFixed(1)} GB`;
}

function getInstallErrorMessage(
  status: string | undefined,
  fallback: string | undefined,
  t: (key: string) => string,
) {
  const map: Record<string, string> = {
    network_error: 'Could not download optional model. Continue with Mini offline.',
    checksum_error: 'Model integrity validation failed. Continue with Mini offline.',
    disk_error: 'Could not save model to disk. Continue with Mini offline.',
  };
  if (status && map[status]) return t(map[status]);
  if (fallback) return fallback;
  return t('Failed to install model.');
}

export function ModelSetupWizard({ onComplete }: ModelSetupWizardProps) {
  const { t, isRTL } = useI18n();
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
    writeCompatStorage(localStorage, storageKeys.modelSetupDone, 'true');
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
          setError(getInstallErrorMessage(installResult.status, installResult.message, t));
          return;
        }
      }

      const switchResult = await window.electronAPI.desktopAI.setModel(model.key);
      if (!switchResult.ok) {
        setError(switchResult.message || t('Failed to activate model'));
        return;
      }

      await complete(model.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Unexpected error'));
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
    if (recommendedFor === 'laptop') return t('Laptop');
    if (recommendedFor === 'pc') return t('Desktop');
    return t('Balanced');
  };

  if (loading) {
    return (
      <div className="model-setup-overlay">
        <div className="model-setup-card">{t('Loading models...')}</div>
      </div>
    );
  }

  const bundledMiniInstalled = models.some((model) => model.key === 'mini' && model.isInstalled && model.installedSource === 'bundled');

  return (
    <div className="model-setup-overlay">
      <div className="model-setup-card" dir={isRTL ? 'rtl' : 'ltr'}>
        <h2>{t('Choose your local AI model')}</h2>
        <p>{bundledMiniInstalled
          ? t('Mini is already included in this desktop download, so you can start locally from the first launch.')
          : t('This build does not currently include bundled Mini, so local AI will not be ready from first launch until a model is installed.')
        }</p>

        <div className="model-grid">
          {models.map((model) => {
            const isRecommended = model.key === recommendedModelKey;
            const progress = model.downloadProgress?.percent ?? 0;
            return (
              <div key={model.key} className={`model-item ${isRecommended ? 'recommended' : ''}`}>
                <div className="model-head">
                  <strong>{model.modelId}</strong>
                  {isRecommended && <span className="badge">{t('Recommended')}</span>}
                </div>
                <div className="meta">{model.quantization}</div>
                <div className="meta">{formatSize(model.sizeBytes, t('Size unavailable'))}</div>
                <div className="meta">
                  {t('Best for')}: {getRecommendationLabel(model.recommendedFor)} ({model.minRamGb}GB+ RAM)
                </div>
                <div className="meta">
                  {model.isInstalled ? t('Installed') : t('Not installed')}
                </div>
                {model.isDownloading && (
                  <div className="progress-row">
                    <span>{t('Downloading')}</span>
                    <span>{progress}%</span>
                  </div>
                )}
                <button
                  className="action-btn"
                  onClick={() => handleUseModel(model)}
                  disabled={Boolean(busyModelKey)}
                >
                  {busyModelKey === model.key
                    ? t('Working...')
                    : model.isInstalled ? t('Use Now') : t('Install & Use')}
                </button>
              </div>
            );
          })}
        </div>

        {error && <p className="error-text">{error}</p>}

        <button className="skip-btn" onClick={handleSkip} disabled={Boolean(busyModelKey)}>
          {error ? t('Continue with Mini') : t('Skip and start with Mini')}
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
