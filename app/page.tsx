import { auth } from '@/auth';
import Link from 'next/link';
import { isDesktopOnlyModeEnabled, isGuestModeEnabled } from '@/lib/runtime/mode';

const DOWNLOAD_URL = '/downloads';

const features = [
  {
    icon: '📁',
    title: 'Smart Organization',
    description: 'Create folders and topics to keep all your study materials perfectly organized in one place.',
  },
  {
    icon: '🤖',
    title: 'Desktop Local AI',
    description: 'Run study generation tools with an offline-first desktop workflow.',
  },
  {
    icon: '📝',
    title: 'Interactive Quizzes',
    description: 'Test your knowledge with auto-generated MCQs and practice tests.',
  },
  {
    icon: '📚',
    title: 'Personal Library',
    description: 'Save your favorite generated content to your library for quick access anytime.',
  },
  {
    icon: '🔗',
    title: 'Easy Sharing',
    description: 'Share study materials with classmates via secure links with permission controls.',
  },
  {
    icon: '🔒',
    title: 'Privacy First',
    description: 'Your files stay on your device. We only sync metadata, keeping your content private.',
  },
];

const tools = [
  { icon: '📝', name: 'Assignments', desc: 'Generate practice problems' },
  { icon: '📄', name: 'Summaries', desc: 'Condense lengthy materials' },
  { icon: '✅', name: 'MCQs', desc: 'Multiple choice questions' },
  { icon: '🧠', name: 'Quizzes', desc: 'Comprehensive tests' },
  { icon: '📒', name: 'Notes', desc: 'Cornell-style study notes' },
  { icon: '✍️', name: 'Rephrase', desc: 'Rewrite text by tone and style' },
];

export default async function LandingPage() {
  const isGuestMode = isGuestModeEnabled();
  const isDesktopOnly = isDesktopOnlyModeEnabled();

  let session = null;
  try {
    session = await auth();
  } catch {
    // If auth is not configured locally, keep landing page functional.
    session = null;
  }

  const isLoggedIn = !!session?.user;
  const canUseWithoutSignIn = isGuestMode || isLoggedIn;
  const primaryWorkspaceLabel = isDesktopOnly ? 'Open Desktop Workspace →' : (isGuestMode ? 'Continue as Guest →' : 'Go to Workspace →');

  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav className="landing-nav">
        <div className="nav-container">
          <Link href="/" className="nav-logo">
            <span className="logo-icon">📘</span>
            <span className="logo-text">StudyPilot</span>
          </Link>
          <div className="nav-links">
            <Link href={DOWNLOAD_URL} className="nav-btn secondary">
              Download App
            </Link>
            <Link href="/login" className="nav-btn secondary">
              Log In
            </Link>
            {canUseWithoutSignIn ? (
              <Link href="/workspace" className="nav-btn primary">
                {primaryWorkspaceLabel}
              </Link>
            ) : (
              <Link href="/register" className="nav-btn primary">
                Get Started Free
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">Built for focused learning</div>
          <h1>Study Smarter, Not Harder</h1>
          <p className="hero-subtitle">
            Transform your study materials into interactive quizzes, summaries, and notes with an offline-first desktop workspace.
          </p>
          <div className="hero-actions">
            <Link href={DOWNLOAD_URL} className="hero-btn secondary">
              Download for Mac/Windows
            </Link>
            <Link href="/login" className="hero-btn secondary">
              I already have an account
            </Link>
            {canUseWithoutSignIn ? (
              <Link href="/workspace" className="hero-btn primary">
                {isGuestMode ? 'Continue as Guest →' : 'Open Workspace →'}
              </Link>
            ) : (
              <Link href="/register" className="hero-btn primary">
                Start Studying Free
              </Link>
            )}
          </div>
          <p className="hero-note">{canUseWithoutSignIn ? 'Local mode is available without sign-in.' : 'Create an account to sync your study data.'}</p>
          <div className="hero-trust">
            <span>🔒 Privacy-first</span>
            <span>⚡ Offline-ready tools</span>
            <span>🖥️ Desktop app</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-mockup">
            <div className="mockup-header">
              <span className="dot red"></span>
              <span className="dot yellow"></span>
              <span className="dot green"></span>
            </div>
            <div className="mockup-content">
              <div className="mockup-sidebar">
                <div className="mockup-folder">📁 Biology 101</div>
                <div className="mockup-folder">📁 Chemistry</div>
                <div className="mockup-folder active">📁 Physics</div>
              </div>
              <div className="mockup-main">
                <div className="mockup-tool">🧠 Quiz Generated!</div>
                <div className="mockup-question">Q1: What is Newton&apos;s First Law?</div>
                <div className="mockup-options">
                  <div className="mockup-option">A) Law of Inertia</div>
                  <div className="mockup-option correct">B) Objects at rest stay at rest ✓</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features">
        <div className="section-container">
          <h2>Everything You Need to Excel</h2>
          <p className="section-subtitle">
            StudyPilot combines smart organization with powerful AI tools to supercharge your learning.
          </p>
          <div className="features-grid">
            {features.map((feature, idx) => (
              <div key={idx} className="feature-card">
                <span className="feature-icon">{feature.icon}</span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tools Section */}
      <section className="tools-section">
        <div className="section-container">
          <h2>Powerful Study Tools</h2>
          <p className="section-subtitle">
            Upload your PDFs, Word docs, or PowerPoints and instantly generate study materials.
          </p>
          <div className="tools-grid">
            {tools.map((tool, idx) => (
              <div key={idx} className="tool-card">
                <span className="tool-icon">{tool.icon}</span>
                <h4>{tool.name}</h4>
                <p>{tool.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="how-it-works">
        <div className="section-container">
          <h2>How It Works</h2>
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <h3>Upload Your Materials</h3>
              <p>Drop your PDFs, Word docs, or PowerPoints into StudyPilot.</p>
            </div>
            <div className="step-arrow">→</div>
            <div className="step">
              <div className="step-number">2</div>
              <h3>Choose a Tool</h3>
              <p>Select what you need: quiz, summary, notes, or practice problems.</p>
            </div>
            <div className="step-arrow">→</div>
            <div className="step">
              <div className="step-number">3</div>
              <h3>Study Smarter</h3>
              <p>Use your generated content to learn faster and retain more.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta">
        <div className="section-container">
          <h2>Ready to Transform Your Study Routine?</h2>
          <p>Join thousands of students who study smarter with StudyPilot.</p>
          {canUseWithoutSignIn ? (
            <Link href="/workspace" className="cta-btn">
              Go to Your Workspace →
            </Link>
          ) : (
            <Link href="/register" className="cta-btn">
              Get Started Free →
            </Link>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-container">
          <div className="footer-brand">
            <span className="logo-icon">📘</span>
            <span>StudyPilot</span>
          </div>
          <p>Your AI-powered study companion. Built for students, by students.</p>
          {!canUseWithoutSignIn && (
            <div className="footer-links">
              <Link href="/login">Login</Link>
              <Link href="/register">Sign Up</Link>
            </div>
          )}
          {canUseWithoutSignIn && (
            <div className="footer-links">
              <Link href="/login">Login</Link>
              <Link href="/workspace">Continue as Guest</Link>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
