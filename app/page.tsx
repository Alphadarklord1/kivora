import { auth } from '@/auth';
import Link from 'next/link';
import { isDesktopOnlyModeEnabled, isGuestModeEnabled } from '@/lib/runtime/mode';
import styles from './page.module.css';

const DOWNLOAD_URL = '/downloads';

const pillars = [
  {
    eyebrow: 'Organize',
    title: 'One workspace for files, folders, and generated study assets.',
    body: 'Keep modules, chapters, quizzes, summaries, and notes in one system instead of scattered tabs and documents.',
  },
  {
    eyebrow: 'Generate',
    title: 'Turn source material into quizzes, notes, rephrased drafts, and study plans.',
    body: 'Kivora keeps the workflow focused on academic work so the tools stay fast, predictable, and useful.',
  },
  {
    eyebrow: 'Review',
    title: 'Track progress through planner, analytics, and saved results.',
    body: 'Move from raw material to scheduled study sessions with enough structure to actually use the app every day.',
  },
];

const toolHighlights = [
  'Summaries',
  'MCQs',
  'Quizzes',
  'Notes',
  'Rephrase',
  'Math + MATLAB',
  'Planner',
  'Analytics',
];

const proofStats = [
  { value: 'Offline-first', label: 'Desktop AI path with local fallback' },
  { value: 'Guest-ready', label: 'Core study flows work without account setup' },
  { value: 'EN / AR', label: 'Bilingual workspace with RTL support' },
];

