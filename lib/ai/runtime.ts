import { readCompatStorage, storageKeys, writeCompatStorage } from '@/lib/storage/keys';

export type AiMode = 'auto' | 'local' | 'cloud';

export interface AiRuntimePreferences {
  mode: AiMode;
  localModel: string;
  cloudModel: string;
}

export const AI_PREFS_UPDATED_EVENT = 'kivora:ai-preferences-updated';

export const DEFAULT_LOCAL_MODEL  = 'qwen2.5';
export const DEFAULT_CLOUD_MODEL  = 'grok-3-fast';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

// ── Local (Ollama / offline) models — Qwen is default ────────────────────────
export const LOCAL_MODEL_OPTIONS = [
  { id: 'qwen2.5',         label: 'Qwen 2.5 7B',         hint: 'Default offline model — balanced for most study tasks' },
  { id: 'qwen2.5:1.5b',    label: 'Qwen 2.5 1.5B',       hint: 'Fastest Qwen option for lighter hardware' },
  { id: 'qwen2.5-math',    label: 'Qwen 2.5 Math 7B',    hint: 'Best local model for school math and STEM' },
  { id: 'qwen2.5-coder',   label: 'Qwen 2.5 Coder 7B',   hint: 'Code explanation and technical study' },
  { id: 'phi4-mini',       label: 'Phi-4 Mini 3.8B',     hint: 'Strong STEM reasoning on lighter hardware' },
  { id: 'llama3.2:3b',     label: 'Llama 3.2 3B',        hint: 'Fast all-round local assistant' },
  { id: 'mistral',         label: 'Mistral 7B',          hint: 'Reliable general local model' },
  { id: 'deepseek-r1:7b',  label: 'DeepSeek R1 7B',      hint: 'Heavy reasoning on stronger machines' },
] as const;

// ── Cloud models — Grok is primary, OpenAI is fallback ─────────────────────
export const CLOUD_MODEL_OPTIONS = [
  // ── Grok (xAI) — primary ───────────────────────────────────────────────────
  { id: 'grok-3-fast',      label: 'Grok 3 Fast',      hint: 'Best online model — recommended for most study tasks', provider: 'grok' as const },
  { id: 'grok-3-mini',      label: 'Grok 3 Mini',      hint: 'Compact and quick for lighter cloud usage',            provider: 'grok' as const },
  { id: 'grok-3-mini-fast', label: 'Grok 3 Mini Fast', hint: 'Fastest xAI option for quick study help',              provider: 'grok' as const },
  // ── OpenAI — fallback ──────────────────────────────────────────────────────
  { id: 'gpt-4o-mini',      label: 'GPT-4o mini',      hint: 'OpenAI fallback — fast and lower cost',                provider: 'openai' as const },
  { id: 'gpt-4o',           label: 'GPT-4o',           hint: 'OpenAI fallback — broader multimodal support',         provider: 'openai' as const },
  { id: 'gpt-4.1-mini',     label: 'GPT-4.1 mini',     hint: 'OpenAI fallback — stronger reasoning',                 provider: 'openai' as const },
] as const;

export type CloudProvider = 'grok' | 'openai';

/** Determine which provider a model ID belongs to */
export function cloudProviderForModel(modelId: string): CloudProvider {
  const configured = CLOUD_MODEL_OPTIONS.find((option) => option.id === modelId)?.provider;
  if (configured) return configured;
  if (modelId.startsWith('grok')) return 'grok';
  if (modelId.startsWith('gpt-')) return 'openai';
  return 'grok';
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
