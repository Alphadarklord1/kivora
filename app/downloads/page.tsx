import Link from 'next/link';
import styles from './page.module.css';

const REPO_RELEASES_URL = 'https://github.com/Alphadarklord1/studypilot/releases';
const RELEASE_V111_URL = 'https://github.com/Alphadarklord1/studypilot/releases/tag/v1.1.1';
const RELEASE_V111_DMG_URL = 'https://github.com/Alphadarklord1/studypilot/releases/download/v1.1.1/StudyPilot-1.1.0-arm64.dmg';

export default function DownloadsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>Download StudyPilot</h1>
        <p>Desktop-only builds are published through GitHub Releases.</p>

        <div className={styles.downloadList}>
          <a href={RELEASE_V111_URL} className={`${styles.downloadBtn} ${styles.primary}`} target="_blank" rel="noopener noreferrer">
            Open Release v1.1.1
          </a>
          <a href={RELEASE_V111_DMG_URL} className={styles.downloadBtn} target="_blank" rel="noopener noreferrer">
            Download macOS DMG (v1.1.1)
          </a>
          <a href={REPO_RELEASES_URL} className={styles.downloadBtn} target="_blank" rel="noopener noreferrer">
            Browse all releases
          </a>
        </div>

        <p className={styles.note}>
          If direct asset download fails, open the latest release page and download the DMG/EXE asset manually.
        </p>

        <Link href="/" className={styles.backLink}>
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
