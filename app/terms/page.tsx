import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'Baseline public terms for using Kivora as a study and research workspace.',
};

const sections = [
  {
    title: 'Use of the product',
    body:
      'Kivora is provided as a study and research workspace. You are responsible for the material you upload, generate, share, or export from the platform.',
  },
  {
    title: 'Academic responsibility',
    body:
      'Kivora is a learning aid, not a guarantee of correctness. You remain responsible for checking citations, calculations, summaries, and any assignment work before submission.',
  },
  {
    title: 'Accounts and access',
    body:
      'You are responsible for keeping your account credentials secure. We may restrict access if usage threatens the stability, safety, or integrity of the service.',
  },
  {
    title: 'Shared content',
    body:
      'When you publish or share materials, you confirm that you have the right to do so and that the shared content does not violate someone else’s rights or your institution’s rules.',
  },
  {
    title: 'Service changes',
    body:
      'Kivora may add, remove, or change features as the product evolves. Experimental or beta tools may be limited, removed, or revised without notice.',
  },
];

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 20px 80px' }}>
      <div style={{ display: 'grid', gap: 12, marginBottom: 32 }}>
        <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 700 }}>
          Legal
        </span>
        <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 4vw, 3.2rem)' }}>Terms of Use</h1>
        <p style={{ margin: 0, maxWidth: '62ch', color: 'var(--text-2)', lineHeight: 1.7 }}>
          These terms cover the baseline public use of Kivora. They are intentionally short and product-focused,
          so students and teams know the ground rules before using the platform.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {sections.map((section) => (
          <section
            key={section.title}
            style={{
              border: '1px solid var(--border-subtle)',
              borderRadius: 18,
              background: 'var(--bg-surface)',
              padding: '20px 22px',
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 10, fontSize: '1.1rem' }}>{section.title}</h2>
            <p style={{ margin: 0, color: 'var(--text-2)', lineHeight: 1.7 }}>{section.body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
