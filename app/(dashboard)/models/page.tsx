'use client';

import { useState, useEffect, useCallback } from 'react';

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
    description: 'Specialized math model by Alibaba. Best for arithmetic, algebra, and calculus step-by-step.',
    strengths: ['Derivatives', 'Integrals', 'Word problems', 'Step-by-step proofs'],
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
    description: 'The recommended default. Balanced performance — excellent writing, reasoning, and generation.',
    strengths: ['All tools', 'Writing', 'Reasoning', 'Coding'],
    ramRequired: '8 GB',
    pullCommand: 'ollama pull mistral',
    bestFor: 'General purpose (recommended)',
  },
  {
    id: 'llama3.2',
    name: 'Llama 3.2',
    tag: '3B',
    size: '2.0 GB',
    sizeBytes: 2_000_000_000,
    tier: 'nano',
    description: "Meta's efficient model. Good balance of speed and capability on 8GB RAM machines.",
    strengths: ['Fast responses', 'Reasoning', 'Summaries'],
    ramRequired: '6 GB',
    pullCommand: 'ollama pull llama3.2:3b',
    bestFor: 'Fast, balanced',
  },
  {
    id: 'phi4-mini',
    name: 'Phi-4 Mini',
    tag: '3.8B',
    size: '2.3 GB',
    sizeBytes: 2_300_000_000,
    tier: 'small',
    description: "Microsoft's Phi-4 Mini — exceptional reasoning for its size. Great for STEM.",
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
    description: "Google's Gemma 3 — strong at language tasks, structured outputs, and analysis.",
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
    description: 'Chain-of-thought reasoning model. Shows its thinking process step by step.',
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
    description: 'Top-tier Mistral model. Best quality for complex exam prep and essay generation.',
    strengths: ['Exam prep', 'Essay writing', 'Complex reasoning', 'All tools'],
    ramRequired: '24 GB',
    pullCommand: 'ollama pull mistral:latest',
    bestFor: 'High-end systems',
  },
];

const TIER_COLORS: Record<string, string> = {
  nano: '#52b788',
  small: '#4f86f7',
  medium: '#a78bfa',
  large: '#e07a52',
};

