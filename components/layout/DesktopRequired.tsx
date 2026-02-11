export function DesktopRequired() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        background: 'radial-gradient(circle at top, #13203f 0%, #090d1a 50%, #05070f 100%)',
        color: '#e5e7eb',
      }}
    >
      <section
        style={{
          width: 'min(640px, 100%)',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          borderRadius: '18px',
          background: 'rgba(15, 23, 42, 0.82)',
          padding: '2rem',
          boxShadow: '0 20px 60px rgba(2, 6, 23, 0.45)',
        }}
      >
        <p style={{ margin: 0, color: '#93c5fd', fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase' }}>
          Desktop Required
        </p>
        <h1 style={{ marginTop: '0.75rem', marginBottom: '0.75rem', fontSize: '2rem', lineHeight: 1.2 }}>
          StudyPilot runs as a desktop app
        </h1>
        <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.65 }}>
          This deployment is desktop-only. Open StudyPilot in the installed app on macOS or Windows to use workspace, AI tools, and local study data.
        </p>
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span
            style={{
              borderRadius: '999px',
              border: '1px solid rgba(96, 165, 250, 0.35)',
              background: 'rgba(30, 64, 175, 0.25)',
              padding: '0.4rem 0.8rem',
              fontSize: '0.85rem',
            }}
          >
            Offline-first AI
          </span>
          <span
            style={{
              borderRadius: '999px',
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 23, 42, 0.4)',
              padding: '0.4rem 0.8rem',
              fontSize: '0.85rem',
            }}
          >
            Local model bundle
          </span>
          <span
            style={{
              borderRadius: '999px',
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 23, 42, 0.4)',
              padding: '0.4rem 0.8rem',
              fontSize: '0.85rem',
            }}
          >
            Guest mode enabled
          </span>
        </div>
      </section>
    </main>
  );
}
