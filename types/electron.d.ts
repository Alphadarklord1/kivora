import type { GeneratedContent, ToolMode } from '@/lib/offline/generate';

type DesktopAiErrorCode =
  | 'RUNTIME_UNAVAILABLE'
  | 'RUNTIME_TIMEOUT'
  | 'INVALID_REQUEST'
  | 'OUT_OF_SCOPE';

interface DesktopAiGenerateSuccess {
  ok: true;
  content: GeneratedContent;
}

interface DesktopAiGenerateFailure {
  ok: false;
  errorCode: DesktopAiErrorCode;
  message: string;
  reason?: string;
  suggestionModes?: ToolMode[];
}

interface DesktopAiHealth {
  ok: boolean;
  status: 'ready' | 'starting' | 'unavailable' | 'error';
  provider: 'desktop-local';
  model: string;
  runtimePath?: string;
  modelPath?: string;
  details?: string;
}

interface DesktopAiModelInfo {
  modelId: string;
  modelFile: string;
  quantization: string;
  bundled: boolean;
  runtimeAvailable: boolean;
  runtimePath?: string;
  modelPath?: string;
}

interface DesktopAI {
  generate: (payload: { mode: ToolMode; text: string }) => Promise<DesktopAiGenerateSuccess | DesktopAiGenerateFailure>;
  health: () => Promise<DesktopAiHealth>;
  modelInfo: () => Promise<DesktopAiModelInfo>;
}

interface ElectronAPI {
  getPlatform: () => Promise<string>;
  getAppVersion: () => Promise<string>;
  onMenuAction: (callback: (action: string) => void) => void;
  onThemeChanged: (callback: (isDark: boolean) => void) => void;
  isElectron: boolean;
  desktopAI?: DesktopAI;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
