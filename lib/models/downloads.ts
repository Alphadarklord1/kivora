import localManifest from '@/electron/runtime/model-manifest.json';

export const REPO_RELEASES_URL = 'https://github.com/Alphadarklord1/kivora/releases';
export const FALLBACK_TAG = process.env.NEXT_PUBLIC_KIVORA_RELEASE_TAG || 'v1.0.0';
export const FALLBACK_RELEASE_URL = `https://github.com/Alphadarklord1/kivora/releases/tag/${FALLBACK_TAG}`;
export const GITHUB_API_LATEST_RELEASE = 'https://api.github.com/repos/Alphadarklord1/kivora/releases/latest';

export type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  size?: number;
};

export type LatestReleasePayload = {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
};

export type LocalManifestModel = {
  key: string;
  modelId: string;
  quantization: string;
  file: string;
  sizeBytes: number;
  sha256: string;
  minRamGb: number;
  url?: string;
};

export const MODEL_COPY: Record<string, { label: string; summary: string; bundled: boolean; fit: string }> = {
  mini: {
    label: 'Mini Model',
    summary: 'Bundled in the Mac 1.0 desktop path for immediate offline use on lighter hardware.',
    bundled: true,
    fit: '8 GB RAM',
  },
  balanced: {
    label: 'Balanced Model',
    summary: 'Optional post-install download for stronger summaries, quizzes, and study planning on mainstream laptops.',
    bundled: false,
    fit: '16 GB RAM',
  },
  pro: {
    label: 'Pro Model',
    summary: 'Largest optional post-install model for users who want better quality on higher-memory machines.',
    bundled: false,
    fit: '24 GB RAM',
  },
};

export function formatSize(bytes: number) {
  if (!bytes) return 'Unknown size';
  return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
}

export async function getLatestRelease(): Promise<LatestReleasePayload | null> {
  try {
    const response = await fetch(GITHUB_API_LATEST_RELEASE, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.assets)) return null;
    return payload as LatestReleasePayload;
  } catch {
    return null;
  }
}

export function findAsset(assets: ReleaseAsset[], matcher: (asset: ReleaseAsset) => boolean): ReleaseAsset | null {
  return assets.find(matcher) || null;
}

export async function getReleaseDownloadData() {
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
    const copy = MODEL_COPY[model.key];
    const bundled = copy?.bundled ?? false;
    return {
      ...model,
      label: copy?.label || model.modelId,
      summary: copy?.summary || 'Offline study model.',
      bundled,
      fit: copy?.fit || `${model.minRamGb} GB RAM`,
      publishedAsset,
      downloadUrl: publishedAsset?.browser_download_url || model.url || null,
      downloadSource: publishedAsset ? 'release' : model.url ? 'manifest' : bundled ? 'bundled' : 'missing',
      integrityWarning: model.sha256 && model.sizeBytes > 0 ? null : 'Missing verification metadata.',
    };
  });
  const manifestLooksReleaseReady = Boolean(manifestAsset && checksumsAsset) && localModels.every((model) => {
    const hasVerifiedMetadata = Boolean(model.sha256 && model.sizeBytes > 0);
    if (!hasVerifiedMetadata) return false;
    if (model.bundled) return true;
    return Boolean(model.publishedAsset || model.url);
  });

  return {
    releaseTag,
    releaseUrl,
    assets,
    macAsset,
    windowsInstaller,
    windowsPortable,
    manifestAsset,
    checksumsAsset,
    localModels,
    hasPublishedModelAssets: localModels.some((model) => Boolean(model.publishedAsset)),
    manifestLooksReleaseReady,
  };
}

export type ReleaseDownloadData = Awaited<ReturnType<typeof getReleaseDownloadData>>;
