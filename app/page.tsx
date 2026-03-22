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
              <span className={styles.kicker}>Welcome to Kivora</span>
              <span className={styles.kickerMuted}>Study from one calm system instead of five scattered tools</span>
            </div>

            <h1 className={styles.heroTitle}>
              Start in the right place: Workspace, Scholar Hub, or Math.
            </h1>

            <p className={styles.heroBody}>
              Workspace is where you do the work, Scholar Hub is where you understand sources
              and build reports, and Math is where technical problems stay clean and focused.
              The homepage should feel like a launchpad, not a brochure.
            </p>

            <div className={styles.heroActions}>
              <Link href="/workspace" className={styles.primaryActionLarge}>
                Open Workspace
              </Link>
              <Link href="/coach" className={styles.secondaryActionLarge}>
                Open Scholar Hub
              </Link>
              <Link href="/math" className={styles.secondaryActionLarge}>
                Open Math
              </Link>
            </div>

            <div className={styles.heroMeta}>
              <span>Offline local models</span>
              <span>Arabic + English</span>
              <span>Source study + math</span>
            </div>

            <div className={styles.statRow}>
              <article className={styles.statCard}>
                <strong>Workspace</strong>
                <span>Open files, chat with your material, generate notes and quizzes, and keep review sets in one execution space.</span>
              </article>
              <article className={styles.statCard}>
                <strong>Scholar Hub</strong>
                <span>Break down a source, understand the key ideas, build a report shape, and check writing against that source.</span>
              </article>
              <article className={styles.statCard}>
                <strong>Math</strong>
                <span>Use the solver, graphing, formulas, and units in a dedicated workflow instead of mixing math into everything else.</span>
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
            <div className={styles.sectionEyebrow}>Quick start</div>
            <h2>Pick the mode that matches the job you need to do right now.</h2>
            <p>
              The product is no longer meant to be explored as a maze of side pages.
              Choose the pillar that matches the task, then stay in that flow until the work is done.
            </p>
          </div>

          <div className={styles.pillarGrid}>
            <article className={styles.pillarCard}>
              <div className={styles.cardEyebrow}>Workspace</div>
              <h3>Do the work from real material</h3>
              <p>Use files, notes, chat, saved outputs, and review sets from one stable working area.</p>
            </article>
            <article className={styles.pillarCard}>
              <div className={styles.cardEyebrow}>Scholar Hub</div>
              <h3>Understand sources before you write</h3>
              <p>Analyze a URL, pasted text, or uploaded source file, then build a report path from it.</p>
            </article>
            <article className={styles.pillarCard}>
              <div className={styles.cardEyebrow}>Math</div>
              <h3>Keep technical work in one dedicated flow</h3>
              <p>Solve, graph, use formulas, convert units, and keep technical work separate from the rest of the app.</p>
            </article>
          </div>
        </section>

        <section className={styles.dualPanel}>
          <article className={styles.featurePanelStrong}>
            <div className={styles.sectionEyebrow}>What students can do</div>
            <h2>Use one product for the real study loop.</h2>
            <p>
              Bring in a source, understand it, draft from it, check your own work, then move into review or math only when that is actually the next step.
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
            <div className={styles.sectionEyebrow}>How it runs</div>
            <h2>Desktop-first, but still usable on the web.</h2>
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
            <div className={styles.sectionEyebrow}>Flow</div>
            <h2>A cleaner start-to-finish path.</h2>
          </div>

          <div className={styles.workflowSteps}>
            <article className={styles.workflowStep}>
              <span className={styles.stepIndex}>01</span>
              <h3>Bring in material</h3>
              <p>Start from files, copied text, or a public source and keep the material tied to the right mode.</p>
            </article>
            <article className={styles.workflowStep}>
              <span className={styles.stepIndex}>02</span>
              <h3>Work in the right pillar</h3>
              <p>Use Scholar Hub for sources, Workspace for outputs and review, and Math only when the problem becomes technical.</p>
            </article>
            <article className={styles.workflowStep}>
              <span className={styles.stepIndex}>03</span>
              <h3>Review and submit</h3>
              <p>Check the writing, build review material in Workspace, and keep the final report or study set connected to the source.</p>
            </article>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div>
            <div className={styles.sectionEyebrow}>Start</div>
            <h2>Open the pillar you need and get moving.</h2>
            <p>
              Use guest mode immediately, or sign in if you want synced settings, saved profiles, and connected providers.
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
