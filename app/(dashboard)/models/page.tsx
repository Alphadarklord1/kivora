import Link from 'next/link';
import { InstalledModelsPanel } from '@/components/models/InstalledModelsPanel';
import { DownloadsPanel } from '@/components/models/DownloadsPanel';
import { getReleaseDownloadData } from '@/lib/models/downloads';
import styles from './page.module.css';

export default async function ModelsPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  const resolved = await searchParams;
  const activeTab = resolved?.tab === 'downloads' ? 'downloads' : 'models';
  const releaseData = await getReleaseDownloadData();

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>AI Models</span>
          <h1>Local AI, cloud AI, or both</h1>
          <p>
            Run free AI models privately on your device using Ollama, or connect a cloud API for
            maximum power. The routing panel lets you switch between them at any time.
          </p>
          <div className={styles.highlights}>
            <span>🔒 Local = private, offline, free</span>
            <span>☁ Cloud = fast, powerful, needs internet</span>
            <span>⚡ Auto = best of both</span>
          </div>
        </div>
        <div className={styles.actions}>
          <Link
            href="/models"
            className={`${styles.tabLink} ${activeTab === 'models' ? styles.active : ''}`}
          >
            Models &amp; Setup
          </Link>
          <Link
            href="/models?tab=downloads"
            className={`${styles.tabLink} ${activeTab === 'downloads' ? styles.active : ''}`}
          >
            Downloads &amp; Releases
          </Link>
        </div>
      </section>

      {activeTab === 'models' ? <InstalledModelsPanel /> : <DownloadsPanel data={releaseData} />}
    </div>
  );
}
