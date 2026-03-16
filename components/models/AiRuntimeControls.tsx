'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AI_PREFS_UPDATED_EVENT,
  CLOUD_MODEL_OPTIONS,
  loadAiRuntimePreferences,
  LOCAL_MODEL_OPTIONS,
  saveAiRuntimePreferences,
  type AiMode,
  type AiRuntimePreferences,
} from '@/lib/ai/runtime';

const MODE_COPY: Record<AiMode, { label: string; hint: string; summary: string }> = {
  auto: {
    label: 'Auto',
    hint: 'Try local first, then cloud if available',
    summary: 'Best default. Kivora prefers offline local AI for privacy, then falls back to cloud when needed.',
  },
  local: {
    label: 'Local only',
    hint: 'Keep study material on-device',
    summary: 'Best for privacy, security, and no-internet use. Uses your local runtime or bundled desktop model when available.',
  },
  cloud: {
    label: 'Cloud only',
    hint: 'Use API models for convenience',
    summary: 'Best when you want the strongest hosted model and do not want to install a local runtime.',
  },
};

export function AiRuntimeControls({ compact = false }: { compact?: boolean }) {
  const [prefs, setPrefs] = useState<AiRuntimePreferences>(() => loadAiRuntimePreferences());
  const [localStatus, setLocalStatus] = useState<'checking' | 'ready' | 'missing'>('checking');
  const [cloudConfigured, setCloudConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    const ollamaBase = process.env.NEXT_PUBLIC_OLLAMA_URL ?? 'http://localhost:11434';
    fetch(`${ollamaBase}/api/version`, { signal: AbortSignal.timeout(2500) })
      .then((response) => setLocalStatus(response.ok ? 'ready' : 'missing'))
      .catch(() => setLocalStatus('missing'));

    fetch('/api/ai/status')
      .then(async (response) => (response.ok ? response.json() : null))
      .then((payload) => setCloudConfigured(Boolean(payload?.cloudConfigured)))
      .catch(() => setCloudConfigured(false));

    const handlePrefsUpdate = (event: Event) => {
      const detail = (event as CustomEvent<AiRuntimePreferences>).detail;
      if (detail) setPrefs(detail);
      else setPrefs(loadAiRuntimePreferences());
    };

    window.addEventListener(AI_PREFS_UPDATED_EVENT, handlePrefsUpdate as EventListener);
    return () => window.removeEventListener(AI_PREFS_UPDATED_EVENT, handlePrefsUpdate as EventListener);
  }, []);

  function update(next: Partial<AiRuntimePreferences>) {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    saveAiRuntimePreferences(merged);
  }

  const statusTone = useMemo(() => {
    if (prefs.mode === 'cloud' && cloudConfigured === false) return 'warning';
    if (prefs.mode !== 'cloud' && localStatus === 'missing') return 'warning';
    return 'neutral';
  }, [cloudConfigured, localStatus, prefs.mode]);

  const panelStyle = compact
    ? { display: 'grid', gap: 14 }
    : {
        display: 'grid',
        gap: 16,
        padding: 18,
        borderRadius: 20,
        border: '1px solid var(--border-2)',
        background: 'var(--surface-2)',
      };

  return (
    <div style={panelStyle}>
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="badge badge-accent">Privacy-first routing</span>
          <span
            className={`badge${statusTone === 'warning' ? '' : ' badge-success'}`}
            style={{ opacity: 0.95 }}
          >
            {prefs.mode === 'auto'
              ? 'Auto mode'
              : prefs.mode === 'local'
                ? 'Local only'
                : 'Cloud only'}
          </span>
        </div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Choose how Kivora should route AI work</div>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
            {MODE_COPY[prefs.mode].summary}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {(Object.keys(MODE_COPY) as AiMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`btn ${prefs.mode === mode ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              justifyContent: 'flex-start',
              textAlign: 'left',
              minHeight: 0,
              padding: '12px 14px',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 4,
            }}
            onClick={() => update({ mode })}
          >
            <span style={{ fontWeight: 700 }}>{MODE_COPY[mode].label}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: prefs.mode === mode ? 'rgba(255,255,255,0.84)' : 'var(--text-3)' }}>
              {MODE_COPY[mode].hint}
            </span>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Preferred local model</span>
          <select
            value={prefs.localModel}
            onChange={(event) => update({ localModel: event.target.value })}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border-2)',
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          >
            {LOCAL_MODEL_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
            {LOCAL_MODEL_OPTIONS.find((option) => option.id === prefs.localModel)?.hint}
          </span>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Preferred cloud model</span>
          <select
            value={prefs.cloudModel}
            onChange={(event) => update({ cloudModel: event.target.value })}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border-2)',
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          >
            {CLOUD_MODEL_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
            {CLOUD_MODEL_OPTIONS.find((option) => option.id === prefs.cloudModel)?.hint}
          </span>
        </label>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid var(--border-2)', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
            <strong style={{ fontSize: 'var(--text-sm)' }}>Local runtime</strong>
            <span className={`badge${localStatus === 'ready' ? ' badge-success' : ''}`}>
              {localStatus === 'checking' ? 'Checking…' : localStatus === 'ready' ? 'Ready' : 'Not detected'}
            </span>
          </div>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 'var(--text-xs)' }}>
            Uses Ollama or the bundled desktop path so your study material can stay on-device.
          </p>
        </div>

        <div style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid var(--border-2)', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
            <strong style={{ fontSize: 'var(--text-sm)' }}>Cloud API</strong>
            <span className={`badge${cloudConfigured ? ' badge-success' : ''}`}>
              {cloudConfigured == null ? 'Checking…' : cloudConfigured ? 'Configured' : 'Not configured'}
            </span>
          </div>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 'var(--text-xs)' }}>
            Uses your server-side API key. Best for convenience and stronger hosted reasoning, but it needs internet.
          </p>
        </div>
      </div>
    </div>
  );
}
