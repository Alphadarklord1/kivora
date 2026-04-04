import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Kivora study workspace';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background:
            'radial-gradient(circle at top left, rgba(59,130,246,0.3), transparent 34%), linear-gradient(135deg, #0b1220 0%, #111827 55%, #18243a 100%)',
          color: '#f8fafc',
          fontFamily: 'Inter, Arial, sans-serif',
          padding: 48,
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 28,
            border: '1px solid rgba(148,163,184,0.18)',
            background: 'rgba(10,15,28,0.62)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 44,
          }}
        >
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 860 }}>
            <div style={{ fontSize: 74, lineHeight: 1.02, fontWeight: 800, letterSpacing: -2.5 }}>
              Research. Review. Submit.
            </div>
            <div style={{ fontSize: 30, lineHeight: 1.35, color: '#cbd5e1' }}>
              Search sources, turn them into flashcards and notes, solve math, and plan your study flow in one private workspace.
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
      </div>
    ),
    size,
  );
}
