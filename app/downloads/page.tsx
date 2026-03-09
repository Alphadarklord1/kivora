import Link from 'next/link';
import localManifest from '@/electron/runtime/model-manifest.json';
import styles from './page.module.css';

const REPO_RELEASES_URL = 'https://github.com/Alphadarklord1/studypilot/releases';
const FALLBACK_TAG = process.env.NEXT_PUBLIC_STUDYPILOT_RELEASE_TAG || 'v1.2.0-beta.1';
const FALLBACK_RELEASE_URL = `https://github.com/Alphadarklord1/studypilot/releases/tag/${FALLBACK_TAG}`;
const GITHUB_API_LATEST_RELEASE = 'https://api.github.com/repos/Alphadarklord1/studypilot/releases/latest';

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  size?: number;
};

type LatestReleasePayload = {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
};

type LocalManifestModel = {
  key: string;
  modelId: string;
  quantization: string;
  file: string;
  sizeBytes: number;
  sha256: string;
  minRamGb: number;
  url?: string;
};

const MODEL_COPY: Record<string, { label: string; summary: string; bundled: boolean }> = {
  mini: {
    label: 'Mini Model (1.5B)',
    summary: 'Fastest local model. Best for lighter laptops and immediate offline use.',
    bundled: true,
  },
  balanced: {
    label: 'Balanced Model (3B)',
    summary: 'Better quality for summaries, quizzes, and planning. Good default on 16 GB devices.',
    bundled: false,
  },
  pro: {
    label: 'Pro Model (7B)',
    summary: 'Largest optional local model for stronger quality on capable PCs.',
    bundled: false,
  },
};

function formatSize(bytes: number) {
  if (!bytes) return 'Unknown size';
  return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
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

  const macAsset = findAsset(assets, (asset) => asset.name.toLowerCase().endsWith('.dmg'));
  const windowsInstaller = findAsset(assets, (asset) => asset.name.toLowerCase().includes('setup') && asset.name.toLowerCase().endsWith('.exe'));
  const windowsPortable = findAsset(assets, (asset) => asset.name.toLowerCase().endsWith('.exe') && !asset.name.toLowerCase().includes('setup'));
  const manifestAsset = findAsset(assets, (asset) => asset.name === 'model-manifest.json');
  const checksumsAsset = findAsset(assets, (asset) => asset.name === 'SHA256SUMS.txt');
  const localModels = ((localManifest.models || []) as LocalManifestModel[]).map((model) => {
    const publishedAsset = findAsset(assets, (asset) => asset.name === model.file);
    return {
      ...model,
      label: MODEL_COPY[model.key]?.label || model.modelId,
      summary: MODEL_COPY[model.key]?.summary || 'Offline study model.',
      bundled: MODEL_COPY[model.key]?.bundled ?? false,
      publishedAsset,
    };
  });
  const hasPublishedModelAssets = localModels.some((model) => Boolean(model.publishedAsset));

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>Download StudyHarbor</h1>
        <p>Desktop builds are published through GitHub Releases. Mini is bundled in the desktop app. Larger Qwen offline models are optional downloads when release assets are attached.</p>

        <div className={styles.section}>
          <h2>Desktop App</h2>
          <div className={styles.downloadGrid}>
            <div className={styles.downloadCard}>
              <h3>macOS</h3>
              <p>Apple Silicon DMG installer.</p>
              {macAsset ? (
                <a href={macAsset.browser_download_url} className={`${styles.downloadBtn} ${styles.primary}`} target="_blank" rel="noopener noreferrer">
                  Download {macAsset.name}
                </a>
              ) : (
                <div className={styles.unavailable}>macOS build not attached to the latest release yet.</div>
              )}
            </div>

            <div className={styles.downloadCard}>
              <h3>Windows</h3>
              <p>Installer and portable executable when published.</p>
              <div className={styles.downloadList}>
                {windowsInstaller ? (
                  <a href={windowsInstaller.browser_download_url} className={styles.downloadBtn} target="_blank" rel="noopener noreferrer">
                    Download Installer
                  </a>
                ) : (
                  <div className={styles.unavailable}>Windows installer not attached yet.</div>
                )}
                {windowsPortable ? (
                  <a href={windowsPortable.browser_download_url} className={styles.downloadBtn} target="_blank" rel="noopener noreferrer">
                    Download Portable EXE
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          <div className={styles.releaseLinks}>
            <a href={releaseUrl} className={styles.downloadBtn} target="_blank" rel="noopener noreferrer">
              Open Release {releaseTag}
            </a>
            <a href={REPO_RELEASES_URL} className={styles.downloadBtn} target="_blank" rel="noopener noreferrer">
              Browse all releases
            </a>
          </div>
        </div>

        <div className={styles.section}>
          <h2>Offline AI Models</h2>
          <p className={styles.sectionNote}>Qwen models are optional. StudyHarbor already includes Mini in the desktop app. Install Balanced or Pro later from Settings → AI Models or download them here once published.</p>
          <div className={styles.modelGrid}>
            {localModels.map((model) => (
              <div key={model.key} className={styles.modelCard}>
                <div className={styles.modelHeader}>
                  <div>
                    <h3>{model.label}</h3>
                    <p>{model.summary}</p>
                  </div>
                  <span className={`${styles.modelBadge} ${model.bundled ? styles.bundled : styles.optional}`}>
                    {model.bundled ? 'Bundled' : 'Optional'}
                  </span>
                </div>

                <div className={styles.modelMeta}>
                  <span>{model.modelId}</span>
                  <span>{model.quantization}</span>
                  <span>{formatSize(model.sizeBytes)}</span>
                  <span>{model.minRamGb} GB RAM</span>
                </div>

                {model.publishedAsset ? (
                  <a href={model.publishedAsset.browser_download_url} className={styles.downloadBtn} target="_blank" rel="noopener noreferrer">
                    Download {model.file}
                  </a>
                ) : (
                  <div className={styles.unavailable}>
                    {model.bundled
                      ? 'Included in the desktop app. No separate download needed.'
                      : 'Not attached to the latest release yet.'}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className={styles.downloadList}>
            {manifestAsset ? (
              <a href={manifestAsset.browser_download_url} className={styles.downloadBtn} target="_blank" rel="noopener noreferrer">
                Download model-manifest.json
              </a>
            ) : (
              <div className={styles.unavailable}>model-manifest.json is not attached to the latest release yet.</div>
            )}
            {checksumsAsset ? (
              <a href={checksumsAsset.browser_download_url} className={styles.downloadBtn} target="_blank" rel="noopener noreferrer">
                Download SHA256SUMS.txt
              </a>
            ) : (
              <div className={styles.unavailable}>SHA256SUMS.txt is not attached to the latest release yet.</div>
            )}
          </div>
        </div>

        {!hasPublishedModelAssets && (
          <div className={styles.warningBox}>
            <strong>Offline model assets are not published on the latest release yet.</strong>
            <span>Mini still works inside the desktop app. If you need Balanced or Pro, attach the `.gguf`, `model-manifest.json`, and `SHA256SUMS.txt` assets to the release first.</span>
          </div>
        )}

        <p className={styles.note}>
          In StudyHarbor open Settings → AI Models to install and switch local models after the release assets are published.
        </p>

        <Link href="/" className={styles.backLink}>
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
