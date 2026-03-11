export type CompatStorageKey = {
  current: string;
  legacy?: string[];
};

export const storageKeys = {
  theme: { current: 'kivora_theme', legacy: ['studypilot_theme'] },
  fontSize: { current: 'kivora_fontSize', legacy: ['studypilot_fontSize'] },
  lineHeight: { current: 'kivora_lineHeight', legacy: ['studypilot_lineHeight'] },
  density: { current: 'kivora_density', legacy: ['studypilot_density'] },
  language: { current: 'kivora_language', legacy: ['studypilot_language'] },
  aiProvider: { current: 'kivora_ai_provider', legacy: ['studypilot_ai_provider'] },
  aiOpenAiModel: { current: 'kivora_ai_openai_model', legacy: ['studypilot_ai_openai_model'] },
  aiCloudFallback: { current: 'kivora_ai_cloud_fallback', legacy: ['studypilot_ai_cloud_fallback'] },
  aiLegacyOllamaModel: { current: 'kivora_ai_ollama_model', legacy: ['studypilot_ai_ollama_model'] },
  aiLegacyOllamaBase: { current: 'kivora_ai_ollama_base', legacy: ['studypilot_ai_ollama_base'] },
  vault: { current: 'kivora_vault', legacy: ['studypilot_vault'] },
  vaultSession: { current: 'kivora_session_key', legacy: ['studypilot_session_key'] },
  compactMode: { current: 'kivora_compact_mode', legacy: ['studypilot_compact_mode'] },
  ttsVoice: { current: 'kivora_tts_voice', legacy: ['studypilot_tts_voice'] },
  ttsRate: { current: 'kivora_tts_rate', legacy: ['studypilot_tts_rate'] },
  ttsPitch: { current: 'kivora_tts_pitch', legacy: ['studypilot_tts_pitch'] },
  timerState: { current: 'kivora-timer-state', legacy: ['studypilot-timer-state'] },
  matlabSession: { current: 'kivora.matlab.session.v1', legacy: ['studypilot.matlab.session.v1'] },
  modelSetupDone: { current: 'kivora_model_setup_done', legacy: ['studypilot_model_setup_done'] },
  localStudyPlans: { current: 'kivora_local_study_plans', legacy: ['studypilot_local_study_plans'] },
  localFolders: { current: 'kivora_local_folders', legacy: ['studypilot_local_folders'] },
  localFiles: { current: 'kivora_local_files', legacy: ['studypilot_local_files'] },
} satisfies Record<string, CompatStorageKey>;

function resolveLegacyKeys(key: CompatStorageKey) {
  return key.legacy ?? [];
}

export function readCompatStorage(storage: Storage, key: CompatStorageKey): string | null {
  const currentValue = storage.getItem(key.current);
  if (currentValue != null) {
    return currentValue;
  }

  for (const legacyKey of resolveLegacyKeys(key)) {
    const legacyValue = storage.getItem(legacyKey);
    if (legacyValue != null) {
      storage.setItem(key.current, legacyValue);
      return legacyValue;
    }
  }

  return null;
}

export function writeCompatStorage(storage: Storage, key: CompatStorageKey, value: string) {
  storage.setItem(key.current, value);
  for (const legacyKey of resolveLegacyKeys(key)) {
    storage.setItem(legacyKey, value);
  }
}

export function removeCompatStorage(storage: Storage, key: CompatStorageKey) {
  storage.removeItem(key.current);
  for (const legacyKey of resolveLegacyKeys(key)) {
    storage.removeItem(legacyKey);
  }
}
