import type { GeneratedContent, ToolMode } from '@/lib/offline/generate';

export type AiProvider = 'auto' | 'openai' | 'ollama' | 'offline';

export interface AiPreferences {
  provider: AiProvider;
  openaiModel: string;
  ollamaModel: string;
  ollamaBaseUrl: string;
}

const DEFAULT_PREFS: AiPreferences = {
  provider: 'auto',
  openaiModel: 'gpt-4o',
  ollamaModel: 'llama3:8b',
  ollamaBaseUrl: 'http://localhost:11434',
};

export function loadAiPreferences(): AiPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  return {
    provider: (localStorage.getItem('studypilot_ai_provider') as AiProvider) || DEFAULT_PREFS.provider,
    openaiModel: localStorage.getItem('studypilot_ai_openai_model') || DEFAULT_PREFS.openaiModel,
    ollamaModel: localStorage.getItem('studypilot_ai_ollama_model') || DEFAULT_PREFS.ollamaModel,
    ollamaBaseUrl: localStorage.getItem('studypilot_ai_ollama_base') || DEFAULT_PREFS.ollamaBaseUrl,
  };
}

export function saveAiPreferences(prefs: AiPreferences) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('studypilot_ai_provider', prefs.provider);
  localStorage.setItem('studypilot_ai_openai_model', prefs.openaiModel);
  localStorage.setItem('studypilot_ai_ollama_model', prefs.ollamaModel);
  localStorage.setItem('studypilot_ai_ollama_base', prefs.ollamaBaseUrl);
}

async function requestAi(
  provider: 'openai' | 'ollama',
  model: string,
  text: string,
  mode: ToolMode,
  prefs: AiPreferences
) {
  const res = await fetch('/api/llm/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      provider,
      model,
      text,
      mode,
      ollamaBaseUrl: provider === 'ollama' ? prefs.ollamaBaseUrl : undefined,
    }),
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || 'AI generation failed');
  }

  return (await res.json()) as { content: GeneratedContent };
}

export async function generateAiContent(
  text: string,
  mode: ToolMode,
  prefs: AiPreferences
): Promise<GeneratedContent | null> {
  if (!text.trim()) return null;

  const provider = prefs.provider;
  if (provider === 'offline') return null;

  const tryOpenAi = () => requestAi('openai', prefs.openaiModel, text, mode, prefs);
  const tryOllama = () => requestAi('ollama', prefs.ollamaModel, text, mode, prefs);

  try {
    if (provider === 'openai') {
      const data = await tryOpenAi();
      return data.content;
    }
    if (provider === 'ollama') {
      const data = await tryOllama();
      return data.content;
    }
    // auto
    try {
      const data = await tryOpenAi();
      return data.content;
    } catch {
      const data = await tryOllama();
      return data.content;
    }
  } catch {
    return null;
  }
}
