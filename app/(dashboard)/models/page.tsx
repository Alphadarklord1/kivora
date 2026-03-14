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
          <h1>Manage local models and desktop releases from one place.</h1>
          <p>
            Install and switch offline study models, then move to downloads and release assets without a second sidebar destination.
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/models" className={`${styles.tabLink} ${activeTab === 'models' ? styles.active : ''}`}>
            Installed &amp; Setup
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
