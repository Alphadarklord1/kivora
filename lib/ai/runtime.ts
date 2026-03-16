import { readCompatStorage, storageKeys, writeCompatStorage } from '@/lib/storage/keys';

export type AiMode = 'auto' | 'local' | 'cloud';

export interface AiRuntimePreferences {
  mode: AiMode;
  localModel: string;
  cloudModel: string;
}

export const AI_PREFS_UPDATED_EVENT = 'kivora:ai-preferences-updated';

export const DEFAULT_LOCAL_MODEL = 'mistral';
export const DEFAULT_CLOUD_MODEL = 'gpt-4o-mini';

export const LOCAL_MODEL_OPTIONS = [
  { id: 'mistral', label: 'Mistral 7B', hint: 'Balanced local model for most study tasks' },
  { id: 'qwen2.5', label: 'Qwen2.5 1.5B', hint: 'Fastest option for lighter hardware' },
  { id: 'qwen2.5-math', label: 'Qwen2.5-Math 1.5B', hint: 'Best local choice for school math' },
  { id: 'phi4-mini', label: 'Phi-4 Mini 3.8B', hint: 'Strong STEM reasoning' },
  { id: 'llama3.2:3b', label: 'Llama 3.2 3B', hint: 'Quick all-round local assistant' },
  { id: 'gemma3:4b', label: 'Gemma 3 4B', hint: 'Writing and structured output' },
  { id: 'deepseek-r1:7b', label: 'DeepSeek R1 7B', hint: 'Heavy reasoning on stronger machines' },
  { id: 'mistral:latest', label: 'Mistral Large 24B', hint: 'Highest local quality if hardware allows' },
] as const;

export const CLOUD_MODEL_OPTIONS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', hint: 'Fast and lower cost cloud default' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', hint: 'Stronger cloud reasoning with quick responses' },
  { id: 'gpt-4.1', label: 'GPT-4.1', hint: 'Best cloud quality for hard study tasks' },
] as const;

export function normalizeAiMode(value: string | null | undefined): AiMode {
  switch (value) {
    case 'local':
    case 'desktop-local':
    case 'ollama':
    case 'offline':
      return 'local';
    case 'cloud':
    case 'openai':
      return 'cloud';
    case 'auto':
      return 'auto';
    default:
      return 'auto';
  }
}

function normalizeModel(value: string | null | undefined, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function getDefaultAiRuntimePreferences(): AiRuntimePreferences {
  return {
    mode: 'auto',
    localModel: DEFAULT_LOCAL_MODEL,
    cloudModel: DEFAULT_CLOUD_MODEL,
  };
}

export function loadAiRuntimePreferences(): AiRuntimePreferences {
  const defaults = getDefaultAiRuntimePreferences();
  if (typeof window === 'undefined') return defaults;

  return {
    mode: normalizeAiMode(readCompatStorage(localStorage, storageKeys.aiProvider)),
    localModel: normalizeModel(readCompatStorage(localStorage, storageKeys.aiLegacyOllamaModel), defaults.localModel),
    cloudModel: normalizeModel(readCompatStorage(localStorage, storageKeys.aiOpenAiModel), defaults.cloudModel),
  };
}

export function saveAiRuntimePreferences(prefs: AiRuntimePreferences) {
  if (typeof window === 'undefined') return;

  writeCompatStorage(localStorage, storageKeys.aiProvider, prefs.mode);
  writeCompatStorage(localStorage, storageKeys.aiLegacyOllamaModel, prefs.localModel);
  writeCompatStorage(localStorage, storageKeys.aiOpenAiModel, prefs.cloudModel);
  writeCompatStorage(localStorage, storageKeys.aiCloudFallback, String(prefs.mode === 'auto'));

  window.dispatchEvent(new CustomEvent(AI_PREFS_UPDATED_EVENT, { detail: prefs }));
}

export type AiRuntimeRequestPreferences = {
  mode: AiMode;
  localModel: string;
  cloudModel: string;
};

export function resolveAiRuntimeRequest(body: Record<string, unknown>): AiRuntimeRequestPreferences {
  const defaults = getDefaultAiRuntimePreferences();
  const rawAi = body.ai;
  const ai = rawAi && typeof rawAi === 'object' ? rawAi as Record<string, unknown> : {};

  return {
    mode: normalizeAiMode(typeof ai.mode === 'string' ? ai.mode : null),
    localModel: normalizeModel(
      typeof ai.localModel === 'string' ? ai.localModel : typeof body.model === 'string' ? body.model : null,
      defaults.localModel,
    ),
    cloudModel: normalizeModel(typeof ai.cloudModel === 'string' ? ai.cloudModel : null, defaults.cloudModel),
  };
}
