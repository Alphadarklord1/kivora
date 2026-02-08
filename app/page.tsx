import { auth } from '@/auth';
import Link from 'next/link';

const features = [
  {
    icon: '📁',
    title: 'Smart Organization',
    description: 'Create folders and topics to keep all your study materials perfectly organized in one place.',
  },
  {
    icon: '🤖',
    title: 'AI-Powered Tools',
    description: 'Transform your notes into quizzes, summaries, flashcards, and study guides automatically.',
  },
  {
    icon: '📝',
    title: 'Interactive Quizzes',
    description: 'Test your knowledge with auto-generated MCQs, pop quizzes, and practice tests.',
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
  { icon: '⚡', name: 'Pop Quiz', desc: 'Quick review sessions' },
  { icon: '📒', name: 'Notes', desc: 'Cornell-style study notes' },
];

export default async function LandingPage() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

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
            {isLoggedIn ? (
              <Link href="/workspace" className="nav-btn primary">
                Go to Workspace →
              </Link>
            ) : (
              <>
                <Link href="/login" className="nav-btn secondary">
                  Log In
                </Link>
                <Link href="/register" className="nav-btn primary">
                  Get Started Free
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1>Study Smarter, Not Harder</h1>
          <p className="hero-subtitle">
            Transform your study materials into interactive quizzes, summaries, and notes.
            Your AI-powered study companion that helps you learn more effectively.
          </p>
          <div className="hero-actions">
            {isLoggedIn ? (
              <Link href="/workspace" className="hero-btn primary">
                Open Workspace →
              </Link>
            ) : (
              <>
                <Link href="/register" className="hero-btn primary">
                  Start Studying Free
                </Link>
                <Link href="/login" className="hero-btn secondary">
                  I already have an account
                </Link>
              </>
            )}
          </div>
          <p className="hero-note">No credit card required. Free forever for students.</p>
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
          {isLoggedIn ? (
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
          <div className="footer-links">
            <Link href="/login">Login</Link>
            <Link href="/register">Sign Up</Link>
          </div>
        </div>
      </footer>

      <style jsx>{`
        .landing-page {
          background: radial-gradient(circle at 10% 10%, rgba(37, 99, 235, 0.12), transparent 45%),
            radial-gradient(circle at 90% 0%, rgba(99, 102, 241, 0.12), transparent 35%),
            var(--bg-base);
          color: var(--text-primary);
        }

        .landing-nav {
          position: sticky;
          top: 0;
          z-index: 20;
          backdrop-filter: blur(16px);
          background: color-mix(in srgb, var(--bg-surface) 85%, transparent);
          border-bottom: 1px solid var(--border-subtle);
        }

        .nav-container {
          max-width: 1100px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-4) var(--space-6);
          gap: var(--space-4);
        }

        .nav-logo {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          text-decoration: none;
          color: var(--text-primary);
          font-weight: 700;
          font-size: var(--font-lg);
        }

        .logo-icon {
          font-size: 26px;
        }

        .nav-links {
          display: flex;
          gap: var(--space-2);
          align-items: center;
        }

        .nav-btn {
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-full);
          font-size: var(--font-meta);
          font-weight: 600;
          text-decoration: none;
          border: 1px solid transparent;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .nav-btn.primary {
          background: var(--primary);
          color: white;
          box-shadow: var(--shadow-sm);
        }

        .nav-btn.secondary {
          background: var(--bg-inset);
          color: var(--text-primary);
          border-color: var(--border-subtle);
        }

        .nav-btn:hover {
          transform: translateY(-1px);
          box-shadow: var(--shadow-md);
        }

        .hero {
          max-width: 1100px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: var(--space-7);
          padding: var(--space-8) var(--space-6);
          align-items: center;
        }

        .hero-content h1 {
          font-family: "Fraunces", serif;
          font-size: clamp(32px, 4vw, 52px);
          margin-bottom: var(--space-3);
        }

        .hero-subtitle {
          font-size: var(--font-lg);
          color: var(--text-secondary);
          max-width: 520px;
          margin-bottom: var(--space-4);
        }

        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-3);
          margin-bottom: var(--space-3);
        }

        .hero-btn {
          padding: var(--space-3) var(--space-5);
          border-radius: var(--radius-full);
          font-weight: 600;
          text-decoration: none;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .hero-btn.primary {
          background: var(--primary);
          color: white;
          box-shadow: var(--shadow-md);
        }

        .hero-btn.secondary {
          background: var(--bg-surface);
          color: var(--text-primary);
          border: 1px solid var(--border-subtle);
        }

        .hero-btn:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-lg);
        }

        .hero-note {
          font-size: var(--font-meta);
          color: var(--text-muted);
        }

        .hero-visual {
          display: flex;
          justify-content: center;
        }

        .hero-mockup {
          background: var(--bg-surface);
          border-radius: 24px;
          border: 1px solid var(--border-subtle);
          box-shadow: var(--shadow-lg);
          overflow: hidden;
          width: min(420px, 90vw);
        }

        .mockup-header {
          display: flex;
          gap: 8px;
          padding: var(--space-3);
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-inset);
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
        }

        .dot.red { background: #ef4444; }
        .dot.yellow { background: #f59e0b; }
        .dot.green { background: #22c55e; }

        .mockup-content {
          display: grid;
          grid-template-columns: 1fr 1.4fr;
          min-height: 240px;
        }

        .mockup-sidebar {
          background: color-mix(in srgb, var(--bg-inset) 90%, transparent);
          padding: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          font-size: var(--font-meta);
        }

        .mockup-folder {
          padding: 6px 10px;
          border-radius: 10px;
        }

        .mockup-folder.active {
          background: rgba(37, 99, 235, 0.15);
          color: var(--primary);
          font-weight: 600;
        }

        .mockup-main {
          padding: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .mockup-tool {
          background: rgba(99, 102, 241, 0.12);
          padding: var(--space-2);
          border-radius: 10px;
          font-size: var(--font-meta);
          font-weight: 600;
        }

        .mockup-question {
          font-weight: 600;
          font-size: var(--font-meta);
        }

        .mockup-option {
          padding: 6px 8px;
          border-radius: 8px;
          background: var(--bg-inset);
          font-size: var(--font-tiny);
        }

        .mockup-option.correct {
          background: rgba(34, 197, 94, 0.15);
          color: var(--success);
          font-weight: 600;
        }

        .section-container {
          max-width: 1100px;
          margin: 0 auto;
          padding: var(--space-7) var(--space-6);
        }

        .section-container h2 {
          font-family: "Fraunces", serif;
          font-size: clamp(26px, 3vw, 36px);
          margin-bottom: var(--space-2);
        }

        .section-subtitle {
          color: var(--text-secondary);
          margin-bottom: var(--space-5);
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: var(--space-3);
        }

        .feature-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 18px;
          padding: var(--space-4);
          box-shadow: var(--shadow-sm);
        }

        .feature-icon {
          font-size: 26px;
          display: inline-flex;
          margin-bottom: var(--space-2);
        }

        .tools-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: var(--space-3);
        }

        .tool-card {
          background: color-mix(in srgb, var(--bg-surface) 90%, transparent);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: var(--space-3);
        }

        .how-it-works {
          background: var(--bg-surface);
        }

        .steps {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: var(--space-3);
          align-items: center;
        }

        .step {
          background: var(--bg-inset);
          border-radius: 16px;
          padding: var(--space-4);
        }

        .step-number {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: var(--primary);
          color: white;
          display: grid;
          place-items: center;
          font-weight: 700;
          margin-bottom: var(--space-2);
        }

        .step-arrow {
          font-size: 24px;
          color: var(--text-muted);
          text-align: center;
        }

        .cta {
          text-align: center;
        }

        .cta-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-3) var(--space-6);
          background: var(--primary);
          color: white;
          border-radius: var(--radius-full);
          text-decoration: none;
          font-weight: 600;
          box-shadow: var(--shadow-md);
        }

        .landing-footer {
          border-top: 1px solid var(--border-subtle);
          background: var(--bg-surface);
        }

        .footer-container {
          max-width: 1100px;
          margin: 0 auto;
          padding: var(--space-6);
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          text-align: center;
        }

        .footer-links {
          display: flex;
          justify-content: center;
          gap: var(--space-3);
        }

        .footer-links a {
          text-decoration: none;
          color: var(--text-secondary);
        }

        @media (max-width: 768px) {
          .nav-container {
            flex-direction: column;
            align-items: flex-start;
          }

          .hero {
            padding-top: var(--space-6);
          }

          .hero-actions {
            flex-direction: column;
            align-items: stretch;
          }

          .mockup-content {
            grid-template-columns: 1fr;
          }

          .step-arrow {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
