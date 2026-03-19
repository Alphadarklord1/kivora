'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AiRuntimeControls } from '@/components/models/AiRuntimeControls';
import {
  AI_PREFS_UPDATED_EVENT,
  DEFAULT_LOCAL_MODEL,
  loadAiRuntimePreferences,
  saveAiRuntimePreferences,
  type AiRuntimePreferences,
} from '@/lib/ai/runtime';
import { invalidateOllamaStatus } from '@/hooks/useOllamaStatus';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModelInfo {
  id: string;
  name: string;
  tag: string;
  size: string;
  sizeBytes: number;
  description: string;
  strengths: string[];
  ramRequired: string;
  tier: 'nano' | 'small' | 'medium' | 'large';
  mathOptimized?: boolean;
  pullCommand: string;
  bestFor: string;
  recommended?: boolean;
}

type AIStatus = 'checking' | 'ollama-ok' | 'llama-ok' | 'none';

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

// ─── Model catalogue ──────────────────────────────────────────────────────────

const MODELS: ModelInfo[] = [
  {
    id: 'qwen2.5-math',
    name: 'Qwen2.5-Math',
    tag: '1.5B',
    size: '1.1 GB',
    sizeBytes: 1_100_000_000,
    tier: 'nano',
    mathOptimized: true,
    description: 'Specialized math model. Best for arithmetic, algebra, and calculus with step-by-step solutions.',
    strengths: ['Derivatives', 'Integrals', 'Word problems', 'Proofs'],
    ramRequired: '4 GB',
    pullCommand: 'ollama pull qwen2.5-math:1.5b',
    bestFor: 'Math & STEM',
  },
  {
    id: 'qwen2.5',
    name: 'Qwen2.5',
    tag: '1.5B',
    size: '1.1 GB',
    sizeBytes: 1_100_000_000,
    tier: 'nano',
    description: 'Ultra-fast, runs on any hardware. Great for summaries, notes, and quick Q&A.',
    strengths: ['Summarize', 'Notes', 'Q&A', 'Flashcards'],
    ramRequired: '4 GB',
    pullCommand: 'ollama pull qwen2.5:1.5b',
    bestFor: 'Low-end hardware',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    tag: '7B',
    size: '4.1 GB',
    sizeBytes: 4_100_000_000,
    tier: 'small',
    recommended: true,
    description: 'The recommended default. Excellent writing, reasoning, and generation. Works on 8 GB RAM.',
    strengths: ['All tools', 'Writing', 'Reasoning', 'Coding'],
    ramRequired: '8 GB',
    pullCommand: 'ollama pull mistral',
    bestFor: 'General purpose',
  },
  {
    id: 'llama3.2',
    name: 'Llama 3.2',
    tag: '3B',
    size: '2.0 GB',
    sizeBytes: 2_000_000_000,
    tier: 'nano',
    description: "Meta's efficient model. Good speed and capability on 8 GB RAM machines.",
    strengths: ['Fast responses', 'Reasoning', 'Summaries'],
    ramRequired: '6 GB',
    pullCommand: 'ollama pull llama3.2:3b',
    bestFor: 'Fast & balanced',
  },
  {
    id: 'phi4-mini',
    name: 'Phi-4 Mini',
    tag: '3.8B',
    size: '2.3 GB',
    sizeBytes: 2_300_000_000,
    tier: 'small',
    description: "Microsoft's Phi-4 Mini — exceptional STEM reasoning for its size.",
    strengths: ['STEM', 'Math reasoning', 'Logic', 'Coding'],
    ramRequired: '6 GB',
    pullCommand: 'ollama pull phi4-mini',
    bestFor: 'STEM & reasoning',
  },
  {
    id: 'gemma3',
    name: 'Gemma 3',
    tag: '4B',
    size: '3.3 GB',
    sizeBytes: 3_300_000_000,
    tier: 'small',
    description: "Google's Gemma 3 — strong at language, structured outputs, and essay writing.",
    strengths: ['Writing', 'Analysis', 'Structured output', 'MCQ'],
    ramRequired: '8 GB',
    pullCommand: 'ollama pull gemma3:4b',
    bestFor: 'Writing & analysis',
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    tag: '7B',
    size: '4.7 GB',
    sizeBytes: 4_700_000_000,
    tier: 'medium',
    description: 'Chain-of-thought model that shows its thinking step by step. Great for hard proofs.',
    strengths: ['Step-by-step proofs', 'Math', 'Hard reasoning', 'Coding'],
    ramRequired: '12 GB',
    pullCommand: 'ollama pull deepseek-r1:7b',
    bestFor: 'Advanced reasoning',
  },
  {
    id: 'mistral-large',
    name: 'Mistral Large',
    tag: '24B',
    size: '14 GB',
    sizeBytes: 14_000_000_000,
    tier: 'large',
    description: 'Top-tier quality for complex exam prep and essay generation. Needs 24 GB RAM.',
    strengths: ['Exam prep', 'Essay writing', 'Complex reasoning', 'All tools'],
    ramRequired: '24 GB',
    pullCommand: 'ollama pull mistral:latest',
    bestFor: 'High-end systems',
  },
];

