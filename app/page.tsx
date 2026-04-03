import Link from 'next/link';
import styles from './page.module.css';
import { DemoChat } from '@/components/landing/DemoChat';

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
              <span className={styles.badge}>AI-Powered Study Platform</span>
              <span className={styles.badgeDot} />
              <span className={styles.badgeNote}>Offline-ready · Arabic · English · French</span>
            </div>

            <h1 className={styles.heroTitle}>
              Study smarter.<br />
              <span className={styles.heroTitleAccent}>From one place.</span>
            </h1>

            <p className={styles.heroBody}>
              Kivora brings your files, AI tools, research, and math into a single focused workspace.
              No more juggling five tools — just the work.
            </p>

            <div className={styles.heroActions}>
              <Link href="/workspace" className={styles.ctaPrimary}>
                Open Workspace
                <span className={styles.ctaArrow}>→</span>
              </Link>
              <Link href="/register" className={styles.ctaSecondary}>
                Create Free Account
              </Link>
            </div>

            <div className={styles.trustRow}>
              <span className={styles.trustItem}>✓ No credit card needed</span>
              <span className={styles.trustItem}>✓ Guest access instant</span>
              <span className={styles.trustItem}>✓ Local AI — works offline</span>
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
            { icon: '🧠', label: 'Local AI models', sub: 'Works offline' },
            { icon: '📄', label: 'PDF · Word · PPT', sub: 'Any file type' },
            { icon: '🔬', label: 'Scholar Hub', sub: 'Research & reports' },
            { icon: '🧮', label: 'Math Solver', sub: 'Step-by-step' },
            { icon: '🃏', label: 'Spaced Repetition', sub: 'FSRS-4.5 algorithm' },
            { icon: '📅', label: 'Study Planner', sub: 'Exam countdown' },
            { icon: '🌍', label: '3 Languages', sub: 'AR · EN · FR' },
            { icon: '🔒', label: 'Encrypted', sub: 'Client-side vault' },
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
              <h3 className={styles.pillarTitle}>Research before you write</h3>
              <p className={styles.pillarBody}>
                Search multiple sources, synthesize key ideas, get grounded citations,
                then jump straight into writing a report from your findings.
              </p>
              <div className={styles.pillarTools}>
                {['Research', 'Source Brief', 'Report Builder', 'Writer', 'Recovery'].map(t => (
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
            <span className={styles.eyebrow}>Flow</span>
            <h2 className={styles.sectionTitle}>From source to submission.</h2>
          </div>

          <div className={styles.steps}>
            {[
              {
                n: '01',
                title: 'Bring in your material',
                body: 'Upload a PDF, Word doc, or PowerPoint. Paste text or a URL. Kivora keeps it tied to the right tool.',
                icon: '📂',
              },
              {
                n: '02',
                title: 'Generate what you need',
                body: 'Summarize, quiz yourself, build flashcards, solve equations — or research a topic in Scholar Hub.',
                icon: '⚡',
              },
              {
                n: '03',
                title: 'Review and keep going',
                body: 'Spaced repetition schedules your reviews. The Planner tracks your exam. Library saves all outputs.',
                icon: '🔄',
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
            <span className={styles.eyebrow}>Start now</span>
            <h2 className={styles.ctaTitle}>Ready to study smarter?</h2>
            <p className={styles.ctaBody}>
              Create a free account to sync your work across devices, or jump straight into
              Workspace as a guest — no sign-up needed.
            </p>
            <div className={styles.ctaActions}>
              <Link href="/register" className={styles.ctaPrimary}>
                Create Free Account
                <span className={styles.ctaArrow}>→</span>
              </Link>
              <Link href="/workspace" className={styles.ctaGhost}>
                Continue as Guest
              </Link>
              <Link href="/settings#ai-models" className={styles.ctaGhost}>
                Download Desktop App
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
