'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface ShareData {
  id: string;
  shareToken: string;
  shareType: string;
  permission: string;
  resourceName: string;
  resourceType: string;
  content?: string;
  ownerName?: string;
  createdAt: string;
  expiresAt?: string;
}

export default function ShareViewerPage() {
  const params = useParams();
  const token = params?.token as string;
  const hasToken = Boolean(token);
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(hasToken);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/share/${token}`)
      .then(r => r.ok ? r.json() : r.json().then((d: { error?: string }) => Promise.reject(d.error || 'Not found')))
      .then((d: ShareData) => setData(d))
      .catch((e: unknown) => setError(String(e) || 'Share not found or expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  function copyContent() {
    if (data?.content) {
      navigator.clipboard.writeText(data.content).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const TYPE_ICON: Record<string, string> = {
    summarize: '📝', quiz: '❓', mcq: '✅', flashcards: '🃏',
    notes: '📓', assignment: '📋', rephrase: '✍️',
  };
  const importDeckHref = token ? `/study?importUrl=${encodeURIComponent(`/share/${token}`)}` : '/study';

  if (!hasToken) {
    return (
      <div className="sv-shell">
        <div className="sv-content">
          <div className="sv-error">
            <div className="sv-error-icon">🔗</div>
            <h2>Invalid share link</h2>
            <p>This link is missing its share token.</p>
            <Link href="/" className="sv-cta">Go to Kivora</Link>
          </div>
        </div>
        <style jsx>{`
          .sv-shell { min-height: 100vh; background: var(--bg-surface); display: flex; }
          .sv-content { flex: 1; display: grid; place-items: center; padding: 24px; }
          .sv-error { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
          .sv-error-icon { font-size: 48px; }
          .sv-cta { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 16px; border-radius: 10px; background: var(--primary); color: white; text-decoration: none; font-weight: 700; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="sv-shell">
      {/* Brand header */}
      <div className="sv-header">
        <div className="sv-logo">
          <span className="sv-logo-mark">K</span>
          <span className="sv-logo-name">Kivora</span>
        </div>
        <Link href="/" className="sv-signup">Try Kivora free →</Link>
      </div>

      <div className="sv-content">
        {loading && (
          <div className="sv-loading">
            <div className="sv-spinner" />
            <p>Loading shared content…</p>
          </div>
        )}

        {!loading && error && (
          <div className="sv-error">
            <div className="sv-error-icon">🔒</div>
            <h2>Share not found</h2>
            <p>{error}</p>
            <Link href="/" className="sv-cta">Go to Kivora</Link>
          </div>
        )}

        {!loading && data && (
          <>
            <div className="sv-meta">
              <span className="sv-type">
                {TYPE_ICON[data.resourceType] ?? '📄'} {data.resourceType}
              </span>
              <h1 className="sv-title">{data.resourceName}</h1>
              {data.ownerName && (
                <p className="sv-owner">Shared by <strong>{data.ownerName}</strong></p>
              )}
              <div className="sv-badges">
                <span className="sv-badge">{data.permission}</span>
                <span className="sv-badge">{new Date(data.createdAt).toLocaleDateString()}</span>
                {data.expiresAt && (
                  <span className="sv-badge exp">Expires {new Date(data.expiresAt).toLocaleDateString()}</span>
                )}
              </div>
              {data.resourceType === 'flashcards' && (
                <div className="sv-import-bar">
                  <span>This link opens as a deck preview. To study it in Kivora, import it into your Study Hub.</span>
                  <Link href={importDeckHref} className="sv-import-btn">Import into Kivora</Link>
                </div>
              )}
            </div>

            {data.content ? (
              <div className="sv-card">
                <div className="sv-card-header">
                  <span>Content</span>
                  <button className="sv-copy" onClick={copyContent}>
                    {copied ? '✓ Copied' : '📋 Copy'}
                  </button>
                </div>
                <div className="sv-card-body">
                  <pre className="sv-text">{data.content}</pre>
                </div>
              </div>
            ) : (
              <div className="sv-no-content">
                <p>This share link points to a file. Sign in to Kivora to view it.</p>
                <Link href="/login" className="sv-cta">Sign in to view →</Link>
              </div>
            )}

            <div className="sv-promo">
              <div className="sv-promo-icon">🎓</div>
              <div>
                <strong>Want to generate your own study content?</strong>
                <p>Kivora uses AI to create quizzes, summaries, and flashcards from your uploaded files — fully offline.</p>
              </div>
              <Link href="/" className="sv-promo-btn">Try for free →</Link>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .sv-shell { min-height: 100vh; background: var(--bg-surface); display: flex; flex-direction: column; }
        .sv-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 32px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-elevated); }
        .sv-logo { display: flex; align-items: center; gap: 10px; }
        .sv-logo-mark { width: 36px; height: 36px; border-radius: 10px; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; }
        .sv-logo-name { font-size: 18px; font-weight: 700; color: var(--text-primary); }
        .sv-signup { font-size: 13px; font-weight: 600; color: var(--primary); text-decoration: none; padding: 7px 14px; border-radius: 9px; border: 1.5px solid color-mix(in srgb, var(--primary) 30%, transparent); transition: all 0.12s; }
        .sv-signup:hover { background: color-mix(in srgb, var(--primary) 8%, transparent); }
        .sv-content { flex: 1; max-width: 720px; margin: 0 auto; padding: 40px 20px; width: 100%; display: flex; flex-direction: column; gap: 20px; }
        .sv-loading { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 80px; color: var(--text-muted); }
        .sv-spinner { width: 36px; height: 36px; border: 3px solid var(--border-subtle); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .sv-error { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; text-align: center; }
        .sv-error-icon { font-size: 48px; }
        .sv-error h2 { font-size: 20px; font-weight: 700; margin: 0; }
        .sv-error p { font-size: 14px; color: var(--text-muted); margin: 0; }
        .sv-meta { display: flex; flex-direction: column; gap: 8px; }
        .sv-type { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
        .sv-title { font-size: 26px; font-weight: 800; margin: 0; }
        .sv-owner { font-size: 13px; color: var(--text-muted); margin: 0; }
        .sv-badges { display: flex; gap: 6px; flex-wrap: wrap; }
        .sv-badge { font-size: 11px; padding: 3px 10px; border-radius: 20px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); color: var(--text-muted); text-transform: capitalize; }
        .sv-badge.exp { color: #f59e0b; border-color: color-mix(in srgb, #f59e0b 30%, transparent); background: color-mix(in srgb, #f59e0b 8%, transparent); }
        .sv-import-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px 14px; border-radius: 12px; background: color-mix(in srgb, var(--primary) 8%, var(--bg-elevated)); border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent); font-size: 13px; color: var(--text-secondary); }
        .sv-import-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 14px; border-radius: 10px; background: var(--primary); color: white; text-decoration: none; font-size: 13px; font-weight: 700; white-space: nowrap; }
        .sv-card { background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 14px; overflow: hidden; }
        .sv-card-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
        .sv-copy { padding: 5px 12px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-secondary); font-size: 12px; cursor: pointer; transition: all 0.1s; }
        .sv-copy:hover { border-color: var(--primary); color: var(--primary); }
        .sv-card-body { padding: 20px; max-height: 60vh; overflow-y: auto; }
        .sv-text { font-size: 14px; line-height: 1.7; color: var(--text-primary); white-space: pre-wrap; word-break: break-word; margin: 0; font-family: inherit; }
        .sv-no-content { padding: 40px; text-align: center; background: var(--bg-elevated); border-radius: 14px; border: 1px solid var(--border-subtle); }
        .sv-no-content p { font-size: 14px; color: var(--text-muted); margin: 0 0 16px; }
        .sv-cta, .sv-promo-btn { display: inline-block; padding: 10px 20px; border-radius: 10px; background: var(--primary); color: white; text-decoration: none; font-size: 14px; font-weight: 600; transition: opacity 0.12s; }
        .sv-cta:hover, .sv-promo-btn:hover { opacity: 0.85; }
        .sv-promo { display: flex; align-items: flex-start; gap: 14px; padding: 18px; background: color-mix(in srgb, var(--primary) 6%, var(--bg-elevated)); border: 1px solid color-mix(in srgb, var(--primary) 20%, var(--border-subtle)); border-radius: 14px; flex-wrap: wrap; }
        .sv-promo-icon { font-size: 28px; flex-shrink: 0; }
        .sv-promo div { flex: 1; min-width: 200px; }
        .sv-promo strong { font-size: 14px; display: block; margin-bottom: 4px; }
        .sv-promo p { font-size: 13px; color: var(--text-muted); margin: 0; line-height: 1.5; }
      `}</style>
    </div>
  );
}
