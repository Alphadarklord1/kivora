import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Kivora handles study content, accounts, AI requests, and local-first data.',
};

const sections = [
  {
    title: 'What Kivora stores',
    body:
      'Kivora stores account details, saved study content, planner data, review sets, and settings needed to run the product. In guest or local-first flows, some content may stay only on your device.',
  },
  {
    title: 'How AI requests work',
    body:
      'Depending on your selected mode, Kivora may send prompts to configured AI providers, or run AI locally on your device. Offline or privacy-first modes keep processing on-device when available.',
  },
  {
    title: 'Files and study content',
    body:
      'Uploaded files, notes, and generated materials are used to power Workspace, Scholar Hub, Math, and review flows. You should avoid uploading highly sensitive personal information unless you are intentionally working in a local-only mode.',
  },
  {
    title: 'Analytics and diagnostics',
    body:
      'Kivora may store product analytics, crash context, and tool usage needed to improve the study experience. Sensitive content should not be included in diagnostic reports.',
  },
  {
    title: 'Your control',
    body:
      'You can delete your account data, clear local guest content, and export saved materials from within the app. Contact us before using Kivora in regulated environments that require custom data-processing terms.',
  },
];

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 20px 80px' }}>
      <div style={{ display: 'grid', gap: 12, marginBottom: 32 }}>
        <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 700 }}>
          Legal
        </span>
        <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 4vw, 3.2rem)' }}>Privacy Policy</h1>
        <p style={{ margin: 0, maxWidth: '62ch', color: 'var(--text-2)', lineHeight: 1.7 }}>
          Kivora is built as a private study workspace. This page explains the baseline way we handle accounts,
          study data, AI requests, and diagnostics for the public product.
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
