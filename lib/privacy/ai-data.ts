export type AiDataMode = 'full' | 'metadata-only' | 'offline';

const DEFAULT_MODE: AiDataMode = 'full';

export function normalizeAiDataMode(value: unknown): AiDataMode {
  return value === 'metadata-only' || value === 'offline' || value === 'full'
    ? value
    : DEFAULT_MODE;
}

export function resolveAiDataMode(body: Record<string, unknown>): AiDataMode {
  return normalizeAiDataMode(body.privacyMode);
}

export function loadClientAiDataMode(): AiDataMode {
  if (typeof window === 'undefined') return DEFAULT_MODE;
  return normalizeAiDataMode(window.localStorage.getItem('kivora_ai_mode'));
}

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function buildMetadataOnlyPlaceholder(text: string, label = 'selected content') {
  return `[Content withheld for privacy. Source: ${label}. Length: ${wordCount(text).toLocaleString()} words. Generate output from metadata only.]`;
}

export function redactForAi(mode: AiDataMode, text: string, label?: string) {
  return mode === 'metadata-only' ? buildMetadataOnlyPlaceholder(text, label) : text;
}

export function cloudAccessAllowed(mode: AiDataMode) {
  return mode !== 'offline';
}