const TIER_LABELS: Record<string, string> = {
  nano: 'Nano · Fast',
  small: 'Small · Balanced',
  medium: 'Medium · Powerful',
  large: 'Large · Maximum',
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function ModelsPage() {
  const [aiStatus, setAiStatus] = useState<AIStatus>('checking');
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [filterTier, setFilterTier] = useState<string>('all');
  const [ollamaVersion, setOllamaVersion] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setAiStatus('checking');
    // Check Ollama
    try {
      const ollamaBase = process.env.NEXT_PUBLIC_OLLAMA_URL ?? 'http://localhost:11434';
      const res = await fetch(`${ollamaBase}/api/version`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const ver = await res.json();
        setOllamaVersion(ver?.version ?? 'unknown');
        setAiStatus('ollama-ok');
        // List installed models
        const listRes = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (listRes.ok) {
          const data = await listRes.json();
          setOllamaModels(data?.models ?? []);
        }
        return;
      }
    } catch { /* noop */ }

    // Check llama.cpp
    try {
      const res = await fetch('/api/llama-status', { signal: AbortSignal.timeout(3000) });
      if (res.ok) { setAiStatus('llama-ok'); return; }
    } catch { /* noop */ }

    setAiStatus('none');
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const copyCommand = useCallback((cmd: string, id: string) => {
    navigator.clipboard.writeText(cmd).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const isInstalled = useCallback((model: ModelInfo) => {
    return ollamaModels.some(m => m.name.toLowerCase().includes(model.id.toLowerCase()) ||
      m.name.toLowerCase().includes(model.pullCommand.split('/').pop()?.split(':')[0] ?? ''));
  }, [ollamaModels]);

  const filteredModels = filterTier === 'all' ? MODELS : MODELS.filter(m => m.tier === filterTier);

  return (
    <div className="mdl-shell">
      {/* Header */}
      <div className="mdl-header">
        <div className="mdl-brand">
          <span className="mdl-brand-icon">🤖</span>
          <div>
            <h1>AI Models</h1>
            <p>Manage offline AI models · No data leaves your device</p>
          </div>
        </div>
        <button className="mdl-refresh-btn" onClick={checkStatus}>↻ Refresh</button>
      </div>

      {/* Status banner */}
      <StatusBanner status={aiStatus} ollamaVersion={ollamaVersion} modelsInstalled={ollamaModels.length} />

      {/* Setup guide */}
      {aiStatus === 'none' && <SetupGuide />}

      {/* Installed models */}
      {aiStatus === 'ollama-ok' && ollamaModels.length > 0 && (
        <div className="mdl-section">
          <h2 className="mdl-section-title">Installed Models</h2>
          <div className="installed-list">
            {ollamaModels.map(m => (
              <div key={m.name} className="installed-item">
                <div className="inst-dot" style={{ background: '#52b788' }} />
                <div className="inst-info">
                  <span className="inst-name">{m.name}</span>
                  <span className="inst-size">{formatBytes(m.size)}</span>
                </div>
                <span className="inst-badge">Active</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="mdl-filter">
        <span className="mdl-filter-label">Filter by size:</span>
        {['all', 'nano', 'small', 'medium', 'large'].map(tier => (
          <button
            key={tier}
            className={`mdl-filter-btn${filterTier === tier ? ' active' : ''}`}
            onClick={() => setFilterTier(tier)}
          >
            {tier === 'all' ? 'All' : TIER_LABELS[tier]}
          </button>
        ))}
      </div>

      {/* Models grid */}
      <div className="models-grid">
        {filteredModels.map(model => {
          const installed = isInstalled(model);
          const expanded = activeModel === model.id;
          return (
            <div
              key={model.id}
              className={`model-card${expanded ? ' expanded' : ''}${installed ? ' installed' : ''}`}
            >
              <div className="mc-header" onClick={() => setActiveModel(expanded ? null : model.id)}>
                <div className="mc-left">
                  <div className="mc-name-row">
                    <span className="mc-name">{model.name}</span>
                    <span className="mc-tag">{model.tag}</span>
                    {model.mathOptimized && <span className="mc-math-badge">∑ Math</span>}
                    {installed && <span className="mc-installed-badge">✓ Installed</span>}
                  </div>
                  <span className="mc-best">{model.bestFor}</span>
                </div>
                <div className="mc-right">
                  <div className="mc-tier" style={{ color: TIER_COLORS[model.tier], background: TIER_COLORS[model.tier]+'18' }}>
                    {TIER_LABELS[model.tier]}
                  </div>
                  <span className="mc-size">{model.size}</span>
                  <span className="mc-chevron">{expanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {expanded && (
                <div className="mc-body">
                  <p className="mc-desc">{model.description}</p>

                  <div className="mc-strengths">
                    <span className="mc-section-label">Best for</span>
                    <div className="mc-tags">
                      {model.strengths.map(s => (
                        <span key={s} className="mc-strength-tag">{s}</span>
                      ))}
                    </div>
                  </div>

                  <div className="mc-specs">
                    <div className="mc-spec">
                      <span className="mc-spec-label">RAM Required</span>
                      <span className="mc-spec-value">{model.ramRequired}</span>
                    </div>
                    <div className="mc-spec">
                      <span className="mc-spec-label">Download Size</span>
                      <span className="mc-spec-value">{model.size}</span>
                    </div>
                    <div className="mc-spec">
                      <span className="mc-spec-label">Category</span>
                      <span className="mc-spec-value">{TIER_LABELS[model.tier]}</span>
                    </div>
                  </div>

                  <div className="mc-install">
                    <span className="mc-section-label">Install with Ollama</span>
                    <div className="mc-cmd-row">
                      <code className="mc-cmd">{model.pullCommand}</code>
                      <button
                        className={`mc-copy-btn${copied === model.id ? ' copied' : ''}`}
                        onClick={() => copyCommand(model.pullCommand, model.id)}
                      >
                        {copied === model.id ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="mc-cmd-note">
                      Run this in your terminal after installing Ollama.
                      The model will be available immediately.
                    </p>
                  </div>

                  {installed && (
                    <div className="mc-active-note">
                      ✓ This model is installed and ready. Kivora will use it automatically for AI generation and math verification.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bundled models note */}
      <div className="bundled-section">
        <div className="bundled-icon">📦</div>
        <div>
          <h3 className="bundled-title">Bundled Offline Models (Desktop App)</h3>
          <p className="bundled-desc">
            When running Kivora as a desktop app (Electron), a compact offline model is bundled directly with the installer.
            No internet or Ollama required — study tools work out of the box.
          </p>
          <div className="bundled-tiers">
            <div className="bundled-tier">
              <span className="bt-label">Laptop</span>
              <span className="bt-desc">~1 GB · Qwen2.5-1.5B · 4GB RAM</span>
            </div>
            <div className="bundled-tier">
              <span className="bt-label">Balanced</span>
              <span className="bt-desc">~2 GB · Phi-4-Mini · 6GB RAM</span>
            </div>
            <div className="bundled-tier">
              <span className="bt-label">PC</span>
              <span className="bt-desc">~4 GB · Mistral-7B · 8GB RAM</span>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .mdl-shell {
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0;
          max-width: 900px;
          margin: 0 auto;
          padding: 0 0 40px;
        }
        .mdl-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 24px 24px 16px; gap: 16px; flex-wrap: wrap;
        }
        .mdl-brand { display: flex; align-items: center; gap: 14px; }
        .mdl-brand-icon {
          width: 52px; height: 52px; border-radius: 16px;
          background: linear-gradient(135deg, #a78bfa, #4f86f7);
          display: flex; align-items: center; justify-content: center; font-size: 26px; flex-shrink: 0;
        }
        .mdl-brand h1 { margin: 0; font-size: 22px; font-weight: 700; }
        .mdl-brand p { margin: 2px 0 0; font-size: 12px; color: var(--text-muted); }
        .mdl-refresh-btn {
          padding: 8px 16px; border-radius: 10px; border: 1.5px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-secondary); cursor: pointer; font-size: 13px; font-weight: 500;
          transition: all 0.12s;
        }
        .mdl-refresh-btn:hover { border-color: var(--primary); color: var(--primary); }

        .mdl-section { padding: 0 24px; margin-bottom: 16px; }
        .mdl-section-title { font-size: 14px; font-weight: 700; color: var(--text-secondary); margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.08em; }

        .installed-list { display: flex; flex-direction: column; gap: 6px; }
        .installed-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); }
        .inst-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .inst-info { flex: 1; min-width: 0; }
        .inst-name { font-size: 13px; font-weight: 500; color: var(--text-primary); }
        .inst-size { font-size: 12px; color: var(--text-muted); margin-left: 10px; }
        .inst-badge { font-size: 11px; padding: 2px 8px; border-radius: 8px; background: #52b78820; color: #52b788; font-weight: 600; }

        .mdl-filter { display: flex; align-items: center; gap: 8px; padding: 16px 24px; flex-wrap: wrap; }
        .mdl-filter-label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
        .mdl-filter-btn {
          padding: 5px 12px; border-radius: 8px; border: 1.5px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-secondary); font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.12s;
        }
        .mdl-filter-btn.active { background: var(--primary); color: white; border-color: var(--primary); }
        .mdl-filter-btn:hover:not(.active) { border-color: var(--primary); color: var(--primary); }

        .models-grid { display: flex; flex-direction: column; gap: 8px; padding: 0 24px; }

        .model-card {
          border: 1.5px solid var(--border-subtle); border-radius: 16px;
          background: var(--bg-elevated); overflow: hidden; transition: border-color 0.15s;
        }
        .model-card.installed { border-color: #52b78840; }
        .model-card.expanded { border-color: var(--primary); }
        .mc-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px; cursor: pointer; gap: 12px;
        }
        .mc-header:hover { background: var(--bg-surface); }
        .mc-left { flex: 1; min-width: 0; }
        .mc-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 3px; }
        .mc-name { font-size: 16px; font-weight: 700; color: var(--text-primary); }
        .mc-tag { font-size: 12px; padding: 2px 8px; border-radius: 6px; background: var(--bg-surface); color: var(--text-muted); font-weight: 600; border: 1px solid var(--border-subtle); }
        .mc-math-badge { font-size: 11px; padding: 2px 8px; border-radius: 6px; background: #4f86f720; color: #4f86f7; font-weight: 700; }
        .mc-installed-badge { font-size: 11px; padding: 2px 8px; border-radius: 6px; background: #52b78820; color: #52b788; font-weight: 700; }
        .mc-best { font-size: 12px; color: var(--text-muted); }
        .mc-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
        .mc-tier { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 8px; }
        .mc-size { font-size: 12px; font-weight: 600; color: var(--text-secondary); min-width: 48px; text-align: right; }
        .mc-chevron { font-size: 11px; color: var(--text-muted); }

        .mc-body { padding: 0 20px 20px; border-top: 1px solid var(--border-subtle); padding-top: 16px; }
        .mc-desc { font-size: 14px; color: var(--text-secondary); line-height: 1.6; margin: 0 0 16px; }
        .mc-section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); display: block; margin-bottom: 6px; }
        .mc-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .mc-strength-tag { font-size: 12px; padding: 3px 10px; border-radius: 8px; background: var(--bg-surface); color: var(--text-secondary); border: 1px solid var(--border-subtle); }
        .mc-strengths { margin-bottom: 14px; }
        .mc-specs { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 16px; }
        .mc-spec { padding: 8px 12px; border-radius: 8px; background: var(--bg-surface); border: 1px solid var(--border-subtle); }
        .mc-spec-label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 3px; }
        .mc-spec-value { font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .mc-install { }
        .mc-cmd-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .mc-cmd { flex: 1; padding: 10px 14px; border-radius: 10px; background: #1e1e2e; color: #a6e3a1; font-size: 13px; font-family: monospace; border: 1px solid var(--border-subtle); overflow: auto; white-space: nowrap; }
        .mc-copy-btn { padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-secondary); font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.12s; flex-shrink: 0; }
        .mc-copy-btn:hover { border-color: var(--primary); color: var(--primary); }
        .mc-copy-btn.copied { background: #52b788; color: white; border-color: #52b788; }
        .mc-cmd-note { font-size: 11px; color: var(--text-muted); margin: 0; }
        .mc-active-note { margin-top: 12px; padding: 10px 14px; border-radius: 10px; background: #52b78816; color: #52b788; font-size: 13px; font-weight: 500; border: 1px solid #52b78830; }

        .bundled-section {
          margin: 24px; padding: 20px 24px; border-radius: 20px;
          background: color-mix(in srgb, #a78bfa 6%, var(--bg-elevated));
          border: 1.5px solid color-mix(in srgb, #a78bfa 20%, var(--border-subtle));
          display: flex; gap: 20px; align-items: flex-start;
        }
        .bundled-icon { font-size: 32px; flex-shrink: 0; }
        .bundled-title { margin: 0 0 6px; font-size: 15px; font-weight: 700; }
        .bundled-desc { margin: 0 0 14px; font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
        .bundled-tiers { display: flex; gap: 10px; flex-wrap: wrap; }
        .bundled-tier { padding: 8px 14px; border-radius: 10px; background: var(--bg-surface); border: 1px solid var(--border-subtle); }
        .bt-label { display: block; font-size: 12px; font-weight: 700; color: var(--text-primary); }
        .bt-desc { display: block; font-size: 11px; color: var(--text-muted); margin-top: 2px; }
      `}</style>
    </div>
  );
}

// ─── Status Banner ────────────────────────────────────────────────────────────

function StatusBanner({ status, ollamaVersion, modelsInstalled }: {
  status: AIStatus; ollamaVersion: string | null; modelsInstalled: number;
}) {
  if (status === 'checking') return (
    <div className="sb sb-checking">
      <span>⟳ Detecting AI runtime…</span>
      <style jsx>{`.sb{margin:0 24px 16px;padding:12px 16px;border-radius:12px;font-size:13px;font-weight:500;}.sb-checking{background:var(--bg-surface);border:1px solid var(--border-subtle);color:var(--text-muted);}`}</style>
    </div>
  );
  if (status === 'ollama-ok') return (
    <div className="sb sb-ok">
      <span>✓ Ollama detected{ollamaVersion ? ` v${ollamaVersion}` : ''} · {modelsInstalled} model{modelsInstalled !== 1 ? 's' : ''} installed · AI features active</span>
      <style jsx>{`.sb{margin:0 24px 16px;padding:12px 16px;border-radius:12px;font-size:13px;font-weight:500;}.sb-ok{background:#52b78818;border:1px solid #52b78840;color:#52b788;}`}</style>
    </div>
  );
  if (status === 'llama-ok') return (
    <div className="sb sb-ok">
      <span>✓ llama.cpp runtime detected · AI features active</span>
      <style jsx>{`.sb{margin:0 24px 16px;padding:12px 16px;border-radius:12px;font-size:13px;font-weight:500;}.sb-ok{background:#52b78818;border:1px solid #52b78840;color:#52b788;}`}</style>
    </div>
  );
  return (
    <div className="sb sb-none">
      <span>⚠ No AI runtime detected. Install Ollama (free, open source) to enable all AI features.</span>
      <style jsx>{`.sb{margin:0 24px 16px;padding:12px 16px;border-radius:12px;font-size:13px;font-weight:500;}.sb-none{background:#f59e0b18;border:1px solid #f59e0b40;color:#f59e0b;}`}</style>
    </div>
  );
}

// ─── Setup Guide ──────────────────────────────────────────────────────────────

function SetupGuide() {
  const [os, setOs] = useState<'mac' | 'win' | 'linux'>('mac');
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      if (navigator.userAgent.includes('Win')) setOs('win');
      else if (navigator.userAgent.includes('Linux')) setOs('linux');
      else setOs('mac');
    }
  }, []);

  const copy = (text: string, i: number) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(i);
    setTimeout(() => setCopied(null), 2000);
  };

  const steps: { title: string; mac: string; win: string; linux: string; note: string }[] = [
    {
      title: 'Install Ollama',
      mac: 'brew install ollama',
      win: 'winget install Ollama.Ollama',
      linux: 'curl -fsSL https://ollama.com/install.sh | sh',
      note: 'Or download the GUI installer from ollama.com',
    },
    {
      title: 'Start Ollama',
      mac: 'ollama serve',
      win: 'ollama serve',
      linux: 'ollama serve',
      note: 'The Ollama service listens on http://localhost:11434',
    },
    {
      title: 'Pull a model',
      mac: 'ollama pull mistral',
      win: 'ollama pull mistral',
      linux: 'ollama pull mistral',
      note: 'Replace "mistral" with any model from the catalogue below',
    },
    {
      title: 'Refresh status',
      mac: '↻ Click Refresh above',
      win: '↻ Click Refresh above',
      linux: '↻ Click Refresh above',
      note: 'Kivora will detect Ollama automatically after it starts',
    },
  ];

  return (
    <div className="sg">
      <div className="sg-header">
        <h2>Setup Guide — Offline AI in 4 Steps</h2>
        <div className="sg-os-picker">
          {(['mac','win','linux'] as const).map(o => (
            <button key={o} className={`sg-os${os === o ? ' active' : ''}`} onClick={() => setOs(o)}>
              {o === 'mac' ? '🍎 macOS' : o === 'win' ? '🪟 Windows' : '🐧 Linux'}
            </button>
          ))}
        </div>
      </div>
      <div className="sg-steps">
        {steps.map((s, i) => (
          <div key={i} className={`sg-step${step === i ? ' active' : ''}`} onClick={() => setStep(i)}>
            <div className={`sg-step-num${step === i ? ' active' : ''}`}>{i+1}</div>
            <div className="sg-step-body">
              <div className="sg-step-title">{s.title}</div>
              {step === i && (
                <>
                  <div className="sg-cmd-row">
                    <code className="sg-cmd">{os === 'mac' ? s.mac : os === 'win' ? s.win : s.linux}</code>
                    <button
                      className={`sg-copy${copied === i ? ' copied' : ''}`}
                      onClick={e => { e.stopPropagation(); copy(os === 'mac' ? s.mac : os === 'win' ? s.win : s.linux, i); }}
                    >
                      {copied === i ? '✓' : 'Copy'}
                    </button>
                  </div>
                  <p className="sg-note">{s.note}</p>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <a className="sg-link" href="https://ollama.com" target="_blank" rel="noreferrer">
        Download Ollama installer → ollama.com
      </a>
      <style jsx>{`
        .sg { margin: 0 24px 16px; padding: 20px 24px; border-radius: 20px; background: var(--bg-elevated); border: 1.5px solid var(--border-subtle); }
        .sg-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
        .sg-header h2 { margin: 0; font-size: 16px; font-weight: 700; }
        .sg-os-picker { display: flex; gap: 4px; }
        .sg-os { padding: 5px 12px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-secondary); font-size: 12px; cursor: pointer; transition: all 0.1s; }
        .sg-os.active { background: var(--primary); color: white; border-color: var(--primary); }
        .sg-steps { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .sg-step { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; cursor: pointer; transition: background 0.1s; border: 1px solid transparent; }
        .sg-step.active { background: var(--bg-surface); border-color: var(--border-subtle); }
        .sg-step:not(.active):hover { background: var(--bg-surface); }
        .sg-step-num { width: 26px; height: 26px; border-radius: 50%; background: var(--bg-surface); border: 2px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: var(--text-muted); flex-shrink: 0; }
        .sg-step-num.active { background: var(--primary); border-color: var(--primary); color: white; }
        .sg-step-body { flex: 1; min-width: 0; }
        .sg-step-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .sg-cmd-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
        .sg-cmd { flex: 1; padding: 8px 12px; border-radius: 8px; background: #1e1e2e; color: #a6e3a1; font-size: 12px; font-family: monospace; border: 1px solid var(--border-subtle); overflow: auto; white-space: nowrap; }
        .sg-copy { padding: 6px 12px; border-radius: 7px; border: 1px solid var(--border-subtle); background: var(--bg-elevated); color: var(--text-secondary); font-size: 11px; font-weight: 600; cursor: pointer; flex-shrink: 0; transition: all 0.1s; }
        .sg-copy:hover { border-color: var(--primary); color: var(--primary); }
        .sg-copy.copied { background: #52b788; color: white; border-color: #52b788; }
        .sg-note { font-size: 11px; color: var(--text-muted); margin: 4px 0 0; }
        .sg-link { display: inline-flex; align-items: center; padding: 8px 16px; border-radius: 10px; background: var(--primary); color: white; text-decoration: none; font-size: 13px; font-weight: 600; transition: opacity 0.12s; }
        .sg-link:hover { opacity: 0.88; }
      `}</style>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return '?';
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1e6).toFixed(0)} MB`;
}
