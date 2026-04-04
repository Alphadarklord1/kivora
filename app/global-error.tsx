'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0f172a', color: '#e2e8f0' }}>
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 620,
              width: '100%',
              border: '1px solid rgba(148,163,184,0.2)',
              borderRadius: 20,
              background: 'rgba(15,23,42,0.92)',
              padding: '28px 24px',
              display: 'grid',
              gap: 14,
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: 42 }}>🛠️</span>
            <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Kivora hit a critical error</h1>
            <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>
              We ran into a full-app crash. Try recovering the session, and if it keeps happening, reopen the app and report it.
            </p>
            {error?.digest && (
              <code
                style={{
                  display: 'inline-block',
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  color: '#93c5fd',
                  fontSize: 12,
                }}
              >
                Ref: {error.digest}
              </code>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => reset()}
                style={{
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 16px',
                  background: '#2563eb',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Try recovery
              </button>
              <a
                href="/workspace"
                style={{
                  borderRadius: 10,
                  padding: '10px 16px',
                  border: '1px solid rgba(148,163,184,0.25)',
                  color: '#e2e8f0',
                  textDecoration: 'none',
                  fontSize: 14,
                }}
              >
                Open Workspace
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
