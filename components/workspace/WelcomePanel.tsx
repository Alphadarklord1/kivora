'use client';

interface WelcomePanelProps {
  onGetStarted?: () => void;
}

const features = [
  {
    icon: '📁',
    title: 'Organize Your Studies',
    description: 'Create folders and topics to keep your study materials organized. Upload PDFs, Word docs, and PowerPoints.',
  },
  {
    icon: '📝',
    title: 'Generate Study Content',
    description: 'Transform your materials into assignments, summaries, MCQs, quizzes, and study notes automatically.',
  },
  {
    icon: '🧠',
    title: 'Interactive Quizzes',
    description: 'Test your knowledge with generated quizzes. Get instant feedback and track your progress over time.',
  },
  {
    icon: '📚',
    title: 'Build Your Library',
    description: 'Save your favorite generated content to your personal library for quick access anytime.',
  },
  {
    icon: '🔗',
    title: 'Share & Collaborate',
    description: 'Share your study materials and generated content with classmates via secure links.',
  },
  {
    icon: '🔒',
    title: 'Privacy First',
    description: 'Your files stay on your device. We only sync metadata to the cloud, keeping your content private.',
  },
];

const quickActions = [
  { icon: '➕', label: 'Create a folder to get started', action: 'folder' },
  { icon: '📄', label: 'Upload your first study material', action: 'upload' },
  { icon: '🛠️', label: 'Try the Tools page for quick generation', action: 'tools' },
];

export function WelcomePanel({ onGetStarted }: WelcomePanelProps) {
  return (
    <div className="welcome-panel">
      <div className="welcome-header">
        <div className="welcome-icon">📘</div>
        <h1>Welcome to StudyPilot</h1>
        <p>Your AI-powered study companion. Transform your learning materials into interactive study content.</p>
      </div>

      <div className="features-grid">
        {features.map((feature, idx) => (
          <div key={idx} className="feature-card">
            <span className="feature-icon">{feature.icon}</span>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </div>
        ))}
      </div>

      <div className="getting-started">
        <h2>Getting Started</h2>
        <div className="quick-actions">
          {quickActions.map((action, idx) => (
            <button
              key={idx}
              className="quick-action"
              onClick={() => {
                if (action.action === 'folder' && onGetStarted) {
                  onGetStarted();
                } else if (action.action === 'tools') {
                  window.location.href = '/tools';
                }
              }}
            >
              <span className="action-icon">{action.icon}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="welcome-footer">
        <p>Select a folder from the left panel to view and manage your files, or create a new folder to begin.</p>
      </div>

      <style jsx>{`
        .welcome-panel {
          max-width: 900px;
          margin: 0 auto;
          padding: var(--space-4);
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .welcome-header {
          text-align: center;
          margin-bottom: var(--space-7);
          padding: var(--space-6);
          background: linear-gradient(135deg, var(--primary-muted) 0%, var(--bg-surface) 100%);
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-subtle);
        }

        .welcome-icon {
          font-size: 64px;
          margin-bottom: var(--space-4);
          filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.1));
        }

        .welcome-header h1 {
          font-size: var(--font-2xl);
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: var(--space-3);
          letter-spacing: -0.02em;
        }

        .welcome-header p {
          font-size: var(--font-lg);
          color: var(--text-secondary);
          max-width: 500px;
          margin: 0 auto;
          line-height: var(--line-relaxed);
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: var(--space-4);
          margin-bottom: var(--space-7);
        }

        .feature-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: var(--space-5);
          transition: all 0.2s ease;
        }

        .feature-card:hover {
          border-color: var(--primary);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .feature-icon {
          font-size: 32px;
          display: block;
          margin-bottom: var(--space-3);
        }

        .feature-card h3 {
          font-size: var(--font-section);
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: var(--space-2);
        }

        .feature-card p {
          font-size: var(--font-meta);
          color: var(--text-secondary);
          line-height: var(--line-relaxed);
        }

        .getting-started {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-6);
          margin-bottom: var(--space-6);
        }

        .getting-started h2 {
          font-size: var(--font-lg);
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: var(--space-4);
          text-align: center;
        }

        .quick-actions {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }

        .quick-action {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-4);
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all 0.15s ease;
          font-size: var(--font-body);
          color: var(--text-primary);
          text-align: left;
          width: 100%;
        }

        .quick-action:hover {
          background: var(--primary-muted);
          border-color: var(--primary);
          color: var(--primary-text);
        }

        .action-icon {
          font-size: 24px;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-surface);
          border-radius: var(--radius-md);
          flex-shrink: 0;
        }

        .welcome-footer {
          text-align: center;
          padding: var(--space-4);
          color: var(--text-muted);
          font-size: var(--font-meta);
        }

        @media (max-width: 600px) {
          .features-grid {
            grid-template-columns: 1fr;
          }

          .welcome-header {
            padding: var(--space-5);
          }

          .welcome-header h1 {
            font-size: var(--font-xl);
          }

          .welcome-header p {
            font-size: var(--font-body);
          }
        }
      `}</style>
    </div>
  );
}
