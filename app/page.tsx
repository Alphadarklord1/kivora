import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Kivora — AI Study Workspace That Works Offline',
  description: 'Three workspaces in one: file-based AI study tools, source-driven research and writing, and a step-by-step math solver. Cloud, local, or fully offline — you choose.',
};

export default function SahlCalStylePage() {
  return (
    <div className={styles.pageShell}>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="Kivora — AI study workspace">
          {/*
            Custom logomark — gradient rounded square with a stylised "K"
            built from two precise strokes, plus a small accent dot to
            signal liveness / AI activity. Inline SVG keeps the brand
            crisp at any DPI without an asset round-trip.
          */}
          <span className={styles.brandMark} aria-hidden="true">
            <svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" focusable="false">
              <defs>
                <linearGradient id="kivora-mark-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4a90e2" />
                  <stop offset="55%" stopColor="#3aa6c2" />
                  <stop offset="100%" stopColor="#1db88e" />
                </linearGradient>
                <linearGradient id="kivora-mark-shine" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
                  <stop offset="60%" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
              </defs>
              {/* Rounded tile background */}
              <rect x="0" y="0" width="36" height="36" rx="10" fill="url(#kivora-mark-gradient)" />
              {/* Subtle top-left highlight for a soft 3D feel */}
              <rect x="0" y="0" width="36" height="36" rx="10" fill="url(#kivora-mark-shine)" />
              {/* K glyph — vertical bar + chevron, drawn as paths so it stays sharp */}
              <path
                d="M11 9 L11 27"
                stroke="#ffffff"
                strokeWidth="3.4"
                strokeLinecap="round"
              />
              <path
                d="M25 9 L14.5 18 L25 27"
                stroke="#ffffff"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              {/* Accent dot — top-right, hints at AI / live status */}
              <circle cx="28.5" cy="8.5" r="2.6" fill="#ffd166" stroke="#ffffff" strokeWidth="1.2" />
            </svg>
          </span>
          <span className={styles.brandText}>Kivora</span>
        </Link>

        <nav className={styles.topbarNav} aria-label="Primary">
          <Link href="/workspace" className={styles.navLink}>Workspace</Link>
          <Link href="/coach" className={styles.navLink}>Scholar Hub</Link>
          <Link href="/math" className={styles.navLink}>Math</Link>
          <Link href="/planner" className={styles.navLink}>Planner</Link>
          <Link href="/downloads" className={styles.navLink}>Download</Link>
        </nav>

        <div className={styles.topbarActions}>
          <span className={styles.statusPill} title="Cloud AI online with local fallback">
            <span className={styles.statusDot} aria-hidden="true" />
            AI ready
          </span>
          <Link href="/login" className={styles.ghostBtn}>Sign in</Link>
          <Link href="/workspace" className={styles.primaryBtn}>Open app →</Link>
        </div>
      </header>

      <main className={styles.main}>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className={styles.hero}>
          <span className={styles.badge}>Guest mode on by default — no signup needed</span>

          <h1 className={styles.heroTitle}>
            Study tools that<br />
            <span className={styles.heroTitleAccent}>work offline.</span>
          </h1>

          <p className={styles.heroBody}>
            Kivora gives you three connected workspaces — files &amp; AI tools, source-driven
            research and writing, and a step-by-step math solver. Cloud AI when you want
            speed, local AI when you don&apos;t, and a deterministic fallback that runs even
            without either.
          </p>

          <div className={styles.heroActions}>
            <Link href="/workspace" className={styles.ctaPrimary}>
              Open the app →
            </Link>
            <Link href="/downloads" className={styles.ctaSecondary}>
              Get the desktop app
            </Link>
          </div>

          <div className={styles.trustRow}>
            <span>No account required. Your files live in your browser, not our servers.</span>
          </div>
        </section>

        {/* ── Wave Divider ──────────────────────────────────────────────── */}
        <div className={styles.waveDivider}>
          <svg viewBox="0 0 1200 80" preserveAspectRatio="none">
            <path d="M0,40 C300,80 600,0 1200,40 L1200,80 L0,80 Z" fill="#fff" />
          </svg>
        </div>

        {/* ── Value Props (Three Columns) — the three pillars ──────────── */}
        <section className={styles.valueProps}>
          <div className={styles.valuePropsInner}>
            <article>
              <span className={styles.valuePropEyebrow}>Workspace</span>
              <h2 className={styles.valuePropTitle}>Files in, study tools out</h2>
              <p className={styles.valuePropBody}>
                Drop in a PDF, slide deck, or Word doc. Generate summaries, flashcards,
                MCQs, structured notes, and exam-style questions from your own sources.
              </p>
            </article>

            <article>
              <span className={styles.valuePropEyebrow}>Scholar Hub</span>
              <h2 className={styles.valuePropTitle}>Research and write with sources</h2>
              <p className={styles.valuePropBody}>
                Find sources across Wikipedia, Semantic Scholar, and OpenAlex. Outline,
                draft, and grammar-check your essays. Get citations in APA, MLA, or Chicago.
              </p>
            </article>

            <article>
              <span className={styles.valuePropEyebrow}>Math</span>
              <h2 className={styles.valuePropTitle}>Step-by-step solutions</h2>
              <p className={styles.valuePropBody}>
                Closed-form solvers across algebra, calculus, trigonometry, statistics, and
                more. Graph plotter, formula sheets, and a unit converter — all in one place.
              </p>
            </article>
          </div>
        </section>

        {/* ── Features (Colored Cards Grid) ─────────────────────────────── */}
        <section className={styles.featuresSection}>
          <span className={styles.sectionEyebrow}>Features</span>
          <h2 className={styles.sectionTitle}>
            Built for real study sessions.
          </h2>
          <p className={styles.sectionBody}>
            A calm set of tools that stay out of your way — until the moment you need them.
          </p>

          <div className={styles.featureGrid}>
            <div className={styles.featureCard}>
              <span className={styles.featureIcon}>🔬</span>
              <h3 className={styles.featureTitle}>Source-driven research</h3>
              <p className={styles.featureBody}>
                Search Wikipedia, Semantic Scholar, and OpenAlex in parallel. Rank by
                academic-first, balanced, or broad-web. Bring your own URLs too.
              </p>
            </div>

            <div className={styles.featureCard}>
              <span className={styles.featureIcon}>✍️</span>
              <h3 className={styles.featureTitle}>Outline → draft → check</h3>
              <p className={styles.featureBody}>
                Approve an outline before the AI writes the draft. Then run a grammar,
                style, clarity, and tone pass with structured suggestions you can apply
                one click at a time.
              </p>
            </div>

            <div className={styles.featureCard}>
              <span className={styles.featureIcon}>🧮</span>
              <h3 className={styles.featureTitle}>Math you can show your work for</h3>
              <p className={styles.featureBody}>
                Step-by-step LaTeX solutions for trig equations, law of sines/cosines,
                derivatives, integrals, linear algebra, and more. Symbolic when possible,
                AI when not.
              </p>
            </div>

            <div className={styles.featureCard}>
              <span className={styles.featureIcon}>🃏</span>
              <h3 className={styles.featureTitle}>FSRS-4.5 spaced repetition</h3>
              <p className={styles.featureBody}>
                The same modern algorithm Anki users prefer. Cards you struggle with
                return sooner; ones you know fade out. Import from Quizlet or Anki.
              </p>
            </div>

            <div className={styles.featureCard}>
              <span className={styles.featureIcon}>⚡</span>
              <h3 className={styles.featureTitle}>Generate from your files</h3>
              <p className={styles.featureBody}>
                Drop in a PDF, Word doc, or slide deck and turn it into summaries,
                flashcards, MCQs, structured notes, or exam-style questions in seconds.
              </p>
            </div>

            <div className={styles.featureCard}>
              <span className={styles.featureIcon}>📅</span>
              <h3 className={styles.featureTitle}>Study planner</h3>
              <p className={styles.featureBody}>
                Exam countdowns and a daily calendar. Schedule review sessions around
                deadlines and see what&apos;s due across all your decks at a glance.
              </p>
            </div>
          </div>
        </section>

        {/* ── How AI works in Kivora — the cascade story ─────────────────── */}
        <section className={styles.gccSection}>
          <div className={styles.gccInner}>
            <span className={styles.gccEyebrow}>How AI works in Kivora</span>
            <h2 className={styles.gccTitle}>
              Pick your tier. Or let it pick for you.
            </h2>
            <p className={styles.gccBody}>
              Most study tools give you &quot;AI&quot; or &quot;no AI.&quot; Kivora has four tiers,
              and they fall back automatically. Cloud failed? Local takes over. Offline?
              The deterministic generator still produces real output.
            </p>

            <div className={styles.gccCards}>
              <div className={styles.gccCard}>
                <h3 className={styles.gccCardTitle}>Cloud AI</h3>
                <p className={styles.gccCardBody}>
                  Groq Llama-3.3 70B for the fastest, sharpest answers. Falls back to
                  xAI Grok or OpenAI if you configure them.
                </p>
              </div>

              <div className={styles.gccCard}>
                <h3 className={styles.gccCardTitle}>Local AI (Ollama)</h3>
                <p className={styles.gccCardBody}>
                  Runs Qwen, Llama, Mistral, or DeepSeek on your machine via Ollama.
                  Nothing leaves your laptop. Zero per-token cost.
                </p>
              </div>

              <div className={styles.gccCard}>
                <h3 className={styles.gccCardTitle}>Bundled offline AI</h3>
                <p className={styles.gccCardBody}>
                  Desktop app ships with three model tiers — Mini (1.5B), Balanced (3B),
                  or Pro (7B) — running on llama.cpp. Works on a flight or in a basement.
                </p>
              </div>

              <div className={styles.gccCard}>
                <h3 className={styles.gccCardTitle}>Deterministic fallback</h3>
                <p className={styles.gccCardBody}>
                  When even local AI is unavailable, a built-in TF-weighted summariser
                  still produces real notes, summaries, and flashcards. No model required.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Final CTA (Peachy Background) ─────────────────────────────── */}
        <section className={styles.ctaSection}>
          <div className={styles.ctaContent}>
            <h2 className={styles.ctaTitle}>
              Open the app. No signup. No card.
            </h2>
            <p className={styles.ctaBody}>
              Guest mode means you can drop in a file and start generating in under a minute.
              Sign up later if you want your work to sync across devices.
            </p>
            <Link href="/workspace" className={styles.ctaButton}>
              Open the app →
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer (Dark Navy) ────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <Link href="/" className={styles.footerBrand}>
              <span className={styles.brandMark}>K</span>
              <span>Kivora</span>
            </Link>
          </div>

          <div className={styles.footerLinks}>
            <strong style={{ color: '#fff', marginBottom: '0.5rem' }}>Product</strong>
            <Link href="/workspace" className={styles.footerLink}>Workspace</Link>
            <Link href="/coach" className={styles.footerLink}>Scholar Hub</Link>
            <Link href="/math" className={styles.footerLink}>Math</Link>
            <Link href="/planner" className={styles.footerLink}>Planner</Link>
          </div>

          <div className={styles.footerLinks}>
            <strong style={{ color: '#fff', marginBottom: '0.5rem' }}>Resources</strong>
            <Link href="/library" className={styles.footerLink}>Library</Link>
            <Link href="/analytics" className={styles.footerLink}>Analytics</Link>
            <Link href="/settings" className={styles.footerLink}>Settings</Link>
          </div>

          <div className={styles.footerLinks}>
            <strong style={{ color: '#fff', marginBottom: '0.5rem' }}>Company</strong>
            <Link href="/terms" className={styles.footerLink}>Terms</Link>
            <Link href="/privacy" className={styles.footerLink}>Privacy</Link>
            <Link href="/login" className={styles.footerLink}>Sign In</Link>
          </div>

          <span className={styles.footerCopy}>
            © {new Date().getFullYear()} Kivora. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
