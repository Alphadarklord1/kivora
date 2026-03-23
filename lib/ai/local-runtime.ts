export const DEFAULT_DESKTOP_LOCAL_MODEL = 'qwen2.5';

export const OFFLINE_READY_FEATURES = [
  'Workspace notes, quizzes, and review-set generation',
  'Math solver help and local study tools',
  'Scholar Hub pasted text or uploaded file analysis',
] as const;

export const INTERNET_REQUIRED_FEATURES = [
  'Scholar Hub topic research across web articles',
  'Source URLs, related reading, and live web lookups',
  'Cloud AI and MyBib / external citation tools',
] as const;

export type DesktopModelInfoLike = {
  selectedModelKey?: string;
  activeModelKey?: string | null;
  runtimeAvailable?: boolean;
  models?: Array<{
    key: string;
    modelId: string;
    bundled: boolean;
    isInstalled: boolean;
    installedSource: 'bundled' | 'userData' | 'none';
  }>;
};

export type LocalRuntimeDescriptor = {
  state: 'checking' | 'ready' | 'missing';
  source: 'desktop-bundled' | 'desktop-user' | 'ollama' | 'none';
  label: string;
  detail: string;
  modelLabel: string | null;
};

export function deriveDesktopLocalRuntimeStatus(info: DesktopModelInfoLike | null | undefined): LocalRuntimeDescriptor {
  if (!info || !Array.isArray(info.models) || info.models.length === 0) {
    return {
      state: 'missing',
      source: 'none',
      label: 'No bundled local model detected',
      detail: 'Desktop downloads should include Mini by default. Until then, Kivora will use Ollama or deterministic offline fallbacks.',
      modelLabel: null,
    };
  }

  const active =
    info.models.find((model) => model.key === info.activeModelKey) ??
    info.models.find((model) => model.key === info.selectedModelKey && model.isInstalled) ??
    info.models.find((model) => model.isInstalled) ??
    null;

  if (!active) {
    return {
      state: 'missing',
      source: 'none',
      label: 'No local model installed',
      detail: 'Mini should be bundled into the desktop app. Until then, only Ollama or deterministic offline fallbacks are available.',
      modelLabel: null,
    };
  }

  if (!info.runtimeAvailable) {
    return {
      state: 'missing',
      source: active.installedSource === 'bundled' ? 'desktop-bundled' : 'desktop-user',
      label: `${active.modelId} is installed`,
      detail: 'The model file is present, but the desktop local runtime binary is missing or unavailable.',
      modelLabel: active.modelId,
    };
  }

  if (active.installedSource === 'bundled') {
    return {
      state: 'ready',
      source: 'desktop-bundled',
      label: `${active.modelId} included`,
      detail: 'A bundled local model is ready, so core Kivora tools can run on-device without internet.',
      modelLabel: active.modelId,
    };
  }

  return {
    state: 'ready',
    source: 'desktop-user',
    label: `${active.modelId} installed`,
    detail: 'An optional local model is installed and ready for on-device generation.',
    modelLabel: active.modelId,
  };
}
