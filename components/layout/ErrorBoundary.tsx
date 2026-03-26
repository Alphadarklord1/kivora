'use client';

import React from 'react';
import { recordCrashSummary } from '@/lib/privacy/preferences';

const GITHUB_NEW_ISSUE = 'https://github.com/Alphadarklord1/kivora/issues/new?template=error_report.yml';

interface Props { children: React.ReactNode; fallback?: React.ReactNode; pageName?: string; }
interface State { hasError: boolean; error: Error | null; reported: boolean; }

function sendToServer(error: Error, page: string) {
  try {
    void fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        page,
        kind: 'render',
      }),
      keepalive: true,
    });
  } catch { /* noop */ }
}

function buildGithubUrl(error: Error, page: string) {
  const title = encodeURIComponent(`[Error] ${error.message.slice(0, 100)}`);
  const body = encodeURIComponent(
    `**Page:** ${page}\n**Error:** ${error.message}\n\n**Steps to reproduce:**\n1. \n2. \n\n**Stack:**\n\`\`\`\n${(error.stack ?? '').slice(0, 800)}\n\`\`\``
  );
  return `${GITHUB_NEW_ISSUE}&title=${title}&body=${body}`;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, reported: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const page = this.props.pageName ?? (typeof window !== 'undefined' ? window.location.pathname : 'unknown');
    console.error('[ErrorBoundary]', error, info);
    recordCrashSummary({ message: error?.message, page });
    sendToServer(error, page);
  }

  render() {
    if (!this.state.hasError || !this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const page = this.props.pageName ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
    const isDev = process.env.NODE_ENV === 'development';

    return (
      <div className="eb-shell">
        <div className="eb-card">
          <div className="eb-icon">⚠️</div>
          <h2 className="eb-title">Something went wrong</h2>
          <p className="eb-msg">
            {this.props.pageName
              ? `The ${this.props.pageName} section ran into a problem.`
              : 'A part of the page ran into a problem.'}
            {' '}Your study data is safe.
          </p>

          <div className="eb-actions">
            <button
              className="eb-btn primary"
              onClick={() => this.setState({ hasError: false, error: null, reported: false })}
            >
              Try again
            </button>
            <button
              className="eb-btn secondary"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </div>

          <div className="eb-report-row">
            {this.state.reported ? (
              <span className="eb-reported">✓ Error sent to server logs</span>
            ) : (
              <a
                href={buildGithubUrl(this.state.error, page)}
                target="_blank"
                rel="noopener noreferrer"
                className="eb-report-link"
                onClick={() => this.setState({ reported: true })}
              >
                Report on GitHub →
              </a>
            )}
          </div>

          {isDev && this.state.error.stack && (
            <pre className="eb-stack">{this.state.error.stack}</pre>
          )}
        </div>
        <style jsx>{`
          .eb-shell { display:flex; align-items:center; justify-content:center; min-height:300px; padding:40px 20px; }
          .eb-card { background:var(--bg-elevated,var(--surface)); border:1.5px solid color-mix(in srgb,#ef4444 30%,var(--border-subtle,var(--border-2))); border-radius:16px; padding:32px; max-width:480px; width:100%; text-align:center; display:flex; flex-direction:column; gap:12px; box-shadow:0 8px 32px rgba(0,0,0,0.1); }
          .eb-icon { font-size:40px; }
          .eb-title { font-size:17px; font-weight:700; margin:0; color:var(--text,var(--text-primary)); }
          .eb-msg { font-size:13px; color:var(--text-3,var(--text-secondary)); margin:0; line-height:1.6; }
          .eb-actions { display:flex; gap:8px; justify-content:center; margin-top:4px; }
          .eb-btn { padding:9px 20px; border-radius:10px; font-size:13px; font-weight:600; cursor:pointer; border:none; transition:opacity 0.12s; }
          .eb-btn.primary { background:var(--primary-6,var(--primary)); color:white; }
          .eb-btn.primary:hover { opacity:0.85; }
          .eb-btn.secondary { background:var(--surface); border:1.5px solid var(--border-2,var(--border-subtle)); color:var(--text-3,var(--text-secondary)); }
          .eb-btn.secondary:hover { border-color:var(--primary-6,var(--primary)); }
          .eb-report-row { margin-top:4px; }
          .eb-report-link { font-size:12px; color:var(--text-3,var(--text-secondary)); text-decoration:underline; cursor:pointer; }
          .eb-report-link:hover { color:var(--primary-6,var(--primary)); }
          .eb-reported { font-size:12px; color:var(--text-3,var(--text-secondary)); }
          .eb-stack { font-size:10px; text-align:left; background:var(--surface); border:1px solid var(--border-2,var(--border-subtle)); border-radius:8px; padding:10px; overflow-x:auto; color:var(--text-3); white-space:pre-wrap; margin-top:4px; }
        `}</style>
      </div>
    );
  }
}
