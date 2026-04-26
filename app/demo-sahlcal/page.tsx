import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Kivora - AI Study Workspace',
  description: 'Research, review, and submit. Your private AI study companion for serious academic work.',
};

export default function SahlCalStylePage() {
  return (
    <div className={styles.pageShell}>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>K</span>
          <span className={styles.brandText}>Kivora</span>
        </Link>

        <nav className={styles.topbarNav}>
          <Link href="/workspace" className={styles.navLink}>Workspace</Link>
          <Link href="/coach" className={styles.navLink}>Scholar Hub</Link>
          <Link href="/math" className={styles.navLink}>Math</Link>
          <Link href="/planner" className={styles.navLink}>Planner</Link>
        </nav>

        <div className={styles.topbarActions}>
          <Link href="/login" className={styles.ghostBtn}>Sign In</Link>
          <Link href="/register" className={styles.primaryBtn}>Start free</Link>
        </div>
      </header>

      <main className={styles.main}>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className={styles.hero}>
          <span className={styles.badge}>Built for grad students & researchers</span>

          <h1 className={styles.heroTitle}>
            Your time,<br />
            <span className={styles.heroTitleAccent}>in focus.</span>
          </h1>

          <p className={styles.heroBody}>
            Kivora is the AI study workspace designed from day one for serious academic work.
            Arabic-first. Calendar-smart. Quietly powerful.
          </p>

          <div className={styles.heroActions}>
            <Link href="/coach" className={styles.ctaPrimary}>
              Get started free →
            </Link>
            <Link href="/workspace" className={styles.ctaSecondary}>
              See how it works
            </Link>
          </div>

          <div className={styles.trustRow}>
            <span>No credit card. Files stay in your browser.</span>
          </div>
        </section>

        {/* ── Wave Divider ──────────────────────────────────────────────── */}
        <div className={styles.waveDivider}>
          <svg viewBox="0 0 1200 80" preserveAspectRatio="none">
            <path d="M0,40 C300,80 600,0 1200,40 L1200,80 L0,80 Z" fill="#fff" />
          </svg>
        </div>

        {/* ── Value Props (Three Columns) ───────────────────────────────── */}
        <section className={styles.valueProps}>
          <div className={styles.valuePropsInner}>
            <article>
              <span className={styles.valuePropEyebrow}>Privacy-First</span>
              <h2 className={styles.valuePropTitle}>Your data stays yours</h2>
              <p className={styles.valuePropBody}>
                Files stored in browser IndexedDB. Client-side encryption. No institution,
                no advertiser sees your work.
              </p>
            </article>

            <article>
              <span className={styles.valuePropEyebrow}>Offline-Ready</span>
              <h2 className={styles.valuePropTitle}>Works without internet</h2>
              <p className={styles.valuePropBody}>
                Bundled AI models run on your laptop. Generate summaries, flashcards,
                and notes even when offline.
              </p>
            </article>

            <article>
              <span className={styles.valuePropEyebrow}>Research-Native</span>
              <h2 className={styles.valuePropTitle}>Built for academic work</h2>
              <p className={styles.valuePropBody}>
                Search PubMed, arXiv, Semantic Scholar. Import papers by DOI. Export BibTeX
                for your citations.
              </p>
            </article>
          </div>
        </section>

        {/* ── Features (Colored Cards Grid) ─────────────────────────────── */}
        <section className={styles.featuresSection}>
          <span className={styles.sectionEyebrow}>Features</span>
          <h2 className={styles.sectionTitle}>
            Everything you need. Nothing you don&apos;t.
          </h2>
          <p className={styles.sectionBody}>
            A calm set of tools that stay out of your way — until the moment you need them.
          </p>

          <div className={styles.featureGrid}>
            <div className={styles.featureCard}>
              <span className={styles.featureIcon}>🔬</span>
              <h3 className={styles.featureTitle}>Scholar Hub</h3>
              <p className={styles.featureBody}>
                Multi-source search across PubMed, arXiv, Wikipedia. Paste a DOI or arXiv ID
                to import papers instantly.
              </p>
            </div>

            <div className={styles.featureCard}>
              <span className={styles.featureIcon}>🃏</span>
              <h3 className={styles.featureTitle}>Spaced Repetition</h3>
              <p className={styles.featureBody}>
                FSRS-4.5 algorithm (like Anki). Cards you struggle with return sooner.
                Share decks with study groups.
              </p>
            </div>

            <div className={styles.featureCard}>
              <span className={styles.featureIcon}>🧮</span>
              <h3 className={styles.featureTitle}>Math Solver</h3>
              <p className={styles.featureBody}>
                Step-by-step solutions with LaTeX output. Graphing calculator, unit
                converter, formula reference.
              </p>
            </div>

            <div className={styles.featureCard}>
              <span className={styles.featureIcon}>⚡</span>
              <h3 className={styles.featureTitle}>AI Generation</h3>
              <p className={styles.featureBody}>
                Generate summaries, flashcards, MCQs, and structured notes from your
                uploaded files in seconds.
              </p>
            </div>

            <div className={styles.featureCard}>
              <span className={styles.featureIcon}>📅</span>
              <h3 className={styles.featureTitle}>Study Planner</h3>
              <p className={styles.featureBody}>
                Exam countdown with daily plan. Auto-schedules review sessions based
                on your workload and deadlines.
              </p>
            </div>

            <div className={styles.featureCard}>
              <span className={styles.featureIcon}>🌍</span>
              <h3 className={styles.featureTitle}>Arabic + RTL Support</h3>
              <p className={styles.featureBody}>
                Full support for Arabic, English, and French. Right-to-left layouts
                designed from the ground up.
              </p>
            </div>
          </div>
        </section>

        {/* ── GCC Section (Mint Background) ─────────────────────────────── */}
        <section className={styles.gccSection}>
          <div className={styles.gccInner}>
            <span className={styles.gccEyebrow}>For Students</span>
            <h2 className={styles.gccTitle}>
              Designed for how you actually study
            </h2>
            <p className={styles.gccBody}>
              Not a translated global product. A workspace that understands long study
              sessions, research workflows, and month-end in Riyadh.
            </p>

            <div className={styles.gccCards}>
              <div className={styles.gccCard}>
                <h3 className={styles.gccCardTitle}>Offline AI models</h3>
                <p className={styles.gccCardBody}>
                  Desktop app bundles a 1.5GB Mini model. No cloud dependency when you&apos;re
                  on campus or traveling.
                </p>
              </div>

              <div className={styles.gccCard}>
                <h3 className={styles.gccCardTitle}>Client-side encryption</h3>
                <p className={styles.gccCardBody}>
                  Files encrypted before sync. Blind indexes keep search fast without
                  exposing data.
                </p>
              </div>

              <div className={styles.gccCard}>
                <h3 className={styles.gccCardTitle}>BibTeX export</h3>
                <p className={styles.gccCardBody}>
                  Save sources to your reference library. Export formatted citations
                  for your paper.
                </p>
              </div>

              <div className={styles.gccCard}>
                <h3 className={styles.gccCardTitle}>Analytics opt-in</h3>
                <p className={styles.gccCardBody}>
                  Crash reports and usage analytics are disabled by default. You control
                  what gets shared.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Final CTA (Peachy Background) ─────────────────────────────── */}
        <section className={styles.ctaSection}>
          <div className={styles.ctaContent}>
            <h2 className={styles.ctaTitle}>
              Start researching the way the GCC works.
            </h2>
            <p className={styles.ctaBody}>
              Free while you grow. Three minutes to your first study deck.
            </p>
            <Link href="/register" className={styles.ctaButton}>
              Get started free →
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
