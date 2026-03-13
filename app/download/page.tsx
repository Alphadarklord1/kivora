'use client';

import { useState, useEffect } from 'react';

type OS = 'mac' | 'windows' | 'linux' | 'unknown';
type Tier = 'laptop' | 'balanced' | 'pc';

const TIERS = [
  {
    id: 'laptop' as Tier,
    label: 'Laptop',
    icon: '💻',
    ram: '4 GB RAM',
    model: 'Qwen2.5-1.5B',
    size: '~1 GB',
    desc: 'Fast and lightweight. Great for summaries, flashcards, and basic Q&A.',
    color: '#22c55e',
  },
  {
    id: 'balanced' as Tier,
    label: 'Balanced',
    icon: '⚡',
    ram: '8 GB RAM',
    model: 'Phi-4-Mini',
    size: '~2.3 GB',
    desc: 'Best balance of speed and quality. Recommended for most users.',
    color: '#6366f1',
    recommended: true,
  },
  {
    id: 'pc' as Tier,
    label: 'Desktop',
    icon: '🖥️',
    ram: '16 GB RAM',
    model: 'Mistral-7B',
    size: '~4.1 GB',
    desc: 'Full quality. Best for complex reasoning, detailed explanations, and math.',
    color: '#f97316',
  },
];

const OS_DOWNLOADS: Record<OS, { label: string; ext: string; icon: string }> = {
  mac:     { label: 'macOS',   ext: '.dmg',    icon: '🍎' },
  windows: { label: 'Windows', ext: '.exe',    icon: '🪟' },
  linux:   { label: 'Linux',   ext: '.AppImage', icon: '🐧' },
  unknown: { label: 'Desktop', ext: '',        icon: '💾' },
};

function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac os'))  return 'mac';
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('linux'))   return 'linux';
  return 'unknown';
}

