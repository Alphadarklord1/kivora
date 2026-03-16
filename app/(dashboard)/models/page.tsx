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
          <span className={styles.eyebrow}>Models & Downloads</span>
          <h1>Choose privacy-first local AI, cloud convenience, or both.</h1>
          <p>
            Kivora now treats offline local models and cloud APIs as one routing system. Pick the mode that fits the student:
            local for privacy and no internet, cloud for convenience, or auto to prefer local first and fall back when needed.
          </p>
          <div className={styles.highlights}>
            <span>Local keeps files on-device</span>
            <span>Cloud is faster to start</span>
            <span>Auto balances both</span>
          </div>
        </div>
        <div className={styles.actions}>
          <Link href="/models" className={`${styles.tabLink} ${activeTab === 'models' ? styles.active : ''}`}>
            Routing &amp; Setup
          </Link>
          <Link href="/models?tab=downloads" className={`${styles.tabLink} ${activeTab === 'downloads' ? styles.active : ''}`}>
            Downloads &amp; Releases
          </Link>
        </div>
      </section>

      {activeTab === 'models' ? <InstalledModelsPanel /> : <DownloadsPanel data={releaseData} />}
    </div>
  );
}