export default async function LandingPage() {
  const isGuestMode = isGuestModeEnabled();
  const isDesktopOnly = isDesktopOnlyModeEnabled();

  let session = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }

  const isLoggedIn = !!session?.user;
  const canUseWithoutSignIn = isGuestMode || isLoggedIn;
  const primaryHref = canUseWithoutSignIn ? '/workspace' : '/register';
  const primaryLabel = canUseWithoutSignIn
    ? isDesktopOnly
      ? 'Open Desktop Workspace'
      : isGuestMode
        ? 'Continue as Guest'
        : 'Open Workspace'
    : 'Create Free Account';

  return (
    <div className={styles.pageShell}>
      <div className={styles.backdrop} />
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>◢</span>
          <span className={styles.brandText}>Kivora</span>
        </Link>
        <nav className={styles.topbarActions}>
          <Link href={DOWNLOAD_URL} className={styles.secondaryAction}>
            Download
          </Link>
          <Link href="/login" className={styles.secondaryAction}>
            Log In
          </Link>
          <Link href={primaryHref} className={styles.primaryAction}>
            {primaryLabel}
          </Link>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.kickerRow}>
              <span className={styles.kicker}>Desktop study system</span>
              <span className={styles.kickerMuted}>Built for real coursework, not generic chat.</span>
            </div>
            <h1 className={styles.heroTitle}>
              A focused study workspace for files, planning, math, and AI generation.
            </h1>
            <p className={styles.heroBody}>
              Kivora combines structured folders, a planner, math tools, and guarded AI workflows so you can move from source material to actual study sessions without the usual clutter.
            </p>
            <div className={styles.heroActions}>
              <Link href={primaryHref} className={styles.primaryActionLarge}>
                {primaryLabel}
              </Link>
              <Link href={DOWNLOAD_URL} className={styles.secondaryActionLarge}>
                Get Desktop Build
              </Link>
            </div>
            <div className={styles.heroMeta}>
              <span>{canUseWithoutSignIn ? 'Guest mode available' : 'Account sync available'}</span>
              <span>Optional Google / GitHub login</span>
              <span>Local-first AI model support</span>
            </div>
          </div>

          <div className={styles.heroPanel}>
            <div className={styles.appFrame}>
              <div className={styles.appFrameHeader}>
                <span className={styles.windowDot} />
                <span className={styles.windowDot} />
                <span className={styles.windowDot} />
                <div className={styles.windowTitle}>Workspace Snapshot</div>
              </div>
              <div className={styles.appFrameBody}>
                <aside className={styles.mockSidebar}>
                  <div className={styles.mockSectionLabel}>Modules</div>
                  <div className={styles.mockNavItem}>Security Engineering</div>
                  <div className={`${styles.mockNavItem} ${styles.mockNavItemActive}`}>Calculus II</div>
                  <div className={styles.mockNavItem}>Signals</div>
                  <div className={styles.mockDivider} />
                  <div className={styles.mockSectionLabel}>Tools</div>
                  <div className={styles.mockTagRow}>
                    {toolHighlights.slice(0, 4).map((tool) => (
                      <span key={tool} className={styles.mockTag}>
                        {tool}
                      </span>
                    ))}
                  </div>
                </aside>
                <div className={styles.mockMain}>
                  <div className={styles.mockCardLarge}>
                    <div className={styles.mockCardHeader}>
                      <span className={styles.mockEyebrow}>Planner</span>
                      <span className={styles.mockPill}>Today</span>
                    </div>
                    <div className={styles.mockCalendarGrid}>
                      <div className={styles.mockCalendarCellStrong}>Exam review</div>
                      <div className={styles.mockCalendarCell}>MCQ drill</div>
                      <div className={styles.mockCalendarCell}>Math lab</div>
                      <div className={styles.mockCalendarCell}>Summary pass</div>
                    </div>
                  </div>
                  <div className={styles.mockBottomRow}>
                    <div className={styles.mockCard}>
                      <span className={styles.mockEyebrow}>AI</span>
                      <strong>Generate 20-min plan</strong>
                      <p>Weak area: integration techniques</p>
                    </div>
                    <div className={styles.mockCard}>
                      <span className={styles.mockEyebrow}>Math</span>
                      <strong>Integral from 0 to 1</strong>
                      <p>Keyboard and solver in one panel</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.statRow}>
          {proofStats.map((stat) => (
            <div key={stat.value} className={styles.statCard}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </section>

        <section className={styles.sectionGrid}>
          <div className={styles.sectionIntro}>
            <span className={styles.sectionEyebrow}>Why it works</span>
            <h2>Built around the actual study loop.</h2>
            <p>
              The product is strongest when it keeps the workflow narrow: collect material, generate the right artifact, schedule the session, then review progress.
            </p>
          </div>
          <div className={styles.pillarGrid}>
            {pillars.map((pillar) => (
              <article key={pillar.title} className={styles.pillarCard}>
                <span className={styles.cardEyebrow}>{pillar.eyebrow}</span>
                <h3>{pillar.title}</h3>
                <p>{pillar.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.dualPanel}>
          <article className={styles.featurePanel}>
            <span className={styles.sectionEyebrow}>Tool stack</span>
            <h2>Core tools that belong to the same system.</h2>
            <div className={styles.toolList}>
              {toolHighlights.map((tool) => (
                <div key={tool} className={styles.toolChip}>
                  {tool}
                </div>
              ))}
            </div>
            <p>
              Workspace, tools, planner, analytics, and library are meant to feed each other instead of acting like separate mini apps.
            </p>
          </article>

          <article className={styles.featurePanelStrong}>
            <span className={styles.sectionEyebrow}>Desktop-first AI</span>
            <h2>Use local models when you need them. Fall back only when configured.</h2>
            <ul className={styles.bulletList}>
              <li>Bundled Mini model for immediate offline use</li>
              <li>Optional stronger local models from release assets</li>
              <li>Web path can use cloud AI with deterministic fallback</li>
              <li>Study-only policy keeps generation constrained to the product scope</li>
            </ul>
          </article>
        </section>

        <section className={styles.workflowSection}>
          <div className={styles.sectionIntroCompact}>
            <span className={styles.sectionEyebrow}>Workflow</span>
            <h2>From raw material to revision plan.</h2>
          </div>
          <div className={styles.workflowSteps}>
            <div className={styles.workflowStep}>
              <span className={styles.stepIndex}>01</span>
              <h3>Collect</h3>
              <p>Upload files, structure folders, and keep subjects separated.</p>
            </div>
            <div className={styles.workflowStep}>
              <span className={styles.stepIndex}>02</span>
              <h3>Generate</h3>
              <p>Turn content into quizzes, summaries, notes, rephrased drafts, and math work.</p>
            </div>
            <div className={styles.workflowStep}>
              <span className={styles.stepIndex}>03</span>
              <h3>Schedule</h3>
              <p>Push the next action into planner and track study consistency over time.</p>
            </div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div>
            <span className={styles.sectionEyebrow}>Ready</span>
            <h2>Open the workspace and start with the files you already have.</h2>
            <p>
              {canUseWithoutSignIn
                ? 'You can start in guest mode immediately and add sign-in later if you want sync and linked providers.'
                : 'Create an account if you want synced plans, analytics, and shared workspaces.'}
            </p>
          </div>
          <div className={styles.finalActions}>
            <Link href={primaryHref} className={styles.primaryActionLarge}>
              {primaryLabel}
            </Link>
            <Link href={DOWNLOAD_URL} className={styles.secondaryActionLarge}>
              Downloads
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
