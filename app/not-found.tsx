import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base, #f8fafc)',
      padding: '40px 20px',
      fontFamily: 'inherit',
    }}>
      <div style={{
        textAlign: 'center',
        maxWidth: 420,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}>
        <div style={{ fontSize: 64 }}>📭</div>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, color: 'var(--text-primary, #0f172a)' }}>
          Page not found
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary, #64748b)', margin: 0, lineHeight: 1.6 }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <Link
            href="/workspace"
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              background: 'var(--primary, #4f86f7)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Go to Workspace
          </Link>
          <Link
            href="/"
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              border: '1.5px solid var(--border-default, #e2e8f0)',
              color: 'var(--text-secondary, #64748b)',
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
              background: 'var(--bg-surface, #fff)',
            }}
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
