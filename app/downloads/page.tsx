import Link from 'next/link';
import styles from './page.module.css';

const REPO_RELEASES_URL = 'https://github.com/Alphadarklord1/studypilot/releases';
const LATEST_RELEASE_URL = 'https://github.com/Alphadarklord1/studypilot/releases/latest';
const MAC_APPLE_SILICON_URL = 'https://github.com/Alphadarklord1/studypilot/releases/download/v1.1.0/StudyPilot-1.1.0-arm64.dmg';

export default function DownloadsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>Download StudyPilot</h1>
        <p>Desktop-only builds are published through GitHub Releases.</p>

        <div className={styles.downloadList}>
          <a href={MAC_APPLE_SILICON_URL} className={`${styles.downloadBtn} ${styles.primary}`} target="_blank" rel="noopener noreferrer">
            Download macOS (Apple Silicon)
          </a>
          <a href={LATEST_RELEASE_URL} className={styles.downloadBtn} target="_blank" rel="noopener noreferrer">
            Open latest release
          </a>
          <a href={REPO_RELEASES_URL} className={styles.downloadBtn} target="_blank" rel="noopener noreferrer">
            Browse all releases
          </a>
        </div>

        <p className={styles.note}>
          If a button opens a release page without assets, the build has not been attached to that release yet.
        </p>

        <Link href="/" className={styles.backLink}>
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
