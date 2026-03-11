import type { GeneratedContent, RewriteOptions, ToolMode } from '@/lib/offline/generate';

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
  runtimeEngine?: 'llama.cpp' | 'legacy' | 'mock';
  modelPath?: string;
  details?: string;
}

interface DesktopAiModelInfo {
  modelId: string;
  modelFile: string;
  quantization: string;
  bundled: boolean;
  selectedModelKey: string;
  activeModelKey: string | null;
  recommendedModelKey: string;
  deviceProfile: 'laptop' | 'laptop-pc' | 'pc';
  setupCompleted: boolean;
  wizardEnabled: boolean;
  manifestVersion: string | null;
  models: Array<{
    key: string;
    modelId: string;
    modelFile: string;
    quantization: string;
    recommendedFor: 'laptop' | 'laptop-pc' | 'pc';
    minRamGb: number;
    sizeBytes: number;
    sha256: string;
    url?: string;
    bundled: boolean;
    isInstalled: boolean;
    installedSource: 'bundled' | 'userData' | 'none';
    isDownloading: boolean;
    downloadProgress?: DesktopAiDownloadProgress | null;
    modelPath?: string;
  }>;
  runtimeAvailable: boolean;
  runtimeEngine?: 'llama.cpp' | 'legacy' | 'mock';
  runtimePath?: string;
  modelPath?: string;
}

interface DesktopAiModelSwitchResult {
  ok: boolean;
  activeModelKey?: string;
  errorCode?: 'INVALID_REQUEST' | 'MODEL_NOT_INSTALLED' | 'RUNTIME_UNAVAILABLE';
  message?: string;
}

interface DesktopAiListModelsResult {
  manifestVersion: string | null;
  recommendedModelKey: string;
  models: DesktopAiModelInfo['models'];
}

interface DesktopAiSelection {
  selectedModelKey: string;
  activeModelKey: string | null;
  setupCompleted: boolean;
  wizardEnabled: boolean;
  recommendedModelKey: string;
  deviceProfile: 'laptop' | 'laptop-pc' | 'pc';
}

type DesktopAiInstallStatus =
  | 'success'
  | 'already_installed'
  | 'downloading'
  | 'network_error'
  | 'checksum_error'
  | 'disk_error'
  | 'invalid_request';

interface DesktopAiInstallResult {
  ok: boolean;
  status: DesktopAiInstallStatus;
  modelKey?: string;
  message?: string;
}

type DesktopAiRemoveStatus =
  | 'success'
  | 'active_model_blocked'
  | 'not_found'
  | 'disk_error'
  | 'invalid_request';

interface DesktopAiRemoveResult {
  ok: boolean;
  status: DesktopAiRemoveStatus;
  modelKey?: string;
  message?: string;
}

interface DesktopAiDownloadProgress {
  modelKey: string;
  state: 'idle' | 'downloading' | 'completed' | 'error';
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  speedBps: number;
  errorCode?: string;
  message?: string;
}

interface DesktopAiDownloadStatusResult {
  ok: true;
  items: DesktopAiDownloadProgress[];
}

interface DesktopAI {
  generate: (payload: { mode: ToolMode; text: string; rewriteOptions?: RewriteOptions }) => Promise<DesktopAiGenerateSuccess | DesktopAiGenerateFailure>;
  health: () => Promise<DesktopAiHealth>;
  modelInfo: () => Promise<DesktopAiModelInfo>;
  listModels: () => Promise<DesktopAiListModelsResult>;
  getSelection: () => Promise<DesktopAiSelection>;
  setModel: (modelKey: string) => Promise<DesktopAiModelSwitchResult>;
  completeSetup: (payload?: { selectedModelKey?: string }) => Promise<{ ok: boolean }>;
  installModel: (modelKey: string) => Promise<DesktopAiInstallResult>;
  removeModel: (modelKey: string) => Promise<DesktopAiRemoveResult>;
  downloadStatus: () => Promise<DesktopAiDownloadStatusResult>;
  onDownloadProgress: (callback: (payload: DesktopAiDownloadProgress) => void) => () => void;
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
