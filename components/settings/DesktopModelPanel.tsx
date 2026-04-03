'use client';

import { useEffect, useState, useCallback } from 'react';

interface ModelEntry {
  key: string;
  modelId: string;
  quantization: string;
  sizeBytes: number;
  minRamGb: number;
  bundled: boolean;
  isInstalled: boolean;
  installedSource: 'bundled' | 'userData' | 'none';
  isDownloading: boolean;
  downloadProgress?: {
    percent: number;
    state: string;
    downloadedBytes?: number;
    totalBytes?: number;
    speedBps?: number;
  } | null;
}

interface SelectionResult {
  selectedModelKey: string;
  recommendedModelKey: string;
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return '—';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatSpeed(bps: number) {
  if (!bps || bps <= 0) return '';
  if (bps >= 1024 ** 2) return ` · ${(bps / 1024 ** 2).toFixed(1)} MB/s`;
  if (bps >= 1024) return ` · ${(bps / 1024).toFixed(0)} KB/s`;
  return ` · ${bps} B/s`;
}

// Keep old alias for static size display
function formatSize(bytes: number) {
  return formatBytes(bytes);
}

const MODEL_LABELS: Record<string, { name: string; description: string; tag: string }> = {
  mini: {
    name: 'Mini — Qwen2.5 1.5B',
    description: 'Mac-first default. If this desktop build was packaged correctly, Mini works offline immediately after install.',
    tag: 'Included',
  },
  balanced: {
    name: 'Balanced — Qwen2.5 3B',
    description: 'Optional in-app download. Stronger for essays, longer explanations, and denser study guides. Needs 16 GB+ RAM.',
    tag: '16 GB+ RAM',
  },
  pro: {
    name: 'Pro — Qwen2.5 7B',
    description: 'Largest optional download. Best quality for harder reasoning and long-form work on higher-memory Macs.',
    tag: '24 GB+ RAM',
  },
};

export function DesktopModelPanel() {
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [selection, setSelection] = useState<SelectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!window.electronAPI?.desktopAI) return;
    const [listResult, sel] = await Promise.all([
      window.electronAPI.desktopAI.listModels(),
      window.electronAPI.desktopAI.getSelection(),
    ]);
    setModels(listResult.models as ModelEntry[]);
    setSelection(sel as SelectionResult);
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.desktopAI) {
      setLoading(false);
      return;
    }

    let mounted = true;
    const unsubscribe = window.electronAPI.desktopAI.onDownloadProgress(() => {
      if (mounted) void refresh();
    });

    void refresh().finally(() => {
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [refresh]);

  // Not in desktop app — don't render
  if (!loading && !window.electronAPI?.desktopAI) return null;

  async function handleInstall(key: string) {
    if (!window.electronAPI?.desktopAI) return;
    setBusyKey(key);
    setError(null);
    try {
      const result = await window.electronAPI.desktopAI.installModel(key);
      if (!result.ok) {
        setError(result.message || `Failed to install ${key} model`);
        return;
      }
      await window.electronAPI.desktopAI.setModel(key);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSwitch(key: string) {
    if (!window.electronAPI?.desktopAI) return;
    setBusyKey(key);
    setError(null);
    try {
      const result = await window.electronAPI.desktopAI.setModel(key);
      if (!result.ok) {
        setError(result.message || 'Failed to switch model');
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRemove(key: string) {
    if (!window.electronAPI?.desktopAI) return;
    if (!confirm('Remove this model from your app data? You can re-download it later.')) return;
    setBusyKey(key);
    setError(null);
    try {
      const result = await window.electronAPI.desktopAI.removeModel(key);
      if (!result.ok) {
        setError(result.message || 'Failed to remove model');
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '14px 0', color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
        Loading model status…
      </div>
    );
  }

  const bundledMiniInstalled = models.some(
    (model) => model.key === 'mini' && model.isInstalled && model.installedSource === 'bundled',
  );
  const optionalDownloadsInstalled = models.filter(
    (model) => model.key !== 'mini' && model.isInstalled,
  ).length;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
        {bundledMiniInstalled
          ? `Mini is bundled in this desktop build, so the Mac app should be ready for first-launch offline AI. Optional bigger models download into your app data only when you ask for them.${optionalDownloadsInstalled > 0 ? ` You already have ${optionalDownloadsInstalled} optional model${optionalDownloadsInstalled === 1 ? '' : 's'} installed.` : ''}`
          : 'This build does not currently include the bundled Mini model. Mac offline AI will still need a model download until the desktop bundle is staged correctly.'}
      </p>

      {error && (
        <div style={{
          padding: '10px 14px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 10,
          fontSize: 'var(--text-sm)',
          color: 'var(--text)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 16, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      )}

      {models.map((model) => {
        const label = MODEL_LABELS[model.key] ?? { name: model.modelId, description: '', tag: '' };
        const isActive = selection?.selectedModelKey === model.key;
        const isBusy = busyKey === model.key;
        const progress = model.downloadProgress?.percent ?? 0;

        return (
          <div
            key={model.key}
            style={{
              padding: '14px 16px',
              borderRadius: 14,
              border: `1px solid ${isActive ? 'var(--primary-6)' : 'var(--border-2)'}`,
              background: isActive ? 'rgba(var(--primary-rgb, 99,102,241), 0.06)' : 'var(--surface)',
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <strong style={{ fontSize: 'var(--text-sm)' }}>{label.name}</strong>
                  {label.tag && (
                    <span className="badge" style={{ fontSize: 11 }}>{label.tag}</span>
                  )}
                  {model.bundled && (
                    <span className="badge badge-success" style={{ fontSize: 11 }}>Bundled</span>
                  )}
                  {isActive && (
                    <span className="badge badge-accent" style={{ fontSize: 11 }}>Active</span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-3)', maxWidth: 420 }}>
                  {label.description}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                  {model.quantization} · {formatSize(model.sizeBytes)}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                  {model.minRamGb} GB RAM min
                </span>
              </div>
            </div>

            {model.isDownloading && (
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                  <span>
                    {model.downloadProgress?.downloadedBytes != null && model.downloadProgress.totalBytes
                      ? `${formatBytes(model.downloadProgress.downloadedBytes)} / ${formatBytes(model.downloadProgress.totalBytes)}${formatSpeed(model.downloadProgress.speedBps ?? 0)}`
                      : 'Downloading…'}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(progress)}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: 'var(--border-2)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'var(--primary-6)', borderRadius: 99, transition: 'width 0.3s' }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!model.isInstalled && !model.isDownloading && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={isBusy}
                  onClick={() => handleInstall(model.key)}
                >
                  {isBusy ? 'Starting…' : model.key === 'mini' ? 'Install & use Mini' : 'Download optional model'}
                </button>
              )}
              {model.isInstalled && !isActive && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={isBusy}
                  onClick={() => handleSwitch(model.key)}
                >
                  {isBusy ? 'Switching…' : 'Use this model'}
                </button>
              )}
              {model.isInstalled && isActive && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', alignSelf: 'center' }}>
                  Currently active
                </span>
              )}
              {model.isInstalled && !isActive && model.installedSource === 'userData' && !model.isDownloading && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={isBusy}
                  style={{ color: 'var(--text-3)' }}
                  onClick={() => handleRemove(model.key)}
                >
                  {isBusy ? 'Removing…' : 'Remove'}
                </button>
              )}
              {model.isDownloading && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', alignSelf: 'center' }}>
                  Downloading — you can leave this page
                </span>
              )}
            </div>
          </div>
        );
      })}

      <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
        Models are stored in your app data folder. Switching restarts the local AI engine automatically.
      </p>
    </div>
  );
}
