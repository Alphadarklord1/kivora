import {
  getGeneratedContent,
  type GeneratedContent,
  type RewriteOptions,
  type ToolMode,
} from '@/lib/offline/generate';
import {
  evaluateAiScope,
  type AiScopeBlocked,
  type AiScopeErrorCode,
} from '@/lib/ai/policy';
import { isElectronRenderer } from '@/lib/runtime/mode';
import { readCompatStorage, removeCompatStorage, storageKeys, writeCompatStorage } from '@/lib/storage/keys';

export type AiProvider = 'desktop-local' | 'openai' | 'offline';

export interface AiPreferences {
  provider: AiProvider;
  openaiModel: string;
  enableCloudFallback: boolean;
}

export type AiGenerationSuccess = {
  status: 'success';
  provider: AiProvider;
  content: GeneratedContent;
  fallbackUsed: boolean;
  reason?: string;
  primaryProvider?: Exclude<AiProvider, 'offline'>;
};

export type AiGenerationPolicyBlock = {
  status: 'policy_block';
  errorCode: AiScopeErrorCode;
  reason: string;
  suggestionModes: ToolMode[];
};

export type AiGenerationRuntimeError = {
  status: 'runtime_error';
  provider: AiProvider;
  message: string;
  details?: string;
};

export type AiGenerationResult =
  | AiGenerationSuccess
  | AiGenerationPolicyBlock
  | AiGenerationRuntimeError;

const OPEN_SOURCE_PREFERRED_MODES = new Set<ToolMode>(['summarize', 'rephrase']);

function getDefaultProvider(): AiProvider {
  return isElectronRenderer() ? 'desktop-local' : 'openai';
}

const DEFAULT_PREFS: AiPreferences = {
  provider: getDefaultProvider(),
  openaiModel: 'gpt-4o-mini',
  enableCloudFallback: false,
};

function normalizeProvider(value: string | null): AiProvider {
  if (value === 'desktop-local' || value === 'openai' || value === 'offline') {
    return value;
  }

  // Legacy migration from old preferences.
  if (value === 'auto' || value === 'ollama') {
    return isElectronRenderer() ? 'desktop-local' : 'openai';
  }

  return getDefaultProvider();
}

function normalizeBoolean(value: string | null, fallback = false): boolean {
  if (value == null) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

export function loadAiPreferences(): AiPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFS;

  return {
    provider: normalizeProvider(readCompatStorage(localStorage, storageKeys.aiProvider)),
    openaiModel: readCompatStorage(localStorage, storageKeys.aiOpenAiModel) || DEFAULT_PREFS.openaiModel,
    enableCloudFallback: normalizeBoolean(readCompatStorage(localStorage, storageKeys.aiCloudFallback), DEFAULT_PREFS.enableCloudFallback),
  };
}

export function saveAiPreferences(prefs: AiPreferences) {
  if (typeof window === 'undefined') return;
  writeCompatStorage(localStorage, storageKeys.aiProvider, prefs.provider);
  writeCompatStorage(localStorage, storageKeys.aiOpenAiModel, prefs.openaiModel);
  writeCompatStorage(localStorage, storageKeys.aiCloudFallback, String(prefs.enableCloudFallback));

  // Cleanup legacy keys to keep stored state consistent.
  removeCompatStorage(localStorage, storageKeys.aiLegacyOllamaModel);
  removeCompatStorage(localStorage, storageKeys.aiLegacyOllamaBase);
}

function toPolicyBlock(decision: AiScopeBlocked): AiGenerationPolicyBlock {
  return {
    status: 'policy_block',
    errorCode: decision.errorCode,
    reason: decision.reason,
    suggestionModes: decision.suggestionModes,
  };
}

async function parseJsonOrText(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    const text = await res.text();
    return { error: text };
  }
}

