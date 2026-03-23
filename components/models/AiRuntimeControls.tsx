'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AI_PREFS_UPDATED_EVENT,
  CLOUD_MODEL_OPTIONS,
  loadAiRuntimePreferences,
  LOCAL_MODEL_OPTIONS,
  saveAiRuntimePreferences,
  type AiMode,
  type AiRuntimePreferences,
} from '@/lib/ai/runtime';
import { INTERNET_REQUIRED_FEATURES, OFFLINE_READY_FEATURES } from '@/lib/ai/local-runtime';
import { useLocalRuntimeStatus } from '@/hooks/useLocalRuntimeStatus';

const QWEN_CMD = 'ollama pull qwen2.5';
const QWEN_DISMISS_KEY = 'qwen-setup-dismissed';

function QwenSetupBanner() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return sessionStorage.getItem(QWEN_DISMISS_KEY) === '1';
  });
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dismiss() {
    sessionStorage.setItem(QWEN_DISMISS_KEY, '1');
    setDismissed(true);
  }

  function copyCmd() {
    void navigator.clipboard.writeText(QWEN_CMD).then(() => {
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  if (dismissed) return null;

  return (
    <div
      style={{
        background: 'rgba(245,158,11,0.1)',
        border: '1px solid rgba(245,158,11,0.3)',
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 13,
        display: 'grid',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.5 }}>
          <span role="img" aria-label="llama">🦙</span>{' '}
          <strong>Offline AI setup</strong> — Run{' '}
          <code
            style={{
              background: 'rgba(245,158,11,0.15)',
              borderRadius: 4,
              padding: '1px 5px',
              fontFamily: 'monospace',
              fontSize: 12,
            }}
          >
            {QWEN_CMD}
          </code>{' '}
          in your terminal to enable local AI. Groq (online) is active as fallback.
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-3)',
            fontSize: 16,
            lineHeight: 1,
            flexShrink: 0,
            padding: '0 2px',
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={copyCmd}
          style={{
            background: 'rgba(245,158,11,0.18)',
            border: '1px solid rgba(245,158,11,0.35)',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            color: 'var(--text)',
          }}
        >
          {copied ? '✓ Copied' : 'Copy command'}
        </button>
        <button
          type="button"
          onClick={dismiss}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-2)',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            color: 'var(--text-2)',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

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
  const localStatus = useLocalRuntimeStatus();
  const [cloudConfigured, setCloudConfigured] = useState<boolean | null>(null);

  useEffect(() => {
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
    if (prefs.mode !== 'cloud' && localStatus.state === 'missing') return 'warning';
    return 'neutral';
  }, [cloudConfigured, localStatus.state, prefs.mode]);

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

  // Show the Qwen setup banner when user chose "local only" but Ollama isn't reachable
  const showQwenBanner = prefs.mode === 'local' && localStatus.state === 'missing';

  return (
    <div style={panelStyle}>
      {showQwenBanner && <QwenSetupBanner />}
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
            <span className={`badge${localStatus.state === 'ready' ? ' badge-success' : ''}`}>
              {localStatus.state === 'checking' ? 'Checking…' : localStatus.state === 'ready' ? 'Ready' : 'Not detected'}
            </span>
          </div>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 4 }}>
            {localStatus.label}
          </div>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 'var(--text-xs)' }}>
            {localStatus.detail}
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

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <div style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid var(--border-2)', background: 'var(--surface)' }}>
          <strong style={{ fontSize: 'var(--text-sm)', display: 'block', marginBottom: 8 }}>Works fully local</strong>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-3)', fontSize: 'var(--text-xs)', display: 'grid', gap: 6 }}>
            {OFFLINE_READY_FEATURES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid var(--border-2)', background: 'var(--surface)' }}>
          <strong style={{ fontSize: 'var(--text-sm)', display: 'block', marginBottom: 8 }}>Still needs internet</strong>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-3)', fontSize: 'var(--text-xs)', display: 'grid', gap: 6 }}>
            {INTERNET_REQUIRED_FEATURES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
