import { readCompatStorage, storageKeys, writeCompatStorage } from '@/lib/storage/keys';

export type AiMode = 'auto' | 'local' | 'cloud';

export interface AiRuntimePreferences {
  mode: AiMode;
  localModel: string;
  cloudModel: string;
}

export const AI_PREFS_UPDATED_EVENT = 'kivora:ai-preferences-updated';

export const DEFAULT_LOCAL_MODEL  = 'mistral';
export const DEFAULT_CLOUD_MODEL  = 'openai/gpt-oss-20b';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

// ── Local (Ollama) models ─────────────────────────────────────────────────────
export const LOCAL_MODEL_OPTIONS = [
  { id: 'mistral',         label: 'Mistral 7B',          hint: 'Balanced local model for most study tasks' },
  { id: 'qwen2.5',         label: 'Qwen2.5 1.5B',        hint: 'Fastest option for lighter hardware' },
  { id: 'qwen2.5-math',    label: 'Qwen2.5-Math 1.5B',   hint: 'Best local choice for school math' },
  { id: 'phi4-mini',       label: 'Phi-4 Mini 3.8B',     hint: 'Strong STEM reasoning' },
  { id: 'llama3.2:3b',     label: 'Llama 3.2 3B',        hint: 'Quick all-round local assistant' },
  { id: 'gemma3:4b',       label: 'Gemma 3 4B',          hint: 'Writing and structured output' },
  { id: 'deepseek-r1:7b',  label: 'DeepSeek R1 7B',      hint: 'Heavy reasoning on stronger machines' },
  { id: 'mistral:latest',  label: 'Mistral Large 24B',   hint: 'Highest local quality if hardware allows' },
] as const;

// ── Cloud models (Groq, Grok/xAI, OpenAI) ─────────────────────────────────────
export const CLOUD_MODEL_OPTIONS = [
  { id: 'openai/gpt-oss-20b', label: 'Groq GPT-OSS 20B', hint: 'Strong hosted reasoning on Groq', provider: 'groq' as const },
  { id: 'llama-3.1-8b-instant', label: 'Groq Llama 3.1 8B', hint: 'Fastest hosted option for quick study tasks', provider: 'groq' as const },
  // ── Grok (xAI) — primary provider ──────────────────────────────────────────
  { id: 'grok-3-fast',  label: 'Grok 3 Fast',   hint: 'Best balance of speed and quality — recommended', provider: 'grok' as const },
  { id: 'grok-3',       label: 'Grok 3',         hint: 'Maximum capability for complex study tasks',      provider: 'grok' as const },
  { id: 'grok-3-mini',  label: 'Grok 3 Mini',   hint: 'Compact model, great for quick tasks',             provider: 'grok' as const },
  { id: 'grok-2',       label: 'Grok 2',         hint: 'Previous generation — fast and reliable',         provider: 'grok' as const },
  // ── OpenAI — secondary / backup ────────────────────────────────────────────
  { id: 'gpt-4o-mini',  label: 'GPT-4o mini',   hint: 'OpenAI backup — fast and lower cost',             provider: 'openai' as const },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini',  hint: 'OpenAI backup — stronger reasoning',              provider: 'openai' as const },
  { id: 'gpt-4.1',      label: 'GPT-4.1',        hint: 'OpenAI backup — highest quality',                 provider: 'openai' as const },
] as const;

export type CloudProvider = 'groq' | 'grok' | 'openai';

/** Determine which provider a model ID belongs to */
export function cloudProviderForModel(modelId: string): CloudProvider {
  const configured = CLOUD_MODEL_OPTIONS.find((option) => option.id === modelId)?.provider;
  if (configured) return configured;
  if (modelId.startsWith('grok')) return 'grok';
  if (modelId.startsWith('gpt-')) return 'openai';
  return 'groq';
}

export function normalizeAiMode(value: string | null | undefined): AiMode {
  switch (value) {
    case 'local':
    case 'desktop-local':
    case 'ollama':
    case 'offline':
      return 'local';
    case 'cloud':
    case 'groq':
    case 'openai':
    case 'grok':
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
