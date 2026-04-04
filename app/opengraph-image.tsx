import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Kivora study workspace';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background:
            'radial-gradient(circle at top left, rgba(59,130,246,0.35), transparent 36%), linear-gradient(135deg, #0b1220 0%, #111827 52%, #162033 100%)',
          color: '#f8fafc',
          fontFamily: 'Inter, Arial, sans-serif',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 24,
            border: '1px solid rgba(148,163,184,0.18)',
            borderRadius: 28,
            display: 'flex',
            padding: 44,
            background: 'rgba(10,15,28,0.62)',
            backdropFilter: 'blur(14px)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '62%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 16,
                  background: 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  fontWeight: 700,
                }}
              >
                K
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 34, fontWeight: 700 }}>Kivora</span>
                <span style={{ fontSize: 20, color: '#93c5fd' }}>Private study workspace</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ fontSize: 72, lineHeight: 1.02, fontWeight: 800, letterSpacing: -2.5 }}>
                Research.
                <br />
                Review.
                <br />
                Submit.
              </div>
              <div style={{ fontSize: 28, lineHeight: 1.35, color: '#cbd5e1', maxWidth: 620 }}>
                Search sources, turn them into flashcards and notes, solve math, and plan your study flow in one place.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {['Scholar Hub', 'Workspace', 'Math', 'Planner', 'Offline-ready'].map((item) => (
                <div
                  key={item}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '10px 16px',
                    borderRadius: 999,
                    background: 'rgba(148,163,184,0.12)',
                    border: '1px solid rgba(148,163,184,0.18)',
                    fontSize: 20,
                    color: '#e2e8f0',
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginLeft: 'auto', width: '34%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div
              style={{
                width: '100%',
                height: 430,
                borderRadius: 26,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))',
                border: '1px solid rgba(148,163,184,0.2)',
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                boxShadow: '0 24px 70px rgba(15,23,42,0.45)',
              }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: 999, background: '#f87171' }} />
                <div style={{ width: 12, height: 12, borderRadius: 999, background: '#fbbf24' }} />
                <div style={{ width: 12, height: 12, borderRadius: 999, background: '#34d399' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 16, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: 2 }}>Pipeline</div>
                {[
                  'Search a topic in Scholar Hub',
                  'Send source into Workspace',
                  'Build flashcards and notes',
                  'Plan review and track progress',
                ].map((line, index) => (
                  <div
                    key={line}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 18,
                      background: index === 1 ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(148,163,184,0.14)',
                      fontSize: 18,
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        background: 'rgba(96,165,250,0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 15,
                        color: '#bfdbfe',
                      }}
                    >
                      {index + 1}
                    </div>
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
