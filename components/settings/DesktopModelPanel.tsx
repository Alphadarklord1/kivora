'use client';

import { useEffect, useState, useCallback } from 'react';
import { useI18n } from '@/lib/i18n/useI18n';

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

const LOCAL_AR: Record<string, string> = {
  'Loading model status…': 'جارٍ تحميل حالة النماذج…',
  'Mini is bundled in this desktop build, so offline AI should work right after install. Bigger models stay optional and only download when you ask for them.': 'Mini مضمّن في هذا الإصدار المكتبي، لذلك ينبغي أن يعمل الذكاء الاصطناعي دون اتصال مباشرة بعد التثبيت. تبقى النماذج الأكبر اختيارية ولا تُنزّل إلا عند طلبك.',
  'You already have {count} optional model installed.': 'لديك بالفعل نموذج اختياري واحد مثبت.',
  'You already have {count} optional models installed.': 'لديك بالفعل {count} نماذج اختيارية مثبتة.',
  'This build does not currently include the bundled Mini model. Mac offline AI will still need a model download until the desktop bundle is staged correctly.': 'هذا الإصدار لا يتضمن حاليًا نموذج Mini المضمّن. سيظل الذكاء الاصطناعي دون اتصال على Mac بحاجة إلى تنزيل نموذج حتى يتم تجهيز الحزمة المكتبية بشكل صحيح.',
  Bundled: 'مضمّن',
  Active: 'نشط',
  'GB RAM min': 'الحد الأدنى للذاكرة (GB RAM)',
  'Downloading…': 'جارٍ التنزيل…',
  'Starting…': 'جارٍ البدء…',
  'Install Mini': 'ثبّت Mini',
  'Install in app': 'ثبّت داخل التطبيق',
  'Switching…': 'جارٍ التبديل…',
  'Use this model': 'استخدم هذا النموذج',
  'Currently active': 'قيد الاستخدام الآن',
  'Removing…': 'جارٍ الإزالة…',
  Remove: 'إزالة',
  'Downloading — you can leave this page': 'جارٍ التنزيل — يمكنك مغادرة هذه الصفحة',
  'Models are stored in your app data folder. Switching restarts the local AI engine automatically.': 'تُخزَّن النماذج في مجلد بيانات التطبيق. سيؤدي التبديل إلى إعادة تشغيل محرك الذكاء الاصطناعي المحلي تلقائيًا.',
};

export function DesktopModelPanel() {
  const { t } = useI18n(LOCAL_AR);
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
        {t('Loading model status…')}
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
          ? `${t('Mini is bundled in this desktop build, so offline AI should work right after install. Bigger models stay optional and only download when you ask for them.')}${optionalDownloadsInstalled > 0 ? ` ${t(optionalDownloadsInstalled === 1 ? 'You already have {count} optional model installed.' : 'You already have {count} optional models installed.', { count: optionalDownloadsInstalled })}` : ''}`
          : t('This build does not currently include the bundled Mini model. Mac offline AI will still need a model download until the desktop bundle is staged correctly.')}
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
                    <span className="badge badge-success" style={{ fontSize: 11 }}>{t('Bundled')}</span>
                  )}
                  {isActive && (
                    <span className="badge badge-accent" style={{ fontSize: 11 }}>{t('Active')}</span>
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
                  {model.minRamGb} {t('GB RAM min')}
                </span>
              </div>
            </div>

            {model.isDownloading && (
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                  <span>
                    {model.downloadProgress?.downloadedBytes != null && model.downloadProgress.totalBytes
                      ? `${formatBytes(model.downloadProgress.downloadedBytes)} / ${formatBytes(model.downloadProgress.totalBytes)}${formatSpeed(model.downloadProgress.speedBps ?? 0)}`
                      : t('Downloading…')}
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
                  {isBusy ? t('Starting…') : model.key === 'mini' ? t('Install Mini') : t('Install in app')}
                </button>
              )}
              {model.isInstalled && !isActive && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={isBusy}
                  onClick={() => handleSwitch(model.key)}
                >
                  {isBusy ? t('Switching…') : t('Use this model')}
                </button>
              )}
              {model.isInstalled && isActive && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', alignSelf: 'center' }}>
                  {t('Currently active')}
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
                  {isBusy ? t('Removing…') : t('Remove')}
                </button>
              )}
              {model.isDownloading && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', alignSelf: 'center' }}>
                  {t('Downloading — you can leave this page')}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
        {t('Models are stored in your app data folder. Switching restarts the local AI engine automatically.')}
      </p>
    </div>
  );
}
