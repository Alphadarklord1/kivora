'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

function extractToken(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Accept a full URL or a raw token.
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split('/').filter(Boolean);
    const sharedIndex = parts.findIndex(part => part === 'shared');
    if (sharedIndex >= 0 && parts[sharedIndex + 1]) {
      return parts[sharedIndex + 1];
    }
  } catch {
    // Not a URL, treat as raw token.
  }

  return trimmed;
}

export default function SharedLandingPage() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const token = useMemo(() => extractToken(input), [input]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      setError('Paste a share link or token to continue.');
      return;
    }
    setError(null);
    router.push(`/shared/${token}`);
  };

  return (
    <div className="shared-landing">
      <header className="shared-header">
        <Link href="/" className="logo">
          <span className="logo-icon">📘</span>
          <span className="logo-text">StudyPilot</span>
        </Link>
        <Link href="/login" className="btn secondary">
          Sign In
        </Link>
      </header>

      <main className="shared-body">
        <section className="hero">
          <div className="hero-badge">Shared Content</div>
          <h1>Open a StudyPilot share link</h1>
          <p>
            Paste a share link or token to view the content. You can also sign in
            to create your own shareable materials.
          </p>
          <form className="share-form" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Paste share link or token"
              value={input}
              onChange={event => setInput(event.target.value)}
              aria-label="Share link or token"
            />
            <button className="btn" type="submit">
              Open Shared Content
            </button>
          </form>
          {error && <p className="form-error">{error}</p>}
          <p className="helper">
            Example: https://study-alpha-three.vercel.app/shared/abc123
          </p>
        </section>

        <section className="info-card">
          <h2>What can be shared?</h2>
          <ul>
            <li>Folders and subfolders</li>
            <li>Uploaded files with extracted text</li>
            <li>Library items like summaries and quizzes</li>
          </ul>
          <Link href="/register" className="btn secondary">
            Create Your Own Workspace
          </Link>
        </section>
      </main>

      <style jsx>{styles}</style>
    </div>
  );
}

const styles = `
  .shared-landing {
    min-height: 100vh;
    background: var(--bg-base);
  }

  .shared-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4) var(--space-6);
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
  }

  .logo {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    text-decoration: none;
    color: var(--text-primary);
    font-weight: 700;
    font-size: var(--font-lg);
  }

  .logo-icon {
    font-size: 24px;
  }

  .shared-body {
    max-width: 960px;
    margin: 0 auto;
    padding: var(--space-7) var(--space-6);
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
    gap: var(--space-6);
  }

  .hero {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    box-shadow: var(--shadow-sm);
  }

  .hero-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    background: var(--primary-muted);
    color: var(--primary-text);
    border-radius: var(--radius-full);
    font-size: var(--font-meta);
    font-weight: 600;
    margin-bottom: var(--space-4);
  }

  .hero h1 {
    font-size: var(--font-2xl);
    margin-bottom: var(--space-3);
  }

  .hero p {
    color: var(--text-secondary);
    margin-bottom: var(--space-4);
  }

  .share-form {
    display: flex;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .share-form input {
    flex: 1;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-body);
    color: var(--text-primary);
    background: var(--bg-inset);
  }

  .share-form input:focus {
    outline: 2px solid var(--primary-muted);
    border-color: var(--primary);
  }

  .form-error {
    color: var(--error);
    font-size: var(--font-meta);
  }

  .helper {
    color: var(--text-muted);
    font-size: var(--font-meta);
  }

  .info-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
  }

  .info-card h2 {
    font-size: var(--font-lg);
    margin-bottom: var(--space-3);
  }

  .info-card ul {
    list-style: none;
    display: grid;
    gap: var(--space-2);
    color: var(--text-secondary);
    margin-bottom: var(--space-4);
  }

  .info-card li::before {
    content: '•';
    color: var(--primary);
    margin-right: var(--space-2);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    font-size: var(--font-meta);
    font-weight: 500;
    border-radius: var(--radius-md);
    border: none;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s;
    background: var(--primary);
    color: white;
  }

  .btn:hover {
    background: var(--primary-hover);
  }

  .btn.secondary {
    background: var(--bg-inset);
    color: var(--text-primary);
  }

  .btn.secondary:hover {
    background: var(--bg-hover);
  }

  @media (max-width: 900px) {
    .shared-body {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 600px) {
    .shared-body {
      padding: var(--space-5) var(--space-4);
    }

    .share-form {
      flex-direction: column;
    }
  }
`;
