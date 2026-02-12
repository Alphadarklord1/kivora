import Link from 'next/link';

const REPO_RELEASES_URL = 'https://github.com/Alphadarklord1/studypilot/releases';
const LATEST_RELEASE_URL = 'https://github.com/Alphadarklord1/studypilot/releases/latest';
const MAC_APPLE_SILICON_URL = 'https://github.com/Alphadarklord1/studypilot/releases/download/v1.1.0/StudyPilot-1.1.0-arm64.dmg';

export default function DownloadsPage() {
  return (
    <div className="downloads-page">
      <div className="downloads-card">
        <h1>Download StudyPilot</h1>
        <p>Desktop-only builds are published through GitHub Releases.</p>

        <div className="download-list">
          <a href={MAC_APPLE_SILICON_URL} className="download-btn primary" target="_blank" rel="noopener noreferrer">
            Download macOS (Apple Silicon)
          </a>
          <a href={LATEST_RELEASE_URL} className="download-btn" target="_blank" rel="noopener noreferrer">
            Open latest release
          </a>
          <a href={REPO_RELEASES_URL} className="download-btn" target="_blank" rel="noopener noreferrer">
            Browse all releases
          </a>
        </div>

        <p className="note">
          If a button opens a release page without assets, the build has not been attached to that release yet.
        </p>

        <Link href="/" className="back-link">
          ← Back to home
        </Link>
      </div>

      <style jsx>{`
        .downloads-page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: var(--space-4);
          background: var(--bg-base);
        }

        .downloads-card {
          width: min(620px, 100%);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-6);
          display: grid;
          gap: var(--space-3);
        }

        h1 {
          margin: 0;
          font-size: var(--font-2xl);
        }

        p {
          margin: 0;
          color: var(--text-muted);
        }

        .download-list {
          display: grid;
          gap: var(--space-2);
          margin-top: var(--space-2);
        }

        .download-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 12px 14px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-default);
          text-decoration: none;
          color: var(--text-primary);
          font-weight: 600;
          background: var(--bg-base);
        }

        .download-btn.primary {
          background: var(--primary);
          color: #fff;
          border-color: transparent;
        }

        .download-btn:hover {
          background: var(--bg-hover);
        }

        .download-btn.primary:hover {
          filter: brightness(1.05);
        }

        .note {
          font-size: var(--font-meta);
        }

        .back-link {
          margin-top: var(--space-2);
          text-decoration: none;
          color: var(--primary);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
