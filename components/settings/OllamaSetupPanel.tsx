'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  checkOllamaStatus,
  listOllamaModels,
  pullOllamaModel,
} from '@/lib/ollama/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PanelState = 'checking' | 'not-installed' | 'no-model' | 'ready';

interface OllamaModel {
  name: string;
  size: string;
}

interface DownloadState {
  active: boolean;
  pct: number;
  status: string;
  error: string | null;
}

const FRESH_DOWNLOAD: DownloadState = {
  active: false,
  pct: 0,
  status: '',
  error: null,
};

// ---------------------------------------------------------------------------
// Secondary model definition
// ---------------------------------------------------------------------------

const PRIMARY_MODEL = 'qwen2.5';
const SECONDARY_MODEL = 'qwen2.5-math';

const MODEL_META: Record<string, { size: string; desc: string }> = {
  [PRIMARY_MODEL]: {
    size: '4.7 GB',
    desc: 'General-purpose model — best for study tasks, summaries, and Q&A.',
  },
  [SECONDARY_MODEL]: {
    size: '4.7 GB',
    desc: 'Math-tuned variant — best for equations, proofs, and step-by-step workings.',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if `modelName` starts with `prefix` (handles `:latest` tags). */
function modelMatches(modelName: string, prefix: string): boolean {
  return modelName === prefix || modelName.startsWith(`${prefix}:`);
}

function hasModel(list: string[], name: string): boolean {
  return list.some((m) => modelMatches(m, name));
}

function formatModelSize(name: string): string {
  return MODEL_META[name]?.size ?? 'unknown size';
}

function formatDisplayName(rawName: string): string {
  // e.g. "qwen2.5:latest" → "qwen2.5"
  return rawName.split(':')[0];
}

function humanFileSize(name: string): string {
  return MODEL_META[formatDisplayName(name)]?.size ?? '';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${Math.min(100, pct)}%` }} />
      <style jsx>{`
        .progress-track {
          height: 6px;
          border-radius: 999px;
          background: var(--border-2);
          overflow: hidden;
          margin-top: 8px;
        }
        .progress-fill {
          height: 100%;
          border-radius: 999px;
          background: var(--accent, var(--primary));
          transition: width 0.3s ease;
        }
      `}</style>
    </div>
  );
}

interface ModelCardProps {
  name: string;
  installed: boolean;
  download: DownloadState;
  onDownload: () => void;
  isPrimary?: boolean;
}

function ModelCard({ name, installed, download, onDownload, isPrimary = false }: ModelCardProps) {
  const meta = MODEL_META[name];
  return (
    <div className={`model-card ${isPrimary ? 'primary' : ''}`}>
      <div className="model-card-header">
        <div>
          <div className="model-name">{name}</div>
          <div className="model-meta">{meta?.size} · {meta?.desc}</div>
        </div>
        {installed && (
          <span className="badge-installed">Installed</span>
        )}
      </div>

      {!installed && !download.active && (
        <button className="btn-download" onClick={onDownload}>
          Download
        </button>
      )}

      {download.active && (
        <div className="download-progress">
          <div className="progress-row">
            <span className="progress-status">{download.status || 'Downloading…'}</span>
            <span className="progress-pct">{download.pct}%</span>
          </div>
          <ProgressBar pct={download.pct} />
        </div>
      )}

      {download.error && (
        <div className="download-error">{download.error}</div>
      )}

      <style jsx>{`
        .model-card {
          padding: 14px 16px;
          border-radius: 14px;
          border: 1px solid var(--border-2);
          background: var(--surface-2);
          display: grid;
          gap: 10px;
        }
        .model-card.primary {
          border-color: color-mix(in srgb, var(--accent) 32%, var(--border-2));
          background: color-mix(in srgb, var(--accent) 5%, var(--surface-2));
        }
        .model-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
        }
        .model-name {
          font-weight: 700;
          font-size: var(--text-sm);
        }
        .model-meta {
          margin-top: 3px;
          font-size: var(--text-xs);
          color: var(--text-3);
        }
        .badge-installed {
          font-size: 11px;
          padding: 3px 9px;
          border-radius: 999px;
          background: var(--success-bg);
          color: var(--success);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .btn-download {
          align-self: start;
          padding: 8px 18px;
          border-radius: 10px;
          border: none;
          background: var(--accent, var(--primary));
          color: #fff;
          font-weight: 600;
          font-size: var(--text-sm);
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .btn-download:hover {
          opacity: 0.88;
        }
        .download-progress {
          display: grid;
          gap: 0;
        }
        .progress-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: var(--text-xs);
          color: var(--text-2);
        }
        .progress-status {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .progress-pct {
          margin-left: 8px;
          font-variant-numeric: tabular-nums;
          color: var(--accent);
          font-weight: 600;
        }
        .download-error {
          font-size: var(--text-xs);
          color: var(--danger);
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OllamaSetupPanel() {
  const [panelState, setPanelState] = useState<PanelState>('checking');
  const [modelList, setModelList] = useState<OllamaModel[]>([]);
  const [rawNames, setRawNames] = useState<string[]>([]);

  const [primaryDownload, setPrimaryDownload] = useState<DownloadState>(FRESH_DOWNLOAD);
  const [secondaryDownload, setSecondaryDownload] = useState<DownloadState>(FRESH_DOWNLOAD);

  // ── Check status ─────────────────────────────────────────────────────────

  const runCheck = useCallback(async () => {
    setPanelState('checking');
    const status = await checkOllamaStatus();
    if (status === 'not-running') {
      setPanelState('not-installed');
      return;
    }

    const names = await listOllamaModels();
    setRawNames(names);
    setModelList(
      names.map((n) => ({
        name: n,
        size: humanFileSize(n),
      })),
    );

    if (!hasModel(names, PRIMARY_MODEL)) {
      setPanelState('no-model');
    } else {
      setPanelState('ready');
    }
  }, []);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  // ── Pull helpers ──────────────────────────────────────────────────────────

  const pullModel = useCallback(
    async (name: string, isPrimary: boolean) => {
      const setDl = isPrimary ? setPrimaryDownload : setSecondaryDownload;

      setDl({ active: true, pct: 0, status: 'Starting…', error: null });

      try {
        await pullOllamaModel(name, (pct, status) => {
          setDl((prev) => ({ ...prev, pct, status }));
        });
        // Pull complete — refresh state
        setDl(FRESH_DOWNLOAD);
        await runCheck();
      } catch (err) {
        setDl({
          active: false,
          pct: 0,
          status: '',
          error: err instanceof Error ? err.message : 'Download failed. Check that Ollama is still running.',
        });
      }
    },
    [runCheck],
  );

  // ── Derived ───────────────────────────────────────────────────────────────

  const primaryInstalled = hasModel(rawNames, PRIMARY_MODEL);
  const secondaryInstalled = hasModel(rawNames, SECONDARY_MODEL);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="ollama-panel">

      {/* Checking skeleton */}
      {panelState === 'checking' && (
        <div className="skeleton" style={{ height: 80, borderRadius: 14 }} />
      )}

      {/* Ollama not running */}
      {panelState === 'not-installed' && (
        <>
          <div className="status-header">
            <div className="status-dot error" />
            <h3 className="status-title">Local AI — Not Running</h3>
          </div>
          <p className="status-body">
            Ollama is not detected. To use offline AI with Qwen 2.5:
          </p>
          <ol className="setup-steps">
            <li>
              Download Ollama from{' '}
              <code className="inline-code">ollama.com</code>
            </li>
            <li>Install and start Ollama (it runs in the system tray / background)</li>
            <li>Come back here and click <strong>Refresh</strong></li>
          </ol>
          <div className="action-row">
            <button className="btn-action" onClick={() => void runCheck()}>
              Refresh
            </button>
          </div>
        </>
      )}

      {/* Ollama running but no primary model */}
      {panelState === 'no-model' && (
        <>
          <div className="status-header">
            <div className="status-dot warn" />
            <h3 className="status-title">Local AI — Model Needed</h3>
          </div>
          <p className="status-body">
            Ollama is running but the Qwen 2.5 model is not downloaded yet. Select a model below to download it.
          </p>
          <div className="model-grid">
            <ModelCard
              name={PRIMARY_MODEL}
              installed={primaryInstalled}
              download={primaryDownload}
              onDownload={() => void pullModel(PRIMARY_MODEL, true)}
              isPrimary
            />
            <ModelCard
              name={SECONDARY_MODEL}
              installed={secondaryInstalled}
              download={secondaryDownload}
              onDownload={() => void pullModel(SECONDARY_MODEL, false)}
            />
          </div>
          <div className="action-row">
            <button className="btn-ghost-sm" onClick={() => void runCheck()}>
              Refresh
            </button>
          </div>
        </>
      )}

      {/* Ready */}
      {panelState === 'ready' && (
        <>
          <div className="status-header">
            <div className="status-dot ok" />
            <h3 className="status-title">Local AI — Ready</h3>
          </div>
          <p className="status-body">
            <strong>qwen2.5</strong> is downloaded and ready. Kivora can route AI requests locally without sending your data to any cloud service.
          </p>

          {modelList.length > 0 && (
            <div className="installed-list">
              <div className="installed-label">Installed models</div>
              {modelList.map((m) => (
                <div key={m.name} className="installed-row">
                  <span className="installed-name">{formatDisplayName(m.name)}</span>
                  {m.size && <span className="installed-size">{m.size}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Offer secondary model if not already installed */}
          {!secondaryInstalled && (
            <div style={{ marginTop: 12 }}>
              <div className="installed-label" style={{ marginBottom: 8 }}>Optional: Math model</div>
              <ModelCard
                name={SECONDARY_MODEL}
                installed={secondaryInstalled}
                download={secondaryDownload}
                onDownload={() => void pullModel(SECONDARY_MODEL, false)}
              />
            </div>
          )}

          {secondaryInstalled && (
            <ModelCard
              name={SECONDARY_MODEL}
              installed
              download={FRESH_DOWNLOAD}
              onDownload={() => void pullModel(SECONDARY_MODEL, false)}
            />
          )}

          <div className="action-row">
            <button className="btn-ghost-sm" onClick={() => void runCheck()}>
              Refresh
            </button>
          </div>
        </>
      )}

      <style jsx>{`
        .ollama-panel {
          display: grid;
          gap: 12px;
        }

        /* ── Status header ── */
        .status-header {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .status-dot.ok {
          background: var(--success);
          box-shadow: 0 0 0 3px var(--success-bg);
        }
        .status-dot.warn {
          background: var(--warning);
          box-shadow: 0 0 0 3px var(--warning-bg);
        }
        .status-dot.error {
          background: var(--danger);
          box-shadow: 0 0 0 3px var(--danger-bg);
        }
        .status-title {
          margin: 0;
          font-size: var(--text-base);
          font-weight: 700;
        }

        /* ── Body copy ── */
        .status-body {
          margin: 0;
          font-size: var(--text-sm);
          color: var(--text-2);
          line-height: 1.55;
        }

        /* ── Setup steps ── */
        .setup-steps {
          margin: 0;
          padding-left: 20px;
          display: grid;
          gap: 6px;
          font-size: var(--text-sm);
          color: var(--text-2);
        }
        .setup-steps li {
          line-height: 1.5;
        }
        .inline-code {
          padding: 2px 6px;
          border-radius: 5px;
          background: var(--bg-2, var(--bg));
          border: 1px solid var(--border-2);
          font-family: var(--font-mono);
          font-size: 0.88em;
          color: var(--text);
        }

        /* ── Model grid ── */
        .model-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 10px;
        }

        /* ── Installed list ── */
        .installed-list {
          display: grid;
          gap: 6px;
          padding: 12px 14px;
          border-radius: 12px;
          background: var(--surface-2);
          border: 1px solid var(--border-2);
        }
        .installed-label {
          font-size: var(--text-xs);
          font-weight: 700;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--text-3);
          margin-bottom: 2px;
        }
        .installed-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: var(--text-sm);
          padding: 4px 0;
          border-bottom: 1px solid var(--border);
        }
        .installed-row:last-child {
          border-bottom: none;
        }
        .installed-name {
          font-weight: 600;
        }
        .installed-size {
          color: var(--text-3);
          font-size: var(--text-xs);
        }

        /* ── Actions ── */
        .action-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .btn-action {
          padding: 9px 20px;
          border-radius: 10px;
          border: none;
          background: var(--accent, var(--primary));
          color: #fff;
          font-weight: 600;
          font-size: var(--text-sm);
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .btn-action:hover {
          opacity: 0.88;
        }
        .btn-ghost-sm {
          padding: 7px 16px;
          border-radius: 9px;
          border: 1px solid var(--border-2);
          background: transparent;
          color: var(--text-2);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .btn-ghost-sm:hover {
          border-color: var(--border-3);
          color: var(--text);
        }
      `}</style>
    </div>
  );
}
