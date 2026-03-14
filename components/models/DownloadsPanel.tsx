import Link from 'next/link';
import type { ReleaseDownloadData } from '@/lib/models/downloads';
import { REPO_RELEASES_URL, formatSize } from '@/lib/models/downloads';
import styles from '@/app/downloads/page.module.css';

export function DownloadsPanel({ data }: { data: ReleaseDownloadData }) {
  const {
    releaseTag,
    releaseUrl,
    macAsset,
    windowsInstaller,
    windowsPortable,
    manifestAsset,
    checksumsAsset,
    localModels,
    hasPublishedModelAssets,
  } = data;

  return (
    <div className={styles.page}>
      <div className={styles.backdrop} />
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Desktop builds + local models</span>
            <h1>Downloads & Releases</h1>
            <p>
              Desktop builds ship through GitHub Releases. Mini is bundled in the desktop app and can also be
              published as a separate download. Balanced and Pro stay optional so users can choose the local model
              that matches their machine.
            </p>
            <div className={styles.heroActions}>
              <a href={releaseUrl} className={styles.primaryLink} target="_blank" rel="noopener noreferrer">
                Open release {releaseTag}
              </a>
              <a href={REPO_RELEASES_URL} className={styles.secondaryLink} target="_blank" rel="noopener noreferrer">
                Browse all releases
              </a>
              <Link href="/models" className={styles.secondaryLink}>
                Back to models
              </Link>
            </div>
          </div>
          <div className={styles.heroCard}>
            <div className={styles.heroStat}><strong>macOS</strong><span>{macAsset ? 'Ready now' : 'Waiting on asset'}</span></div>
            <div className={styles.heroStat}><strong>Windows</strong><span>{windowsInstaller || windowsPortable ? 'Ready now' : 'Waiting on asset'}</span></div>
            <div className={styles.heroStat}><strong>Mini</strong><span>Bundled by default</span></div>
            <div className={styles.heroStat}><strong>Balanced / Pro</strong><span>{hasPublishedModelAssets ? 'Published on release' : 'Optional assets pending'}</span></div>
          </div>
        </header>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.eyebrow}>Installers</span>
            <h2>Desktop downloads</h2>
          </div>
          <div className={styles.downloadGrid}>
            <article className={styles.downloadCard}>
              <div>
                <h3>macOS Apple Silicon</h3>
                <p>Primary desktop target with local model support and offline-first AI.</p>
              </div>
              {macAsset ? (
                <a href={macAsset.browser_download_url} className={styles.primaryLink} target="_blank" rel="noopener noreferrer">
                  Download {macAsset.name}
                </a>
              ) : (
                <div className={styles.unavailable}>The latest release does not include the macOS DMG yet.</div>
              )}
            </article>

            <article className={styles.downloadCard}>
              <div>
                <h3>Windows x64</h3>
                <p>Installer and portable build when both assets are published to the same release.</p>
              </div>
              <div className={styles.cardActions}>
                {windowsInstaller ? (
                  <a href={windowsInstaller.browser_download_url} className={styles.primaryLink} target="_blank" rel="noopener noreferrer">
                    Download installer
                  </a>
                ) : (
                  <div className={styles.unavailable}>The latest release does not include the Windows installer yet.</div>
                )}
                {windowsPortable ? (
                  <a href={windowsPortable.browser_download_url} className={styles.secondaryLink} target="_blank" rel="noopener noreferrer">
                    Download portable EXE
                  </a>
                ) : null}
              </div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.eyebrow}>Optional local AI</span>
            <h2>Choose the model that fits the device</h2>
            <p>
              Mini already ships with the desktop app, and all three models can be published as direct downloads.
              Balanced and Pro stay optional so users can install them later from the installed-models tab or download
              them manually when release assets are published.
            </p>
          </div>
          <div className={styles.modelGrid}>
            {localModels.map((model) => (
              <article key={model.key} className={styles.modelCard}>
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
                  <span>{model.fit}</span>
                </div>
                {model.publishedAsset ? (
                  <a href={model.publishedAsset.browser_download_url} className={styles.primaryLink} target="_blank" rel="noopener noreferrer">
                    Download {model.file}
                  </a>
                ) : (
                  <div className={styles.unavailable}>
                    {model.bundled
                      ? 'Included in the desktop app. No separate download is required.'
                      : 'This model is not attached to the latest release yet.'}
                  </div>
                )}
              </article>
            ))}
          </div>

          <div className={styles.utilityGrid}>
            <article className={styles.utilityCard}>
              <h3>Integrity files</h3>
              <p>Use these if you want to verify release integrity before installing optional models.</p>
              <div className={styles.cardActions}>
                {manifestAsset ? (
                  <a href={manifestAsset.browser_download_url} className={styles.secondaryLink} target="_blank" rel="noopener noreferrer">
                    model-manifest.json
                  </a>
                ) : (
                  <div className={styles.unavailable}>Manifest not attached yet.</div>
                )}
                {checksumsAsset ? (
                  <a href={checksumsAsset.browser_download_url} className={styles.secondaryLink} target="_blank" rel="noopener noreferrer">
                    SHA256SUMS.txt
                  </a>
                ) : (
                  <div className={styles.unavailable}>Checksums not attached yet.</div>
                )}
              </div>
            </article>

            <article className={styles.utilityCardStrong}>
              <h3>Inside the app</h3>
              <p>Use the Installed &amp; Setup tab to switch the active model after installation.</p>
              <ul className={styles.bulletList}>
                <li>Mini is the guaranteed offline fallback.</li>
                <li>Balanced is the default recommendation for 16 GB devices.</li>
                <li>Pro only makes sense on higher-memory machines.</li>
              </ul>
            </article>
          </div>
        </section>

        {!hasPublishedModelAssets && (
          <div className={styles.warningBox}>
            <strong>Optional model assets are not published on the latest release yet.</strong>
            <span>Mini still works inside the desktop build. Balanced and Pro become installable once the `.gguf`, `model-manifest.json`, and `SHA256SUMS.txt` files are attached to the matching release tag.</span>
          </div>
        )}
      </div>
    </div>
  );
}
