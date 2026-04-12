import type { CSSProperties } from 'react';
import Link from 'next/link';
import { getReleaseDownloadData, formatSize } from '@/lib/models/downloads';

function cardStyle(featured = false) {
  return {
    border: `1px solid ${featured ? 'color-mix(in srgb, var(--primary, #6366f1) 30%, var(--border-subtle, #e2e8f0))' : 'var(--border-subtle, #e2e8f0)'}`,
    borderRadius: 18,
    padding: 20,
    background: featured
      ? 'linear-gradient(180deg, color-mix(in srgb, var(--primary, #6366f1) 7%, var(--bg-surface, #fff)), var(--bg-surface, #fff))'
      : 'var(--bg-surface, #fff)',
    boxShadow: featured ? '0 12px 32px rgba(99, 102, 241, 0.08)' : '0 8px 24px rgba(15, 23, 42, 0.05)',
    display: 'grid',
    gap: 12,
  } satisfies CSSProperties;
}

function buttonStyle(primary = false) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    padding: '0 14px',
    borderRadius: 12,
    border: primary ? 'none' : '1px solid var(--border-default, #cbd5e1)',
    background: primary ? 'var(--primary, #6366f1)' : 'var(--bg-surface, #fff)',
    color: primary ? '#fff' : 'var(--text-primary, #0f172a)',
    fontWeight: 700,
    fontSize: '0.9rem',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  } satisfies CSSProperties;
}