const TIER_CONFIG: Record<string, { color: string; label: string; emoji: string }> = {
  nano:   { color: '#52b788', label: 'Nano',   emoji: '⚡' },
  small:  { color: '#4f86f7', label: 'Small',  emoji: '🔵' },
  medium: { color: '#a78bfa', label: 'Medium', emoji: '🟣' },
  large:  { color: '#e07a52', label: 'Large',  emoji: '🔶' },
};

// ─── Main component ───────────────────────────────────────────────────────────

export function InstalledModelsPanel() {
  const [aiStatus, setAiStatus] = useState<AIStatus>('checking');
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [defaultModel, setDefaultModel] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_LOCAL_MODEL;
    return loadAiRuntimePreferences().localModel || DEFAULT_LOCAL_MODEL;
  });
  const [filterTier, setFilterTier] = useState<string>('all');
  const [ollamaVersion, setOllamaVersion] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const checkStatus = useCallback(async () => {
    setRefreshing(true);
    setAiStatus('checking');
    invalidateOllamaStatus();
    try {
      const ollamaBase = process.env.NEXT_PUBLIC_OLLAMA_URL ?? 'http://localhost:11434';
      const res = await fetch(`${ollamaBase}/api/version`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const ver = await res.json() as { version?: string };
        setOllamaVersion(ver?.version ?? 'unknown');
        setAiStatus('ollama-ok');
        const listRes = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (listRes.ok) {
          const data = await listRes.json() as { models?: OllamaModel[] };
          setOllamaModels(data?.models ?? []);
        }
        setRefreshing(false);
        return;
      }
    } catch { /* noop */ }

    try {
      const res = await fetch('/api/llama-status', { signal: AbortSignal.timeout(3000) });
      if (res.ok) { setAiStatus('llama-ok'); setRefreshing(false); return; }
    } catch { /* noop */ }

    setAiStatus('none');
    setRefreshing(false);
  }, []);

  function setAsDefault(modelId: string) {
    setDefaultModel(modelId);
    const nextPrefs = { ...loadAiRuntimePreferences(), localModel: modelId };
    saveAiRuntimePreferences(nextPrefs);
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void checkStatus(); });
    return () => cancelAnimationFrame(frame);
  }, [checkStatus]);

  useEffect(() => {
    function handlePrefsUpdate(event: Event) {
      const detail = (event as CustomEvent<AiRuntimePreferences>).detail;
      if (!detail) return;
      setDefaultModel(detail.localModel || DEFAULT_LOCAL_MODEL);
    }
    window.addEventListener(AI_PREFS_UPDATED_EVENT, handlePrefsUpdate as EventListener);
    return () => window.removeEventListener(AI_PREFS_UPDATED_EVENT, handlePrefsUpdate as EventListener);
  }, []);

  const copyCommand = useCallback((cmd: string, id: string) => {
    navigator.clipboard.writeText(cmd).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const isInstalled = useCallback((model: ModelInfo) => {
    return ollamaModels.some(m =>
      m.name.toLowerCase().includes(model.id.toLowerCase()) ||
      m.name.toLowerCase().includes(model.pullCommand.split('/').pop()?.split(':')[0] ?? '')
    );
  }, [ollamaModels]);

  const filteredModels = filterTier === 'all' ? MODELS : MODELS.filter(m => m.tier === filterTier);

  return (
    <div className="mdl-shell">

      {/* Top status bar */}
      <div className="mdl-topbar">
        <ConnectionBadge status={aiStatus} ollamaVersion={ollamaVersion} modelCount={ollamaModels.length} />
        <button className="mdl-refresh-btn" onClick={checkStatus} disabled={refreshing}>
          {refreshing ? '⟳ Checking…' : '↻ Refresh status'}
        </button>
      </div>

      {/* AI routing controls */}
      <section className="mdl-section">
        <div className="mdl-section-header">
          <h2>AI routing</h2>
          <p>Choose whether Kivora uses local AI (private, offline), cloud AI (convenient), or both automatically.</p>
        </div>
        <AiRuntimeControls />
      </section>

      {/* Setup guide — only shown when no runtime found */}
      {aiStatus === 'none' && <SetupGuide />}

      {/* Installed models */}
      {aiStatus === 'ollama-ok' && ollamaModels.length > 0 && (
        <section className="mdl-section">
          <div className="mdl-section-header">
            <h2>Installed models ({ollamaModels.length})</h2>
            <p>These models are downloaded and ready to use. Set the active model in the routing panel above.</p>
          </div>
          <div className="installed-grid">
            {ollamaModels.map(m => (
              <div key={m.name} className="installed-item">
                <div className="inst-dot" />
                <div className="inst-info">
                  <span className="inst-name">{m.name}</span>
                  <span className="inst-size">{formatBytes(m.size)}</span>
                </div>
                <span className="inst-ready">✓ Ready</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Model catalogue */}
      <section className="mdl-section">
        <div className="mdl-section-header">
          <h2>Model catalogue</h2>
          <p>Browse available models. Copy the install command and run it in your terminal after installing Ollama.</p>
        </div>

        <div className="mdl-filter">
          {[
            { id: 'all',    label: 'All' },
            { id: 'nano',   label: '⚡ Nano  ≤4 GB RAM' },
            { id: 'small',  label: '🔵 Small  6–8 GB RAM' },
            { id: 'medium', label: '🟣 Medium  12 GB RAM' },
            { id: 'large',  label: '🔶 Large  24 GB RAM' },
          ].map(f => (
            <button
              key={f.id}
              className={`mdl-filter-btn${filterTier === f.id ? ' active' : ''}`}
              onClick={() => setFilterTier(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="models-grid">
          {filteredModels.map(model => {
            const installed = isInstalled(model);
            const isDefault = defaultModel === model.id;
            const expanded  = expandedModel === model.id;
            const tc        = TIER_CONFIG[model.tier];

            return (
              <div
                key={model.id}
                className={`model-card${installed ? ' installed' : ''}${isDefault ? ' is-default' : ''}`}
              >
                {/* Title row */}
                <div className="mc-title-row">
                  <span className="mc-name">{model.name}</span>
                  <span className="mc-tag">{model.tag}</span>
                  {model.mathOptimized && <span className="mc-badge math">∑ Math</span>}
                  {model.recommended   && <span className="mc-badge rec">★ Recommended</span>}
                  {installed           && <span className="mc-badge inst">✓ Installed</span>}
                  {isDefault           && <span className="mc-badge act">⚡ Active</span>}
                </div>

                {/* Description */}
                <p className="mc-desc">{model.description}</p>

                {/* Spec grid — always visible */}
                <div className="mc-specs">
                  <div className="mc-spec">
                    <span className="mc-spec-lbl">Size</span>
                    <span className="mc-spec-val">{model.size}</span>
                  </div>
                  <div className="mc-spec">
                    <span className="mc-spec-lbl">RAM needed</span>
                    <span className="mc-spec-val">{model.ramRequired}</span>
                  </div>
                  <div className="mc-spec">
                    <span className="mc-spec-lbl">Tier</span>
                    <span className="mc-spec-val" style={{ color: tc.color }}>{tc.emoji} {tc.label}</span>
                  </div>
                  <div className="mc-spec">
                    <span className="mc-spec-lbl">Best for</span>
                    <span className="mc-spec-val">{model.bestFor}</span>
                  </div>
                </div>

                {/* Tags */}
                <div className="mc-tags">
                  {model.strengths.map(s => <span key={s} className="mc-chip">{s}</span>)}
                </div>

                {/* Actions */}
                <div className="mc-actions">
                  <button
                    className={`mc-set-btn${isDefault ? ' active' : ''}`}
                    onClick={() => setAsDefault(model.id)}
                  >
                    {isDefault ? '✓ Active model' : 'Set as active'}
                  </button>
                  <button
                    className="mc-install-btn"
                    onClick={() => setExpandedModel(expanded ? null : model.id)}
                  >
                    {expanded ? 'Hide ▲' : 'Install ▼'}
                  </button>
                </div>

                {/* Install command — collapsible */}
                {expanded && (
                  <div className="mc-install">
                    <span className="mc-install-lbl">Run this in your terminal</span>
                    <div className="mc-cmd-row">
                      <code className="mc-cmd">{model.pullCommand}</code>
                      <button
                        className={`mc-copy-btn${copied === model.id ? ' copied' : ''}`}
                        onClick={() => copyCommand(model.pullCommand, model.id)}
                      >
                        {copied === model.id ? '✓ Copied!' : 'Copy'}
                      </button>
                    </div>
                    {aiStatus === 'ollama-ok' && !installed && (
                      <div className="mc-note warn">⚠ Not installed yet — run the command, then click Refresh status.</div>
                    )}
                    {installed && (
                      <div className="mc-note ok">✓ Installed and ready to use.</div>
                    )}
                    {aiStatus !== 'ollama-ok' && (
                      <div className="mc-note">
                        Ollama is not running.{' '}
                        <a href="https://ollama.com" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
                          Install Ollama
                        </a>{' '}
                        first, then run the command above.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Bundled desktop models note */}
      <section className="mdl-section">
        <div className="bundled-card">
          <div className="bundled-icon">📦</div>
          <div>
            <h3>Bundled offline models (Desktop App)</h3>
            <p>The desktop app ships with a compact model built in — no internet or Ollama needed. All study tools work offline from the start.</p>
            <div className="bundled-tiers">
              <div className="bundled-tier"><strong>Laptop</strong><span>~1 GB · Qwen2.5-1.5B · 4 GB RAM</span></div>
              <div className="bundled-tier"><strong>Balanced</strong><span>~2 GB · Phi-4-Mini · 6 GB RAM</span></div>
              <div className="bundled-tier"><strong>PC</strong><span>~4 GB · Mistral-7B · 8 GB RAM</span></div>
            </div>
          </div>
        </div>
      </section>

      <style jsx>{`
        .mdl-shell { display: flex; flex-direction: column; gap: 0; }

        .mdl-topbar {
          display: flex; align-items: center; gap: 10px;
          padding: 0 0 16px; flex-wrap: wrap;
        }
        .mdl-refresh-btn {
          padding: 8px 16px; border-radius: 10px;
          border: 1.5px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-secondary);
          cursor: pointer; font-size: 13px; font-weight: 500; flex-shrink: 0;
          transition: all 0.12s;
        }
        .mdl-refresh-btn:hover { border-color: var(--primary); color: var(--primary); }
        .mdl-refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .conn-badge {
          flex: 1; display: flex; align-items: center; gap: 8px;
          padding: 9px 14px; border-radius: 10px;
          font-size: 13px; font-weight: 500; min-width: 0;
        }
        .conn-badge.ok      { background: #52b78818; border: 1px solid #52b78840; color: #52b788; }
        .conn-badge.warn    { background: #f59e0b18; border: 1px solid #f59e0b40; color: #f59e0b; }
        .conn-badge.loading { background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--text-muted); }

        .mdl-section { padding: 0 0 24px; border-bottom: 1px solid var(--border-subtle); margin-bottom: 24px; }
        .mdl-section:last-child { border-bottom: none; margin-bottom: 0; }
        .mdl-section-header { margin-bottom: 14px; }
        .mdl-section-header h2 { margin: 0 0 4px; font-size: 15px; font-weight: 700; color: var(--text-primary); }
        .mdl-section-header p  { margin: 0; font-size: 12.5px; color: var(--text-muted); line-height: 1.5; }

        .installed-grid { display: flex; flex-direction: column; gap: 6px; }
        .installed-item {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px; border-radius: 10px;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
        }
        .inst-dot { width: 9px; height: 9px; border-radius: 50%; background: #52b788; flex-shrink: 0; }
        .inst-info { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 10px; }
        .inst-name { font-size: 13px; font-weight: 500; color: var(--text-primary); }
        .inst-size { font-size: 12px; color: var(--text-muted); }
        .inst-ready { font-size: 11px; padding: 2px 8px; border-radius: 8px; background: #52b78820; color: #52b788; font-weight: 600; flex-shrink: 0; }

        .mdl-filter { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .mdl-filter-btn {
          padding: 5px 11px; border-radius: 8px; white-space: nowrap;
          border: 1.5px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-secondary);
          font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.12s;
        }
        .mdl-filter-btn.active { background: var(--primary); color: white; border-color: var(--primary); }
        .mdl-filter-btn:hover:not(.active) { border-color: var(--primary); color: var(--primary); }

        .models-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 10px;
        }

        .model-card {
          display: flex; flex-direction: column; gap: 10px;
          padding: 14px 16px;
          border: 1.5px solid var(--border-subtle);
          border-radius: 14px;
          background: var(--bg-elevated);
          transition: border-color 0.15s;
        }
        .model-card.installed  { border-color: rgba(82,183,136,0.35); }
        .model-card.is-default { border-color: var(--primary); }

        .mc-title-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
        .mc-name { font-size: 15px; font-weight: 700; color: var(--text-primary); }
        .mc-tag {
          font-size: 10px; padding: 2px 7px; border-radius: 5px;
          background: var(--bg-surface); color: var(--text-muted);
          font-weight: 600; border: 1px solid var(--border-subtle);
        }
        .mc-badge { font-size: 10px; padding: 2px 7px; border-radius: 5px; font-weight: 700; }
        .mc-badge.math { background: #4f86f720; color: #4f86f7; }
        .mc-badge.rec  { background: #f59e0b20; color: #f59e0b; }
        .mc-badge.inst { background: #52b78820; color: #52b788; }
        .mc-badge.act  { background: color-mix(in srgb, var(--primary) 15%, transparent); color: var(--primary); }

        .mc-desc { margin: 0; font-size: 12px; color: var(--text-secondary); line-height: 1.55; }

        .mc-specs { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
        .mc-spec {
          padding: 6px 9px; border-radius: 7px;
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
        }
        .mc-spec-lbl { display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); margin-bottom: 2px; }
        .mc-spec-val { font-size: 12px; font-weight: 600; color: var(--text-primary); }

        .mc-tags { display: flex; flex-wrap: wrap; gap: 4px; }
        .mc-chip {
          font-size: 11px; padding: 2px 8px; border-radius: 6px;
          background: var(--bg-surface); color: var(--text-secondary);
          border: 1px solid var(--border-subtle);
        }

        .mc-actions { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 2px; }
        .mc-set-btn {
          flex: 1; padding: 6px 11px; border-radius: 8px;
          border: 1.5px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-secondary);
          font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.12s;
        }
        .mc-set-btn:hover { border-color: var(--primary); color: var(--primary); }
        .mc-set-btn.active { background: var(--primary); color: white; border-color: var(--primary); }
        .mc-install-btn {
          padding: 6px 11px; border-radius: 8px;
          border: 1.5px solid var(--border-subtle);
          background: transparent; color: var(--text-muted);
          font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.12s;
          white-space: nowrap;
        }
        .mc-install-btn:hover { color: var(--text-secondary); border-color: var(--border-mid, var(--border-subtle)); }

        .mc-install {
          padding: 11px 12px; border-radius: 9px;
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          display: flex; flex-direction: column; gap: 7px;
        }
        .mc-install-lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
        .mc-cmd-row { display: flex; align-items: center; gap: 6px; }
        .mc-cmd {
          flex: 1; padding: 7px 10px; border-radius: 7px;
          background: #1e1e2e; color: #a6e3a1;
          font-size: 12px; font-family: "JetBrains Mono", "Fira Code", monospace;
          border: 1px solid var(--border-subtle); overflow: auto; white-space: nowrap;
        }
        .mc-copy-btn {
          padding: 5px 10px; border-radius: 6px;
          border: 1.5px solid var(--border-subtle);
          background: var(--bg-elevated); color: var(--text-secondary);
          font-size: 11px; font-weight: 600; cursor: pointer;
          transition: all 0.1s; flex-shrink: 0;
        }
        .mc-copy-btn:hover { border-color: var(--primary); color: var(--primary); }
        .mc-copy-btn.copied { background: #52b788; color: white; border-color: #52b788; }
        .mc-note {
          font-size: 11px; padding: 6px 9px; border-radius: 7px;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          color: var(--text-muted);
        }
        .mc-note.warn { background: #f59e0b10; border-color: #f59e0b30; color: #f59e0b; }
        .mc-note.ok   { background: #52b78810; border-color: #52b78830; color: #52b788; }

        .bundled-card {
          display: flex; gap: 16px; align-items: flex-start;
          padding: 16px 18px; border-radius: 14px;
          background: color-mix(in srgb, #a78bfa 6%, var(--bg-elevated));
          border: 1.5px solid color-mix(in srgb, #a78bfa 20%, var(--border-subtle));
        }
        .bundled-icon { font-size: 26px; flex-shrink: 0; }
        .bundled-card h3 { margin: 0 0 5px; font-size: 14px; font-weight: 700; }
        .bundled-card p  { margin: 0 0 11px; font-size: 12.5px; color: var(--text-secondary); line-height: 1.55; }
        .bundled-tiers { display: flex; gap: 7px; flex-wrap: wrap; }
        .bundled-tier {
          padding: 6px 11px; border-radius: 8px;
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          display: flex; flex-direction: column; gap: 2px;
        }
        .bundled-tier strong { font-size: 12px; color: var(--text-primary); }
        .bundled-tier span   { font-size: 11px; color: var(--text-muted); }

        @media (max-width: 640px) {
          .models-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

// ─── Connection Badge ──────────────────────────────────────────────────────────

function ConnectionBadge({ status, ollamaVersion, modelCount }: {
  status: AIStatus; ollamaVersion: string | null; modelCount: number;
}) {
  if (status === 'checking') return <div className="conn-badge loading">⟳ Detecting AI runtime…</div>;
  if (status === 'ollama-ok') return (
    <div className="conn-badge ok">
      ● Ollama {ollamaVersion ? `v${ollamaVersion}` : ''} connected · {modelCount} model{modelCount !== 1 ? 's' : ''} installed · AI ready
    </div>
  );
  if (status === 'llama-ok') return (
    <div className="conn-badge ok">● llama.cpp detected · AI features active</div>
  );
  return (
    <div className="conn-badge warn">⚠ No AI runtime detected — install Ollama to enable AI features</div>
  );
}

// ─── Setup Guide ──────────────────────────────────────────────────────────────

function SetupGuide() {
  const [os, setOs] = useState<'mac' | 'win' | 'linux'>(() => {
    if (typeof navigator === 'undefined') return 'mac';
    if (navigator.userAgent.includes('Win')) return 'win';
    if (navigator.userAgent.includes('Linux')) return 'linux';
    return 'mac';
  });
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState<number | null>(null);

  const copy = (text: string, i: number) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(i);
    setTimeout(() => setCopied(null), 2000);
  };

  const steps: { title: string; desc: string; cmd: Record<string, string>; note: string }[] = [
    {
      title: '1. Install Ollama',
      desc: 'Download the free open-source runtime that manages your local models.',
      cmd: { mac: 'brew install ollama', win: 'winget install Ollama.Ollama', linux: 'curl -fsSL https://ollama.com/install.sh | sh' },
      note: 'Or download the GUI installer from ollama.com',
    },
    {
      title: '2. Start Ollama',
      desc: 'Launch the service. It runs in the background on port 11434.',
      cmd: { mac: 'ollama serve', win: 'ollama serve', linux: 'ollama serve' },
      note: 'On macOS, the Ollama app in the menu bar does this automatically.',
    },
    {
      title: '3. Download a model',
      desc: 'Pull your first model. Mistral 7B is the recommended starting point.',
      cmd: { mac: 'ollama pull mistral', win: 'ollama pull mistral', linux: 'ollama pull mistral' },
      note: 'Downloads ~4 GB. Replace "mistral" with any model ID from the catalogue below.',
    },
    {
      title: '4. Refresh Kivora',
      desc: 'Click Refresh status above. The banner will turn green when Ollama is connected.',
      cmd: { mac: '# No command needed', win: '# No command needed', linux: '# No command needed' },
      note: 'Kivora detects Ollama automatically on port 11434.',
    },
  ];

  return (
    <section className="sg">
      <div className="sg-header">
        <div>
          <h2>Set up local AI in 4 steps</h2>
          <p>Run AI models privately on your device — no internet required after setup.</p>
        </div>
        <div className="sg-os-tabs">
          {(['mac','win','linux'] as const).map(o => (
            <button key={o} className={`sg-os-btn${os === o ? ' active' : ''}`} onClick={() => setOs(o)}>
              {o === 'mac' ? '🍎 Mac' : o === 'win' ? '🪟 Windows' : '🐧 Linux'}
            </button>
          ))}
        </div>
      </div>

      <div className="sg-steps">
        {steps.map((s, i) => {
          const isActive = step === i;
          const isDone   = step > i;
          const cmd = s.cmd[os] ?? s.cmd.mac;
          return (
            <div key={i} className={`sg-step${isActive ? ' active' : isDone ? ' done' : ''}`} onClick={() => setStep(i)}>
              <div className={`sg-num${isActive ? ' active' : isDone ? ' done' : ''}`}>
                {isDone ? '✓' : i + 1}
              </div>
              <div className="sg-body">
                <div className="sg-title">{s.title}</div>
                {isActive && (
                  <>
                    <p className="sg-desc">{s.desc}</p>
                    {!cmd.startsWith('#') && (
                      <div className="sg-cmd-row">
                        <code className="sg-cmd">{cmd}</code>
                        <button
                          className={`sg-copy${copied === i ? ' copied' : ''}`}
                          onClick={e => { e.stopPropagation(); copy(cmd, i); }}
                        >
                          {copied === i ? '✓' : 'Copy'}
                        </button>
                      </div>
                    )}
                    <p className="sg-note">{s.note}</p>
                    {i < steps.length - 1 && (
                      <button className="sg-next" onClick={e => { e.stopPropagation(); setStep(i + 1); }}>
                        Next step →
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <a className="sg-cta" href="https://ollama.com" target="_blank" rel="noreferrer">
        Visit ollama.com for the installer →
      </a>

      <style jsx>{`
        .sg {
          padding: 18px; border-radius: 14px; margin-bottom: 24px;
          background: var(--bg-elevated); border: 1.5px solid var(--border-subtle);
        }
        .sg-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 12px; margin-bottom: 16px; flex-wrap: wrap;
        }
        .sg-header h2 { margin: 0 0 4px; font-size: 14px; font-weight: 700; }
        .sg-header p  { margin: 0; font-size: 12px; color: var(--text-muted); }
        .sg-os-tabs { display: flex; gap: 4px; flex-shrink: 0; }
        .sg-os-btn {
          padding: 5px 10px; border-radius: 7px; font-size: 11px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-secondary); cursor: pointer;
        }
        .sg-os-btn.active { background: var(--primary); color: white; border-color: var(--primary); }

        .sg-steps { display: flex; flex-direction: column; gap: 3px; margin-bottom: 14px; }
        .sg-step {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 9px 11px; border-radius: 9px; cursor: pointer;
          border: 1px solid transparent; transition: background 0.1s;
        }
        .sg-step.active { background: var(--bg-surface); border-color: var(--border-subtle); }
        .sg-step.done   { opacity: 0.65; }
        .sg-step:not(.active):hover { background: var(--bg-surface); }

        .sg-num {
          width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700;
          background: var(--bg-surface); border: 2px solid var(--border-subtle); color: var(--text-muted);
        }
        .sg-num.active { background: var(--primary); border-color: var(--primary); color: white; }
        .sg-num.done   { background: #52b788; border-color: #52b788; color: white; }

        .sg-body { flex: 1; min-width: 0; }
        .sg-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .sg-desc  { margin: 4px 0 8px; font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
        .sg-cmd-row { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
        .sg-cmd {
          flex: 1; padding: 6px 9px; border-radius: 7px;
          background: #1e1e2e; color: #a6e3a1;
          font-size: 11.5px; font-family: "JetBrains Mono", monospace;
          border: 1px solid var(--border-subtle); overflow: auto; white-space: nowrap;
        }
        .sg-copy {
          padding: 5px 9px; border-radius: 6px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated); color: var(--text-secondary);
          font-size: 11px; font-weight: 600; cursor: pointer; flex-shrink: 0; transition: all 0.1s;
        }
        .sg-copy:hover { border-color: var(--primary); color: var(--primary); }
        .sg-copy.copied { background: #52b788; color: white; border-color: #52b788; }
        .sg-note { margin: 0 0 8px; font-size: 11px; color: var(--text-muted); }
        .sg-next {
          padding: 5px 12px; border-radius: 7px;
          border: 1.5px solid var(--primary);
          background: transparent; color: var(--primary);
          font-size: 11.5px; font-weight: 600; cursor: pointer;
        }
        .sg-cta {
          display: inline-flex; align-items: center;
          padding: 7px 14px; border-radius: 9px;
          background: var(--primary); color: white;
          text-decoration: none; font-size: 12px; font-weight: 600;
          transition: opacity 0.12s;
        }
        .sg-cta:hover { opacity: 0.88; }
      `}</style>
    </section>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return '?';
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1e6).toFixed(0)} MB`;
}
