'use client';

import React from 'react';

interface Props { children: React.ReactNode; fallback?: React.ReactNode; pageName?: string; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="eb-shell">
          <div className="eb-card">
            <div className="eb-icon">⚠️</div>
            <h2 className="eb-title">{this.props.pageName ?? 'Page'} encountered an error</h2>
            <p className="eb-msg">
              {this.state.error?.message ?? 'Something went wrong rendering this page.'}
            </p>
            <div className="eb-actions">
              <button className="eb-btn primary" onClick={() => this.setState({ hasError: false, error: null })}>
                Try Again
              </button>
              <button className="eb-btn secondary" onClick={() => window.location.reload()}>
                Reload Page
              </button>
            </div>
            {process.env.NODE_ENV === 'development' && this.state.error?.stack && (
              <pre className="eb-stack">{this.state.error.stack}</pre>
            )}
          </div>
          <style jsx>{`
            .eb-shell { display:flex; align-items:center; justify-content:center; min-height:300px; padding:40px 20px; }
            .eb-card { background:var(--bg-elevated); border:1.5px solid color-mix(in srgb,#ef4444 30%,var(--border-subtle)); border-radius:16px; padding:32px; max-width:480px; width:100%; text-align:center; display:flex; flex-direction:column; gap:12px; box-shadow:0 8px 32px rgba(0,0,0,0.1); }
            .eb-icon { font-size:40px; }
            .eb-title { font-size:17px; font-weight:700; margin:0; color:var(--text-primary); }
            .eb-msg { font-size:13px; color:var(--text-secondary); margin:0; line-height:1.6; }
            .eb-actions { display:flex; gap:8px; justify-content:center; margin-top:4px; }
            .eb-btn { padding:9px 20px; border-radius:10px; font-size:13px; font-weight:600; cursor:pointer; border:none; transition:opacity 0.12s; }
            .eb-btn.primary { background:var(--primary); color:white; }
            .eb-btn.primary:hover { opacity:0.85; }
            .eb-btn.secondary { background:var(--bg-surface); border:1.5px solid var(--border-subtle); color:var(--text-secondary); }
            .eb-btn.secondary:hover { border-color:var(--primary); color:var(--primary); }
            .eb-stack { font-size:10px; text-align:left; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:8px; padding:10px; overflow-x:auto; color:var(--text-muted); white-space:pre-wrap; }
          `}</style>
        </div>
      );
    }
    return this.props.children;
  }
}