async function requestOpenAI(
  model: string,
  text: string,
  mode: ToolMode,
  rewriteOptions?: RewriteOptions
): Promise<AiGenerationResult> {
  try {
    const res = await fetch('/api/llm/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        provider: 'openai',
        model,
        text,
        mode,
        rewriteOptions,
      }),
    });

    const payload = await parseJsonOrText(res);
    if (!res.ok) {
      if (res.status === 422) {
        return {
          status: 'policy_block',
          errorCode: (payload.errorCode as AiScopeErrorCode) || 'OUT_OF_SCOPE',
          reason: String(payload.reason || payload.error || 'Out-of-scope request'),
          suggestionModes: Array.isArray(payload.suggestionModes)
            ? (payload.suggestionModes as ToolMode[])
            : ['summarize', 'notes', 'quiz'],
        };
      }

      return {
        status: 'runtime_error',
        provider: 'openai',
        message: String(payload.error || payload.reason || 'OpenAI generation failed'),
        details: `HTTP ${res.status}`,
      };
    }

    const content = payload.content as GeneratedContent | undefined;
    if (!content || typeof content.displayText !== 'string') {
      return {
        status: 'runtime_error',
        provider: 'openai',
        message: 'OpenAI returned invalid content',
      };
    }

    return {
      status: 'success',
      provider: 'openai',
      content,
      fallbackUsed: Boolean(payload.fallback),
      reason: typeof payload.reason === 'string' ? payload.reason : undefined,
    };
  } catch (error) {
    return {
      status: 'runtime_error',
      provider: 'openai',
      message: 'OpenAI request failed',
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

async function requestDesktopLocal(
  text: string,
  mode: ToolMode,
  rewriteOptions?: RewriteOptions
): Promise<AiGenerationResult> {
  if (typeof window === 'undefined' || !window.electronAPI?.desktopAI) {
    return {
      status: 'runtime_error',
      provider: 'desktop-local',
      message: 'Desktop AI runtime is not available',
      details: 'Electron desktop bridge is missing',
    };
  }

  try {
    const result = await window.electronAPI.desktopAI.generate({ mode, text, rewriteOptions });
    if (result.ok) {
      return {
        status: 'success',
        provider: 'desktop-local',
        content: result.content,
        fallbackUsed: false,
      };
    }

    if (result.errorCode === 'OUT_OF_SCOPE') {
      return {
        status: 'policy_block',
        errorCode: 'OUT_OF_SCOPE',
        reason: result.reason || result.message,
        suggestionModes: result.suggestionModes || ['summarize', 'notes', 'quiz'],
      };
    }

    return {
      status: 'runtime_error',
      provider: 'desktop-local',
      message: result.message,
      details: result.errorCode,
    };
  } catch (error) {
    return {
      status: 'runtime_error',
      provider: 'desktop-local',
      message: 'Desktop AI request failed',
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function generateAiContent(
  text: string,
  mode: ToolMode,
  prefs: AiPreferences,
  rewriteOptions?: RewriteOptions
): Promise<AiGenerationResult> {
  const scopeDecision = evaluateAiScope({ mode, text, source: 'workspace' });
  if (!scopeDecision.allowed) {
    return toPolicyBlock(scopeDecision);
  }

  const preferDesktopOpenSource = isElectronRenderer() && OPEN_SOURCE_PREFERRED_MODES.has(mode);

  if (preferDesktopOpenSource) {
    const localResult = await requestDesktopLocal(text, mode, rewriteOptions);
    if (localResult.status === 'success' || localResult.status === 'policy_block') {
      return localResult;
    }

    if (prefs.provider === 'openai' || prefs.enableCloudFallback) {
      const cloudResult = await requestOpenAI(prefs.openaiModel, text, mode, rewriteOptions);
      if (cloudResult.status === 'success' || cloudResult.status === 'policy_block') {
        return cloudResult.status === 'success'
          ? {
              ...cloudResult,
              fallbackUsed: true,
              reason: localResult.message,
              primaryProvider: 'desktop-local',
            }
          : cloudResult;
      }
    }

    return {
      status: 'success',
      provider: 'offline',
      content: getGeneratedContent(mode, text, rewriteOptions),
      fallbackUsed: true,
      reason: localResult.message || 'Desktop open-source model unavailable',
      primaryProvider: 'desktop-local',
    };
  }

  if (prefs.provider === 'offline') {
    return {
      status: 'success',
      provider: 'offline',
      content: getGeneratedContent(mode, text, rewriteOptions),
      fallbackUsed: true,
      reason: 'AI provider is set to offline deterministic mode',
      primaryProvider: 'openai',
    };
  }

  if (prefs.provider === 'openai') {
    const cloudResult = await requestOpenAI(prefs.openaiModel, text, mode, rewriteOptions);
    if (cloudResult.status === 'success' || cloudResult.status === 'policy_block') {
      return cloudResult;
    }

    return {
      status: 'success',
      provider: 'offline',
      content: getGeneratedContent(mode, text, rewriteOptions),
      fallbackUsed: true,
      reason: cloudResult.message,
      primaryProvider: 'openai',
    };
  }

  const localResult = await requestDesktopLocal(text, mode, rewriteOptions);
  if (localResult.status === 'success' || localResult.status === 'policy_block') {
    return localResult;
  }

  if (prefs.enableCloudFallback) {
    const cloudResult = await requestOpenAI(prefs.openaiModel, text, mode, rewriteOptions);
    if (cloudResult.status === 'success' || cloudResult.status === 'policy_block') {
      return cloudResult;
    }

    return {
      status: 'success',
      provider: 'offline',
      content: getGeneratedContent(mode, text, rewriteOptions),
      fallbackUsed: true,
      reason: cloudResult.message || localResult.message,
      primaryProvider: 'desktop-local',
    };
  }

  return {
    status: 'success',
    provider: 'offline',
    content: getGeneratedContent(mode, text, rewriteOptions),
    fallbackUsed: true,
    reason: localResult.message,
    primaryProvider: 'desktop-local',
  };
}
