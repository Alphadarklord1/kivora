import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './page.module.css';
import { DemoChat } from '@/components/landing/DemoChat';

export const metadata: Metadata = {
  title: 'Research, Review, Submit',
  description:
    'Search sources, turn them into flashcards and notes, solve math, and plan your study flow in one private workspace.',
  openGraph: {
    title: 'Kivora — Research, Review, Submit',
    description:
      'Search sources, turn them into flashcards and notes, solve math, and plan your study flow in one private workspace.',
    url: '/',
  },
  twitter: {
    title: 'Kivora — Research, Review, Submit',
    description:
      'Search sources, turn them into flashcards and notes, solve math, and plan your study flow in one private workspace.',
  },
};

export default function RootPage() {
  return (
    <div className={styles.pageShell}>
      {/* Background layers */}
      <div className={styles.bgGlow} aria-hidden="true" />
      <div className={styles.bgGrid} aria-hidden="true" />

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>K</span>
          <span className={styles.brandText}>Kivora</span>
        </Link>

        <nav className={styles.topbarNav}>
          <Link href="/workspace" className={styles.navLink}>Workspace</Link>
          <Link href="/coach"     className={styles.navLink}>Scholar Hub</Link>
          <Link href="/math"      className={styles.navLink}>Math</Link>
          <Link href="/planner"   className={styles.navLink}>Planner</Link>
        </nav>

        <div className={styles.topbarActions}>
          <Link href="/settings#ai-models" className={styles.ghostBtn}>Desktop App</Link>
          <Link href="/login"              className={styles.ghostBtn}>Sign In</Link>
          <Link href="/register"           className={styles.primaryBtn}>Get Started Free</Link>
        </div>
      </header>

      <main className={styles.main}>

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.badgeRow}>
              <span className={styles.badge}>Built for grad students &amp; serious researchers</span>
              <span className={styles.badgeDot} />
              <span className={styles.badgeNote}>Private · Offline-ready · AR · EN · FR</span>
            </div>

            <h1 className={styles.heroTitle}>
              Research. Review.<br />
              <span className={styles.heroTitleAccent}>Submit.</span>
            </h1>

            <p className={styles.heroBody}>
              Search PubMed, arXiv, and Semantic Scholar. Import papers by DOI. Export BibTeX.
              Turn your sources into flashcards, notes, and study plans — in one private workspace your institution can&apos;t see.
            </p>

            <div className={styles.heroActions}>
              <Link href="/coach" className={styles.ctaPrimary}>
                Start Researching
                <span className={styles.ctaArrow}>→</span>
              </Link>
              <Link href="/register" className={styles.ctaSecondary}>
                Create Free Account
              </Link>
            </div>

            <div className={styles.trustRow}>
              <span className={styles.trustItem}>✓ Files stay in your browser</span>
              <span className={styles.trustItem}>✓ Client-side encrypted</span>
              <span className={styles.trustItem}>✓ Works offline with local AI</span>
            </div>
          </div>

          {/* Mock app preview */}
          <div className={styles.heroVisual}>
            <div className={styles.mockWindow}>
              <div className={styles.mockWindowBar}>
                <span className={styles.dot} style={{ background: '#ff5f57' }} />
                <span className={styles.dot} style={{ background: '#febc2e' }} />
                <span className={styles.dot} style={{ background: '#28c840' }} />
                <span className={styles.mockWindowTitle}>Kivora — Workspace</span>
              </div>
              <div className={styles.mockLayout}>
                {/* Sidebar */}
                <aside className={styles.mockSidebar}>
                  <div className={styles.mockLogo}>
                    <span className={styles.mockLogoMark}>K</span>
                    <span className={styles.mockLogoText}>Kivora</span>
                  </div>
                  <div className={styles.mockNavGroup}>
                    <div className={styles.mockNavLabel}>Core</div>
                    <div className={`${styles.mockNavItem} ${styles.active}`}>📚 Workspace</div>
                    <div className={styles.mockNavItem}>∑ Math</div>
                    <div className={styles.mockNavItem}>🎓 Scholar Hub</div>
                  </div>
                  <div className={styles.mockNavGroup}>
                    <div className={styles.mockNavLabel}>Tools</div>
                    <div className={styles.mockNavItem}>🗂️ Library</div>
                    <div className={styles.mockNavItem}>📅 Planner</div>
                    <div className={styles.mockNavItem}>📊 Analytics</div>
                  </div>
                  <div className={styles.mockSidebarFooter}>
                    <div className={styles.mockAiBadge}>● Local AI active</div>
                  </div>
                </aside>

                {/* Main panel */}
                <div className={styles.mockContent}>
                  <div className={styles.mockContentHeader}>
                    <span className={styles.mockBreadcrumb}>Workspace · Calculus Notes</span>
                    <span className={styles.mockStatusPill}>🔥 5-day streak</span>
                  </div>

                  <div className={styles.mockToolbar}>
                    {['Summarize', 'Quiz', 'Notes', 'Flashcards', 'Math'].map(t => (
                      <span key={t} className={`${styles.mockToolBtn}${t === 'Notes' ? ` ${styles.mockToolBtnActive}` : ''}`}>{t}</span>
                    ))}
                  </div>

                  <div className={styles.mockOutput}>
                    <div className={styles.mockOutputHeader}>
                      <span className={styles.mockOutputBadge}>🗒️ Notes</span>
                      <span className={styles.mockOutputMeta}>Generated · just now</span>
                    </div>
                    <div className={styles.mockOutputLine} style={{ width: '92%' }} />
                    <div className={styles.mockOutputLine} style={{ width: '78%' }} />
                    <div className={styles.mockOutputLine} style={{ width: '85%' }} />
                    <div className={styles.mockOutputLine} style={{ width: '60%' }} />
                    <div className={styles.mockOutputDivider} />
                    <div className={styles.mockOutputLine} style={{ width: '88%' }} />
                    <div className={styles.mockOutputLine} style={{ width: '72%' }} />
                  </div>

                  <div className={styles.mockCards}>
                    <div className={styles.mockMiniCard}>
                      <span className={styles.mockMiniCardIcon}>📝</span>
                      <div>
                        <div className={styles.mockMiniCardTitle}>8 MCQs ready</div>
                        <div className={styles.mockMiniCardSub}>from lecture slides</div>
                      </div>
                    </div>
                    <div className={styles.mockMiniCard}>
                      <span className={styles.mockMiniCardIcon}>🃏</span>
                      <div>
                        <div className={styles.mockMiniCardTitle}>24 flashcards</div>
                        <div className={styles.mockMiniCardSub}>3 due for review</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating badges */}
            <div className={`${styles.floatBadge} ${styles.floatBadge1}`}>
              <span>🔬</span> Research saved to Library
            </div>
            <div className={`${styles.floatBadge} ${styles.floatBadge2}`}>
              <span>✅</span> Exam in 3 days · Plan on track
            </div>
          </div>
        </section>

        {/* ── Feature strip ─────────────────────────────────────────────── */}
        <div className={styles.featureStrip}>
          {[
            { icon: '🔬', label: 'PubMed · arXiv · Semantic Scholar', sub: 'Multi-source search' },
            { icon: '📎', label: 'DOI · arXiv resolver', sub: 'Paste ID → import paper' },
            { icon: '📚', label: 'BibTeX export', sub: 'Reference library' },
            { icon: '🃏', label: 'Spaced Repetition', sub: 'FSRS-4.5 algorithm' },
            { icon: '🧮', label: 'Math Solver', sub: 'Step-by-step + LaTeX' },
            { icon: '🔒', label: 'Client-side encrypted', sub: 'Files never leave your browser' },
            { icon: '🧠', label: 'Local AI', sub: 'Works offline' },
            { icon: '🌍', label: 'AR · EN · FR', sub: 'Full RTL support' },
          ].map(f => (
            <div key={f.label} className={styles.featureStripItem}>
              <span className={styles.featureStripIcon}>{f.icon}</span>
              <div>
                <div className={styles.featureStripLabel}>{f.label}</div>
                <div className={styles.featureStripSub}>{f.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Live AI demo ──────────────────────────────────────────────── */}
        <section className={styles.demoSection}>
          <DemoChat />
        </section>

        {/* ── Pipeline strip ────────────────────────────────────────────── */}
        <section className={styles.pipelineSection}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>One connected flow</span>
            <h2 className={styles.sectionTitle}>Research → Flashcards → Exam-ready.</h2>
            <p className={styles.sectionBody}>
              Each step feeds the next. No copy-pasting between tabs, no lost context.
            </p>
          </div>
          <div className={styles.pipeline}>
            {[
              { icon: '🔬', step: 'Scholar Hub', action: 'Search PubMed, arXiv, Wikipedia', sub: 'Paste DOI → import paper instantly' },
              { icon: '💾', step: 'Reference Library', action: 'Save & export sources', sub: 'BibTeX for citations, notes per paper' },
              { icon: '⚡', step: 'Workspace', action: 'Generate from your material', sub: 'Flashcards, summaries, MCQs in one click' },
              { icon: '🃏', step: 'Spaced Repetition', action: 'Review with FSRS-4.5', sub: 'Struggle cards return sooner — like Anki' },
              { icon: '📅', step: 'Planner', action: 'Exam countdown + daily plan', sub: 'Auto-schedules based on your load' },
            ].map((item, i, arr) => (
              <div key={item.step} className={styles.pipelineItem}>
                <div className={styles.pipelineCard}>
                  <span className={styles.pipelineIcon}>{item.icon}</span>
                  <strong className={styles.pipelineStep}>{item.step}</strong>
                  <span className={styles.pipelineAction}>{item.action}</span>
                  <span className={styles.pipelineSub}>{item.sub}</span>
                </div>
                {i < arr.length - 1 && <span className={styles.pipelineArrow}>→</span>}
              </div>
            ))}
          </div>
        </section>

        {/* ── Three pillars ─────────────────────────────────────────────── */}
        <section className={styles.pillarsSection}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Three modes. One product.</span>
            <h2 className={styles.sectionTitle}>Pick the mode that matches the job.</h2>
            <p className={styles.sectionBody}>
              Each pillar is built for a specific kind of work — not just a tab that opens the same thing.
            </p>
          </div>

          <div className={styles.pillarGrid}>
            <article className={styles.pillarCard}>
              <div className={styles.pillarIcon}>📚</div>
              <div className={styles.pillarEyebrow}>Workspace</div>
              <h3 className={styles.pillarTitle}>Your main study hub</h3>
              <p className={styles.pillarBody}>
                Upload files, chat with your material, generate notes, quizzes, flashcards,
                and summaries — all tied to one stable working area.
              </p>
              <div className={styles.pillarTools}>
                {['Summarize', 'Quiz', 'MCQ', 'Notes', 'Flashcards', 'Assignment'].map(t => (
                  <span key={t} className={styles.toolTag}>{t}</span>
                ))}
              </div>
              <Link href="/workspace" className={styles.pillarLink}>Open Workspace →</Link>
            </article>

            <article className={`${styles.pillarCard} ${styles.pillarCardAccent}`}>
              <div className={styles.pillarIcon}>🎓</div>
              <div className={styles.pillarEyebrow}>Scholar Hub</div>
              <h3 className={styles.pillarTitle}>Academic research, built in</h3>
              <p className={styles.pillarBody}>
                Search PubMed, arXiv, and Semantic Scholar simultaneously. Import papers by DOI or arXiv ID.
                Save to a personal reference library and export BibTeX for your paper.
              </p>
              <div className={styles.pillarTools}>
                {['PubMed', 'arXiv', 'DOI import', 'BibTeX export', 'Report Builder'].map(t => (
                  <span key={t} className={styles.toolTag}>{t}</span>
                ))}
              </div>
              <Link href="/coach" className={styles.pillarLink}>Open Scholar Hub →</Link>
            </article>

            <article className={styles.pillarCard}>
              <div className={styles.pillarIcon}>∑</div>
              <div className={styles.pillarEyebrow}>Math</div>
              <h3 className={styles.pillarTitle}>Technical work, kept clean</h3>
              <p className={styles.pillarBody}>
                Solve step-by-step, graph equations, use formula references, and convert
                units — all without mixing math into your writing workflow.
              </p>
              <div className={styles.pillarTools}>
                {['Math Solver', 'Graphing', 'MATLAB Lab', 'Formulas', 'Units'].map(t => (
                  <span key={t} className={styles.toolTag}>{t}</span>
                ))}
              </div>
              <Link href="/math" className={styles.pillarLink}>Open Math →</Link>
            </article>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section className={styles.howSection}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>The research-to-submission pipeline</span>
            <h2 className={styles.sectionTitle}>From literature to exam-ready — one flow.</h2>
          </div>

          <div className={styles.steps}>
            {[
              {
                n: '01',
                title: 'Search & import sources',
                body: 'Search PubMed, arXiv, Wikipedia, and Semantic Scholar at once. Paste a DOI or arXiv ID to import any paper directly. Save to your reference library and export BibTeX.',
                icon: '🔬',
              },
              {
                n: '02',
                title: 'Generate study material',
                body: 'Upload lecture slides or your saved papers. Kivora generates summaries, flashcard decks, MCQs, and structured notes in seconds — all saved to your Library.',
                icon: '⚡',
              },
              {
                n: '03',
                title: 'Review with spaced repetition',
                body: 'Flashcard decks use FSRS-4.5 — the algorithm behind Anki. Cards you struggle with come back sooner. The Planner keeps your exam date in view. Share decks with study groups.',
                icon: '🃏',
              },
            ].map(step => (
              <article key={step.n} className={styles.stepCard}>
                <div className={styles.stepTop}>
                  <span className={styles.stepNum}>{step.n}</span>
                  <span className={styles.stepIcon}>{step.icon}</span>
                </div>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepBody}>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Dual feature panels ───────────────────────────────────────── */}
        <section className={styles.dualSection}>
          <article className={styles.dualCardDark}>
            <span className={styles.eyebrow}>AI routing</span>
            <h2 className={styles.dualTitle}>Cloud AI online. Local AI offline.</h2>
            <p className={styles.dualBody}>
              Kivora uses Groq (cloud) for fast online generation and Qwen via Ollama for
              fully offline local AI on desktop. You stay in control of which runs.
            </p>
            <div className={styles.aiStack}>
              <div className={styles.aiRow}>
                <span className={styles.aiDot} style={{ background: '#22c55e' }} />
                <span><strong>Online</strong> — Groq · Grok · OpenAI</span>
              </div>
              <div className={styles.aiRow}>
                <span className={styles.aiDot} style={{ background: '#60a5fa' }} />
                <span><strong>Offline</strong> — Qwen 2.5 via Ollama</span>
              </div>
              <div className={styles.aiRow}>
                <span className={styles.aiDot} style={{ background: '#a78bfa' }} />
                <span><strong>Desktop</strong> — Bundled Mini model</span>
              </div>
            </div>
          </article>

          <article className={styles.dualCard}>
            <span className={styles.eyebrow}>Privacy</span>
            <h2 className={styles.dualTitle}>Your data stays yours.</h2>
            <p className={styles.dualBody}>
              File blobs live in your browser IndexedDB, never on our servers.
              Content is encrypted client-side before sync. Blind indexes keep search fast without exposing data.
            </p>
            <ul className={styles.checkList}>
              <li>Client-side encryption vault</li>
              <li>Files stored in browser — not uploaded</li>
              <li>Blind indexes for encrypted search</li>
              <li>Analytics and crash reports are opt-in</li>
            </ul>
          </article>
        </section>

        {/* ── Tools grid ────────────────────────────────────────────────── */}
        <section className={styles.toolsSection}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Everything included</span>
            <h2 className={styles.sectionTitle}>Every tool you actually need.</h2>
          </div>

          <div className={styles.toolsGrid}>
            {[
              { icon: '📝', name: 'Summarize',       desc: 'Distill any file into key points' },
              { icon: '❓', name: 'MCQ Quiz',         desc: 'Generate multiple choice questions' },
              { icon: '🗒️', name: 'Smart Notes',      desc: 'Structured notes from your material' },
              { icon: '🃏', name: 'Flashcard SRS',    desc: 'FSRS-4.5 spaced repetition' },
              { icon: '🧮', name: 'Math Solver',      desc: 'Step-by-step with LaTeX output' },
              { icon: '📈', name: 'Graphing Calc',    desc: 'Plot equations interactively' },
              { icon: '🔬', name: 'Scholar Research', desc: 'Multi-source synthesis + citations' },
              { icon: '✍️', name: 'Writing Studio',   desc: 'AI-assisted report writing' },
              { icon: '🖥️', name: 'MATLAB Lab',       desc: 'Scientific computing in-browser' },
              { icon: '📅', name: 'Study Planner',    desc: 'Exam countdown + daily schedule' },
              { icon: '📊', name: 'Analytics',        desc: 'Track weak areas and streaks' },
              { icon: '🔗', name: 'Sharing',          desc: 'Share files and library items' },
            ].map(tool => (
              <div key={tool.name} className={styles.toolCard}>
                <span className={styles.toolCardIcon}>{tool.icon}</span>
                <strong className={styles.toolCardName}>{tool.name}</strong>
                <span className={styles.toolCardDesc}>{tool.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Final CTA ─────────────────────────────────────────────────── */}
        <section className={styles.ctaSection}>
          <div className={styles.ctaGlow} aria-hidden="true" />
          <div className={styles.ctaContent}>
            <span className={styles.eyebrow}>Free. Private. No credit card.</span>
            <h2 className={styles.ctaTitle}>Your research stays yours.</h2>
            <p className={styles.ctaBody}>
              Files live in your browser. Content is encrypted client-side. No institution, no advertiser, no one
              sees your work. Create a free account to sync across devices, or start immediately as a guest.
            </p>
            <div className={styles.ctaActions}>
              <Link href="/register" className={styles.ctaPrimary}>
                Create Free Account
                <span className={styles.ctaArrow}>→</span>
              </Link>
              <Link href="/coach" className={styles.ctaGhost}>
                Try Scholar Hub
              </Link>
              <Link href="/workspace" className={styles.ctaGhost}>
                Open Workspace
              </Link>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <Link href="/" className={styles.footerBrand}>
            <span className={styles.brandMark} style={{ width: '1.8rem', height: '1.8rem', fontSize: '0.8rem' }}>K</span>
            <span className={styles.brandText} style={{ fontSize: '0.95rem' }}>Kivora</span>
          </Link>
          <div className={styles.footerLinks}>
            <Link href="/workspace"     className={styles.footerLink}>Workspace</Link>
            <Link href="/coach"         className={styles.footerLink}>Scholar Hub</Link>
            <Link href="/math"          className={styles.footerLink}>Math</Link>
            <Link href="/planner"       className={styles.footerLink}>Planner</Link>
            <Link href="/library"       className={styles.footerLink}>Library</Link>
            <Link href="/settings"      className={styles.footerLink}>Settings</Link>
            <Link href="/login"         className={styles.footerLink}>Sign In</Link>
            <Link href="/register"      className={styles.footerLink}>Register</Link>
          </div>
          <span className={styles.footerCopy}>© {new Date().getFullYear()} Kivora</span>
        </div>
      </footer>
    </div>
  );
}