export default async function DownloadsPage() {
  const downloads = await getReleaseDownloadData();
  const macReady = Boolean(downloads.macAsset);
  const optionalModelsReady = downloads.manifestLooksReleaseReady;
  const advancedFilesReady = Boolean(downloads.manifestAsset || downloads.checksumsAsset);

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg-base, #f4f6fb)', color: 'var(--text-primary, #0f172a)' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '40px 20px 72px', display: 'grid', gap: 24 }}>
        <section style={{ display: 'grid', gap: 14 }}>
          <span style={{ fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted, #64748b)', fontWeight: 800 }}>
            Kivora Downloads
          </span>
          <div style={{ display: 'grid', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 4vw, 3.2rem)', lineHeight: 1.05 }}>
              Install Kivora once, then add bigger offline models only if you need them.
            </h1>
            <p style={{ margin: 0, maxWidth: 760, color: 'var(--text-secondary, #475569)', fontSize: '1rem', lineHeight: 1.6 }}>
              The easiest setup is still the desktop app with Mini included for offline study. Balanced and Pro stay optional, so students can start fast and only download larger models if they want stronger local quality later.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {macReady ? (
              <a href={downloads.macAsset!.browser_download_url} style={buttonStyle(true)}>
                Download Mac DMG
              </a>
            ) : (
              <a href={downloads.releaseUrl} style={buttonStyle(true)}>
                Open Release Page
              </a>
            )}
            <Link href="/settings#ai-models" style={buttonStyle(false)}>
              Open AI & Downloads
            </Link>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted, #64748b)' }}>
              Release {downloads.releaseTag}
            </span>
          </div>
        </section>

        {!optionalModelsReady ? (
          <section
            style={{
              border: '1px solid rgba(245, 158, 11, 0.35)',
              background: 'rgba(245, 158, 11, 0.09)',
              borderRadius: 18,
              padding: 18,
              display: 'grid',
              gap: 8,
            }}
          >
            <strong style={{ fontSize: '0.95rem' }}>Optional model downloads are still being finalized.</strong>
            <p style={{ margin: 0, color: 'var(--text-secondary, #475569)', lineHeight: 1.55 }}>
              Mini is the safe default today. Larger models should only be shown as ready once Kivora has finished publishing and verifying the download files behind the scenes.
            </p>
          </section>
        ) : null}

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(320px, 0.7fr)', gap: 18 }}>
          <div style={cardStyle(true)}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted, #64748b)', fontWeight: 800 }}>
                  Recommended Desktop Path
                </span>
                <h2 style={{ margin: 0, fontSize: '1.35rem' }}>Mac + bundled Mini</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary, #475569)', lineHeight: 1.55 }}>
                  This is the cleanest Kivora setup: install the app, let Mini handle offline notes, summaries, Scholar Hub file work, and Math support, then add heavier models later only if you want them.
                </p>
              </div>
                <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(34,197,94,0.12)', color: '#15803d', fontSize: '0.76rem', fontWeight: 700 }}>
                  {macReady ? 'Mac asset ready' : 'Waiting on release asset'}
                </span>
              </div>

            <div style={{ display: 'grid', gap: 10 }}>
                {[
                  'Install the Mac app',
                  'Mini is detected automatically inside the desktop app',
                  'Workspace, Scholar Hub file analysis, and Math can run locally',
                  'Balanced and Pro stay optional in-app downloads after install',
                ].map((item, index) => (
                <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ width: 24, height: 24, borderRadius: 999, background: 'color-mix(in srgb, var(--primary, #6366f1) 14%, transparent)', color: 'var(--primary, #6366f1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem', flexShrink: 0 }}>
                    {index + 1}
                  </span>
                  <span style={{ color: 'var(--text-secondary, #475569)', lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={cardStyle(false)}>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted, #64748b)', fontWeight: 800 }}>
              Other Assets
            </span>
            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <strong style={{ display: 'block', marginBottom: 4 }}>Windows</strong>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary, #475569)' }}>
                  Windows uses the same offline model approach, with the installer and portable app available separately.
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {downloads.windowsInstaller ? <a href={downloads.windowsInstaller.browser_download_url} style={buttonStyle(false)}>Windows installer</a> : null}
                {downloads.windowsPortable ? <a href={downloads.windowsPortable.browser_download_url} style={buttonStyle(false)}>Portable EXE</a> : null}
              </div>
              <div>
                <strong style={{ display: 'block', marginBottom: 4 }}>Advanced verification</strong>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary, #475569)' }}>
                  Most students can ignore this. These files only matter if you want to verify the published model package manually.
                </span>
              </div>
              {advancedFilesReady ? (
                <details style={{ border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: 12, padding: 12, background: 'var(--bg-base, #f8fafc)' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Show verification files</summary>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {downloads.manifestAsset ? <a href={downloads.manifestAsset.browser_download_url} style={buttonStyle(false)}>Manifest</a> : null}
                    {downloads.checksumsAsset ? <a href={downloads.checksumsAsset.browser_download_url} style={buttonStyle(false)}>Checksums</a> : null}
                  </div>
                </details>
              ) : null}
            </div>
          </div>
        </section>

        <section style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted, #64748b)', fontWeight: 800 }}>
              Optional AI Model Downloads
            </span>
            <h2 style={{ margin: 0, fontSize: '1.35rem' }}>Download bigger local models when you actually need them.</h2>
            <p style={{ margin: 0, color: 'var(--text-secondary, #475569)', lineHeight: 1.55 }}>
              Mini should be the default experience. Balanced and Pro are for people who want stronger local quality and have the RAM for it.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {downloads.localModels.map((model) => (
              <article key={model.key} style={cardStyle(model.key === 'mini')}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>{model.label}</h3>
                    <p style={{ margin: '6px 0 0', color: 'var(--text-secondary, #475569)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                      {model.summary}
                    </p>
                  </div>
                  <span style={{ padding: '6px 10px', borderRadius: 999, background: model.bundled ? 'rgba(34,197,94,0.12)' : 'var(--bg-inset, #f1f5f9)', color: model.bundled ? '#15803d' : 'var(--text-muted, #64748b)', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {model.bundled ? 'Bundled' : 'Optional'}
                  </span>
                </div>

                <div style={{ display: 'grid', gap: 4, fontSize: '0.84rem', color: 'var(--text-secondary, #475569)' }}>
                  <span>{formatSize(model.sizeBytes)} · {model.fit}</span>
                  <span>{model.quantization}</span>
                  <span>
                    {model.downloadSource === 'release'
                      ? 'Available through Kivora’s published download files.'
                      : model.downloadSource === 'manifest'
                        ? 'Available from Kivora’s external model host.'
                        : 'No download is published yet.'}
                  </span>
                  {model.integrityWarning ? (
                    <span style={{ color: '#b45309' }}>{model.integrityWarning}</span>
                  ) : (
                    <span style={{ color: '#15803d' }}>Verified and ready to use.</span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {model.bundled ? (
                    <Link href="/settings#ai-models" style={buttonStyle(false)}>
                      Included in desktop app
                    </Link>
                  ) : model.downloadUrl ? (
                    <Link href="/settings#ai-models" style={buttonStyle(model.key !== 'mini')}>
                      Install inside Kivora
                    </Link>
                  ) : (
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted, #64748b)' }}>No published download yet</span>
                  )}
                  {!model.bundled && (
                    <a href={model.downloadUrl || downloads.releaseUrl} style={buttonStyle(false)}>
                      View file source
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
