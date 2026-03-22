import Link from 'next/link';
import styles from './page.module.css';

export default function RootPage() {
  return (
    <div className={styles.pageShell}>
      <div className={styles.backdrop} />

      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>K</span>
          <span className={styles.brandText}>Kivora</span>
        </Link>

        <div className={styles.topbarActions}>
          <Link href="/settings#ai-models" className={styles.secondaryAction}>
            Download Desktop
          </Link>
          <Link href="/login" className={styles.secondaryAction}>
            Log In
          </Link>
          <Link href="/workspace" className={styles.primaryAction}>
            Continue as Guest
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.kickerRow}>
              <span className={styles.kicker}>Offline-First Study AI</span>
              <span className={styles.kickerMuted}>Desktop primary, web beta</span>
            </div>

            <h1 className={styles.heroTitle}>
              Work from three clear pillars: Workspace, Scholar Hub, and Math.
            </h1>

            <p className={styles.heroBody}>
              Kivora gives students one execution space, one source-study space, and one
              dedicated math space. Upload material, break down sources, solve problems,
              and keep the whole study flow connected.
            </p>

            <div className={styles.heroActions}>
              <Link href="/workspace" className={styles.primaryActionLarge}>
                Open Workspace
              </Link>
              <Link href="/coach" className={styles.secondaryActionLarge}>
                Open Scholar Hub
              </Link>
            </div>

            <div className={styles.heroMeta}>
              <span>Offline local models</span>
              <span>Arabic + English</span>
              <span>Source study + math</span>
            </div>

            <div className={styles.statRow}>
              <article className={styles.statCard}>
                <strong>Workspace-first</strong>
                <span>Files, AI tools, notes, review sets, and saved outputs work from one execution space.</span>
              </article>
              <article className={styles.statCard}>
                <strong>Scholar Hub</strong>
                <span>Break down sources, build report examples, learn more in detail, and check student writing.</span>
              </article>
              <article className={styles.statCard}>
                <strong>Math-ready</strong>
                <span>Math solver, graphing, and technical tools stay in a dedicated workflow instead of being mixed into everything else.</span>
              </article>
            </div>
          </div>

          <div className={styles.heroPanel}>
            <div className={styles.appFrame}>
              <div className={styles.appFrameHeader}>
                <span className={styles.windowDot} />
                <span className={styles.windowDot} />
                <span className={styles.windowDot} />
                <span className={styles.windowTitle}>Kivora Workspace</span>
              </div>

              <div className={styles.appFrameBody}>
                <aside className={styles.mockSidebar}>
                  <div className={styles.mockSectionLabel}>Main</div>
                  <div className={`${styles.mockNavItem} ${styles.mockNavItemActive}`}>Workspace</div>
                  <div className={styles.mockNavItem}>Scholar Hub</div>
                  <div className={styles.mockNavItem}>Math</div>

                  <div className={styles.mockDivider} />

                  <div className={styles.mockSectionLabel}>Tools</div>
                  <div className={styles.mockTagRow}>
                    <span className={styles.mockTag}>Summaries</span>
                    <span className={styles.mockTag}>Rephrase</span>
                    <span className={styles.mockTag}>Quiz</span>
                    <span className={styles.mockTag}>Math</span>
                    <span className={styles.mockTag}>MATLAB</span>
                  </div>
                </aside>

                <div className={styles.mockMain}>
                  <div className={styles.mockCardLarge}>
                    <div className={styles.mockCardHeader}>
                      <div>
                        <div className={styles.mockEyebrow}>Today</div>
                        <strong>Exam prep plan</strong>
                      </div>
                      <span className={styles.mockPill}>Local AI active</span>
                    </div>

                    <div className={styles.mockCalendarGrid}>
                      <div className={styles.mockCalendarCellStrong}>Security notes summary</div>
                      <div className={styles.mockCalendarCell}>Math problem set review</div>
                      <div className={styles.mockCalendarCell}>Generate 10 MCQs</div>
                      <div className={styles.mockCalendarCell}>Scholar Hub source check</div>
                    </div>

                    <div className={styles.mockBottomRow}>
                      <div className={styles.mockCard}>
                        <div className={styles.mockEyebrow}>Analytics</div>
                        <strong>Weak area: calculus limits</strong>
                        <p>Suggested next action: 20-minute review block and quiz retry.</p>
                      </div>
                      <div className={styles.mockCard}>
                        <div className={styles.mockEyebrow}>Math</div>
                        <strong>Integral sent to graphing</strong>
                        <p>Solve, visualize, and reuse technical work without leaving the workspace.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.sectionGrid}>
          <div className={styles.sectionIntro}>
            <div className={styles.sectionEyebrow}>Core product</div>
            <h2>The product is now built around three jobs instead of a long list of side pages.</h2>
            <p>
              Workspace is for doing the work, Scholar Hub is for understanding sources,
              and Math is for technical problem solving. The rest of the product now supports
              those three flows instead of competing with them.
            </p>
          </div>

          <div className={styles.pillarGrid}>
            <article className={styles.pillarCard}>
              <div className={styles.cardEyebrow}>Workspace</div>
              <h3>Do the work from real files</h3>
              <p>Generate summaries, notes, quizzes, review sets, and saved outputs from your material.</p>
            </article>
            <article className={styles.pillarCard}>
              <div className={styles.cardEyebrow}>Scholar Hub</div>
              <h3>Understand sources before you write</h3>
              <p>Analyze a URL or pasted text, extract key ideas, draft a report shape, and check your work.</p>
            </article>
            <article className={styles.pillarCard}>
              <div className={styles.cardEyebrow}>Math</div>
              <h3>Keep technical work in one dedicated flow</h3>
              <p>Solve, graph, use formulas, convert units, and work through technical problems without leaving Math.</p>
            </article>
          </div>
        </section>

        <section className={styles.dualPanel}>
          <article className={styles.featurePanelStrong}>
            <div className={styles.sectionEyebrow}>Tools</div>
            <h2>AI, math, and document tools in one system.</h2>
            <p>
              Rephrase, summarize, make quizzes, solve math, graph functions, inspect
              visuals, and work in a MATLAB-style lab without switching products.
            </p>
            <div className={styles.toolList}>
              <span className={styles.toolChip}>Summarize</span>
              <span className={styles.toolChip}>Rephrase</span>
              <span className={styles.toolChip}>Notes</span>
              <span className={styles.toolChip}>Quiz</span>
              <span className={styles.toolChip}>Math Solver</span>
              <span className={styles.toolChip}>Graphing</span>
              <span className={styles.toolChip}>MATLAB Lab</span>
              <span className={styles.toolChip}>Visual Analyzer</span>
            </div>
          </article>

          <article className={styles.featurePanel}>
            <div className={styles.sectionEyebrow}>Runtime</div>
            <h2>Desktop-first, with local models preferred.</h2>
            <p>
              Kivora is built to work with local open-source models on desktop first,
              then fall back safely when needed. That keeps the app useful even when
              cloud access is limited.
            </p>
            <ul className={styles.bulletList}>
              <li>Bundled Mini model for offline-first desktop use</li>
              <li>Optional stronger models for more capable generation</li>
              <li>Arabic and English study workflows supported</li>
            </ul>
          </article>
        </section>

        <section className={styles.workflowSection}>
          <div className={styles.sectionIntroCompact}>
            <div className={styles.sectionEyebrow}>Workflow</div>
            <h2>How the product is meant to be used.</h2>
          </div>

          <div className={styles.workflowSteps}>
            <article className={styles.workflowStep}>
              <span className={styles.stepIndex}>01</span>
              <h3>Bring in material</h3>
              <p>Upload PDFs, Word files, images, or raw text and organize them into folders and subtopics.</p>
            </article>
            <article className={styles.workflowStep}>
              <span className={styles.stepIndex}>02</span>
              <h3>Generate what you need</h3>
              <p>Create summaries, notes, quizzes, and rephrased text in Workspace, then move into Math when the problem needs a dedicated solver.</p>
            </article>
            <article className={styles.workflowStep}>
              <span className={styles.stepIndex}>03</span>
              <h3>Deepen and review</h3>
              <p>Use Scholar Hub for source understanding, then move longer-term review sets and follow-up work into Workspace.</p>
            </article>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div>
            <div className={styles.sectionEyebrow}>Start</div>
            <h2>Open the workspace or install the desktop app.</h2>
            <p>
              Use guest mode immediately, or sign in if you want persistence and provider-linked workflows.
            </p>
          </div>

          <div className={styles.finalActions}>
            <Link href="/workspace" className={styles.primaryActionLarge}>
              Continue as Guest
            </Link>
            <Link href="/settings#ai-models" className={styles.secondaryActionLarge}>
              Download Kivora
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