export default function DownloadPage() {
  const [os, setOs] = useState<OS>('unknown');
  const [tier, setTier] = useState<Tier>('balanced');
  const [copied, setCopied] = useState(false);

  useEffect(() => { setOs(detectOS()); }, []);

  const osInfo = OS_DOWNLOADS[os];
  const tierInfo = TIERS.find(t => t.id === tier)!;

  const ollamaCmd = `ollama pull ${tierInfo.model.toLowerCase().replace('-', '')}`;

  function copyOllama() {
    navigator.clipboard.writeText(`ollama pull ${tierInfo.model.toLowerCase()}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="dl-shell">
      {/* Hero */}
      <div className="dl-hero">
        <div className="dl-hero-badge">Free & Open Source</div>
        <h1 className="dl-hero-title">Download Kivora Desktop</h1>
        <p className="dl-hero-sub">
          Study smarter with offline AI — no internet required.<br />
          Your files stay on your device. Always.
        </p>
      </div>

      {/* OS selector */}
      <div className="dl-section">
        <div className="dl-section-title">Your Platform</div>
        <div className="dl-os-row">
          {(['mac', 'windows', 'linux'] as OS[]).map(o => (
            <button
              key={o}
              className={`dl-os-btn${os === o ? ' active' : ''}`}
              onClick={() => setOs(o)}
            >
              <span className="dl-os-icon">{OS_DOWNLOADS[o].icon}</span>
              <span>{OS_DOWNLOADS[o].label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tier selector */}
      <div className="dl-section">
        <div className="dl-section-title">Choose Your AI Tier</div>
        <div className="dl-tiers">
          {TIERS.map(t => (
            <button
              key={t.id}
              className={`dl-tier${tier === t.id ? ' active' : ''}`}
              style={{ '--tier-color': t.color } as React.CSSProperties}
              onClick={() => setTier(t.id)}
            >
              {t.recommended && <div className="dl-tier-badge">Recommended</div>}
              <div className="dl-tier-icon">{t.icon}</div>
              <div className="dl-tier-label">{t.label}</div>
              <div className="dl-tier-model">{t.model}</div>
              <div className="dl-tier-size">{t.size} download</div>
              <div className="dl-tier-ram">{t.ram} needed</div>
              <div className="dl-tier-desc">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Download button */}
      <div className="dl-section dl-cta-section">
        <a
          className="dl-cta"
          href={`https://github.com/Alphadarklord1/kivora/releases/latest/download/Kivora-${tierInfo.label}${osInfo.ext}`}
          download
        >
          <span className="dl-cta-icon">{osInfo.icon}</span>
          Download Kivora {tierInfo.label} for {osInfo.label}
          <span className="dl-cta-size">{tierInfo.size}</span>
        </a>
        <p className="dl-cta-note">
          Also available on <a href="https://github.com/Alphadarklord1/kivora/releases" target="_blank" rel="noopener noreferrer">GitHub Releases</a> for all platforms
        </p>
      </div>

      {/* Ollama setup */}
      <div className="dl-section">
        <div className="dl-section-title">AI Model Setup (after installing)</div>
        <div className="dl-steps">
          <div className="dl-step">
            <div className="dl-step-num">1</div>
            <div className="dl-step-body">
              <div className="dl-step-title">Install Ollama</div>
              <div className="dl-step-desc">Download from <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">ollama.ai</a> — available for macOS, Windows, and Linux.</div>
            </div>
          </div>
          <div className="dl-step">
            <div className="dl-step-num">2</div>
            <div className="dl-step-body">
              <div className="dl-step-title">Pull your AI model</div>
              <div className="dl-step-cmd">
                <code>{ollamaCmd}</code>
                <button className="dl-copy-btn" onClick={copyOllama}>{copied ? '✓ Copied' : 'Copy'}</button>
              </div>
            </div>
          </div>
          <div className="dl-step">
            <div className="dl-step-num">3</div>
            <div className="dl-step-body">
              <div className="dl-step-title">Launch Kivora</div>
              <div className="dl-step-desc">Open the app, upload your study files, and start generating quizzes and summaries — fully offline.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature grid */}
      <div className="dl-section">
        <div className="dl-section-title">What's Included</div>
        <div className="dl-features">
          {[
            { icon: '📄', title: 'PDF & Word Support', desc: 'Upload lecture slides, PDFs, and Word docs.' },
            { icon: '🧠', title: 'Offline AI Generation', desc: 'Summaries, quizzes, flashcards — no cloud needed.' },
            { icon: '🧮', title: 'Math Solver', desc: 'Step-by-step calculus, algebra, graphing, and more.' },
            { icon: '📅', title: 'Study Planner', desc: 'Outlook-style calendar with exam countdown.' },
            { icon: '🃏', title: 'Spaced Repetition', desc: 'SM-2 flashcards that optimize your review schedule.' },
            { icon: '📊', title: 'Progress Analytics', desc: 'Track scores, streaks, and weak areas.' },
          ].map(f => (
            <div key={f.icon} className="dl-feature">
              <span className="dl-feature-icon">{f.icon}</span>
              <div className="dl-feature-title">{f.title}</div>
              <div className="dl-feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .dl-shell { max-width: 860px; margin: 0 auto; padding: 32px 20px 64px; display: flex; flex-direction: column; gap: 40px; }
        .dl-hero { text-align: center; padding: 16px 0; }
        .dl-hero-badge { display: inline-block; padding: 4px 14px; border-radius: 20px; background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--primary); font-size: 12px; font-weight: 700; margin-bottom: 12px; }
        .dl-hero-title { font-size: clamp(28px,4vw,42px); font-weight: 800; margin: 0 0 12px; }
        .dl-hero-sub { font-size: 16px; color: var(--text-secondary); margin: 0; line-height: 1.7; }
        .dl-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 14px; }
        .dl-os-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .dl-os-btn { display: flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 12px; border: 1.5px solid var(--border-subtle); background: var(--bg-elevated); color: var(--text-secondary); font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.12s; }
        .dl-os-btn:hover { border-color: var(--primary); color: var(--primary); }
        .dl-os-btn.active { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 8%, var(--bg-elevated)); color: var(--primary); font-weight: 600; }
        .dl-os-icon { font-size: 18px; }
        .dl-tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
        .dl-tier { position: relative; padding: 20px; border-radius: 14px; border: 2px solid var(--border-subtle); background: var(--bg-elevated); text-align: center; cursor: pointer; transition: all 0.15s; display: flex; flex-direction: column; gap: 4px; }
        .dl-tier:hover { border-color: var(--tier-color); }
        .dl-tier.active { border-color: var(--tier-color); background: color-mix(in srgb, var(--tier-color) 6%, var(--bg-elevated)); box-shadow: 0 4px 20px color-mix(in srgb, var(--tier-color) 20%, transparent); }
        .dl-tier-badge { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: var(--primary); color: white; font-size: 10px; font-weight: 700; padding: 2px 10px; border-radius: 10px; white-space: nowrap; }
        .dl-tier-icon { font-size: 28px; margin-bottom: 4px; }
        .dl-tier-label { font-size: 16px; font-weight: 700; color: var(--text-primary); }
        .dl-tier-model { font-size: 13px; font-weight: 600; color: var(--tier-color); font-family: monospace; }
        .dl-tier-size { font-size: 12px; color: var(--text-muted); }
        .dl-tier-ram { font-size: 11px; color: var(--text-muted); }
        .dl-tier-desc { font-size: 12px; color: var(--text-secondary); margin-top: 8px; line-height: 1.5; }
        .dl-cta-section { display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .dl-cta { display: flex; align-items: center; gap: 10px; padding: 16px 32px; border-radius: 14px; background: var(--primary); color: white; font-size: 16px; font-weight: 700; text-decoration: none; transition: opacity 0.12s; box-shadow: 0 6px 24px color-mix(in srgb, var(--primary) 35%, transparent); }
        .dl-cta:hover { opacity: 0.88; }
        .dl-cta-icon { font-size: 20px; }
        .dl-cta-size { font-size: 12px; opacity: 0.8; margin-left: 4px; }
        .dl-cta-note { font-size: 13px; color: var(--text-muted); margin: 0; }
        .dl-cta-note a { color: var(--primary); }
        .dl-steps { display: flex; flex-direction: column; gap: 16px; }
        .dl-step { display: flex; gap: 16px; align-items: flex-start; }
        .dl-step-num { width: 32px; height: 32px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; flex-shrink: 0; }
        .dl-step-body { flex: 1; }
        .dl-step-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
        .dl-step-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
        .dl-step-desc a { color: var(--primary); }
        .dl-step-cmd { display: flex; align-items: center; gap: 10px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 10px 14px; }
        .dl-step-cmd code { font-size: 13px; font-family: monospace; color: var(--text-primary); flex: 1; }
        .dl-copy-btn { padding: 4px 10px; border-radius: 7px; border: 1px solid var(--border-subtle); background: var(--bg-elevated); color: var(--text-secondary); font-size: 11px; cursor: pointer; white-space: nowrap; transition: all 0.1s; }
        .dl-copy-btn:hover { border-color: var(--primary); color: var(--primary); }
        .dl-features { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
        .dl-feature { padding: 16px; border-radius: 12px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); }
        .dl-feature-icon { font-size: 24px; display: block; margin-bottom: 8px; }
        .dl-feature-title { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
        .dl-feature-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
      `}</style>
    </div>
  );
}
