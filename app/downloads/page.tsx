import Link from 'next/link';
import styles from './page.module.css';

const REPO_RELEASES_URL = 'https://github.com/Alphadarklord1/studypilot/releases';
const FALLBACK_TAG = process.env.NEXT_PUBLIC_STUDYPILOT_RELEASE_TAG || 'v1.1.1';
const FALLBACK_RELEASE_URL = `https://github.com/Alphadarklord1/studypilot/releases/tag/${FALLBACK_TAG}`;
const GITHUB_API_LATEST_RELEASE = 'https://api.github.com/repos/Alphadarklord1/studypilot/releases/latest';

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type LatestReleasePayload = {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
};

const MODEL_ASSETS = [
  { name: 'qwen2.5-1.5b-instruct-q4_k_m.gguf', label: 'Mini Model (1.5B)' },
  { name: 'qwen2.5-3b-instruct-q4_k_m.gguf', label: 'Balanced Model (3B)' },
  { name: 'qwen2.5-7b-instruct-q4_k_m.gguf', label: 'Pro Model (7B)' },
];

function getFallbackAssetUrl(tag: string, fileName: string) {
  return `https://github.com/Alphadarklord1/studypilot/releases/download/${tag}/${fileName}`;
}

async function getLatestRelease(): Promise<LatestReleasePayload | null> {
  try {
    const response = await fetch(GITHUB_API_LATEST_RELEASE, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.assets)) return null;
    return payload as LatestReleasePayload;
  } catch {
    return null;
  }
}

function findAsset(assets: ReleaseAsset[], matcher: (asset: ReleaseAsset) => boolean): ReleaseAsset | null {
  return assets.find(matcher) || null;
}

export default async function DownloadsPage() {
  const latestRelease = await getLatestRelease();
  const releaseTag = latestRelease?.tag_name || FALLBACK_TAG;
  const releaseUrl = latestRelease?.html_url || FALLBACK_RELEASE_URL;
  const assets = latestRelease?.assets || [];
  const desktopAsset =
    findAsset(assets, (asset) => asset.name.toLowerCase().endsWith('.dmg')) ||
    findAsset(assets, (asset) => asset.name.toLowerCase().endsWith('.exe')) ||
    findAsset(assets, (asset) => asset.name.toLowerCase().endsWith('.appimage'));
  const manifestAsset = findAsset(assets, (asset) => asset.name === 'model-manifest.json');
  const checksumsAsset = findAsset(assets, (asset) => asset.name === 'SHA256SUMS.txt');

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>Download StudyPilot</h1>
        <p>Desktop builds and optional offline AI models are published through GitHub Releases.</p>

        <div className={styles.section}>
          <h2>Desktop App</h2>
          <div className={styles.downloadList}>
            <a href={releaseUrl} className={`${styles.downloadBtn} ${styles.primary}`} target="_blank" rel="noopener noreferrer">
              Open Release {releaseTag}
            </a>
            {desktopAsset && (
              <a href={desktopAsset.browser_download_url} className={styles.downloadBtn} target="_blank" rel="noopener noreferrer">
                Download Desktop Build ({desktopAsset.name})
              </a>
            )}
            <a href={REPO_RELEASES_URL} className={styles.downloadBtn} target="_blank" rel="noopener noreferrer">
              Browse all releases
            </a>
          </div>
        </div>

        <div className={styles.section}>
          <h2>Offline AI Models</h2>
          <div className={styles.downloadList}>
            {MODEL_ASSETS.map((asset) => {
              const found = findAsset(assets, (item) => item.name === asset.name);
              const url = found?.browser_download_url || getFallbackAssetUrl(releaseTag, asset.name);
              return (
                <a key={asset.name} href={url} className={styles.downloadBtn} target="_blank" rel="noopener noreferrer">
                  {asset.label}
                </a>
              );
            })}
            <a
              href={manifestAsset?.browser_download_url || getFallbackAssetUrl(releaseTag, 'model-manifest.json')}
              className={styles.downloadBtn}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download model-manifest.json
            </a>
            <a
              href={checksumsAsset?.browser_download_url || getFallbackAssetUrl(releaseTag, 'SHA256SUMS.txt')}
              className={styles.downloadBtn}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download SHA256SUMS.txt
            </a>
          </div>
        </div>

        <p className={styles.note}>
          In StudyPilot open Settings → AI Models to install and switch models after publishing release assets.
        </p>
        <p className={styles.note}>
          If a direct asset link fails, open the release page and download assets manually.
        </p>

        <Link href="/" className={styles.backLink}>
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
