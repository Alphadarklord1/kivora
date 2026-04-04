'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/error]', error);
  }, [error]);

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg)' }}>
      <div
        style={{
          maxWidth: 620,
          width: '100%',
          border: '1px solid var(--border-subtle)',
          borderRadius: 20,
          background: 'var(--bg-surface)',
          padding: '28px 24px',
          display: 'grid',
          gap: 14,
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: 42 }}>⚠️</span>
        <div style={{ display: 'grid', gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Something went wrong</h1>
          <p style={{ margin: 0, color: 'var(--text-2)', lineHeight: 1.6 }}>
            We hit an unexpected app error. Your work may still be recoverable — try the current page again,
            or jump back into Workspace and continue from there.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/workspace" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            Open Workspace
          </Link>
          <Link href="/report" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
            Report issue
          </Link>
        </div>
      </div>
    </main>
  );
}
