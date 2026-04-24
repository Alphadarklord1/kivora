const { app, BrowserWindow, Menu, shell, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const os = require('os');
const crypto = require('crypto');
const { once } = require('events');
const { spawn } = require('child_process');

const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

const DESKTOP_AI = {
  startupTimeoutMs: 25000,
  requestTimeoutMs: 45000,
  maxRestartAttempts: 4,
  manifestFetchTimeoutMs: 8000,
  manifestRetryMs: 5 * 60 * 1000,
};

const DESKTOP_AI_SYSTEM_PROMPT = `You are Kivora's offline local study model.
Stay strictly inside academic study and study-planning tasks.
Return valid JSON only.
Use this shape:
{
  "mode": string,
  "displayText": string,
  "questions": [],
  "flashcards": [],
  "sourceText": string,
  "keyTopics": string[],
  "subjectArea": "science"|"humanities"|"social-science"|"business"|"technical"|"general",
  "learningObjectives": string[],
  "rewriteMeta": { "tone": "formal"|"informal"|"academic"|"professional"|"energetic"|"concise", "customInstruction": string }
}`;

const DESKTOP_AI_MODE_GUIDANCE = {
  assignment: 'Provide a structured academic response with clear steps and deliverables.',
  summarize: 'Provide an actually useful study summary with: 1) a two-sentence overview, 2) key concepts, 3) critical details or formulas, and 4) a short review checklist. Stay grounded in the source text.',
  mcq: 'Create 6 to 10 multiple-choice questions with answers based only on the source text.',
  quiz: 'Create 6 to 10 short study questions with concise answers.',
  notes: 'Produce study notes with headings, bullets, and key concepts.',
  math: 'Explain the math solution clearly and provide the final answer.',
  flashcards: 'Create 8 to 12 flashcards with direct front/back pairs.',
  essay: 'Provide an essay outline, thesis, and core arguments.',
  planner: 'Create a realistic study plan with actionable time blocks.',
  rephrase: 'Rewrite the text so it reads naturally and intelligently. Preserve meaning, facts, names, numbers, and technical terms. Improve clarity, flow, and structure while applying the requested tone.',
};

const DESKTOP_AI_RUNTIME_CANDIDATES = process.platform === 'win32'
  ? [
      { engine: 'llama.cpp', protocol: 'openai', binaryName: 'llama-server.exe' },
      { engine: 'legacy', protocol: 'legacy', binaryName: 'studypilot-ai.exe' },
    ]
  : [
      { engine: 'llama.cpp', protocol: 'openai', binaryName: 'llama-server' },
      { engine: 'legacy', protocol: 'legacy', binaryName: 'studypilot-ai' },
    ];

const DESKTOP_AI_MODELS = [
  {
    key: 'mini',
    modelId: 'Qwen2.5-1.5B-Instruct',
    modelFile: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    quantization: 'Q4_K_M',
    recommendedFor: 'laptop',
    minRamGb: 8,
  },
  {
    key: 'balanced',
    modelId: 'Qwen2.5-3B-Instruct',
    modelFile: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    quantization: 'Q4_K_M',
    recommendedFor: 'laptop-pc',
    minRamGb: 16,
  },
  {
    key: 'pro',
    modelId: 'Qwen2.5-7B-Instruct',
    modelFile: 'qwen2.5-7b-instruct-q4_k_m.gguf',
    quantization: 'Q4_K_M',
    recommendedFor: 'pc',
    minRamGb: 24,
  },
];

const DEFAULT_MODEL_KEY = 'mini';
const MODEL_MANIFEST_FILENAME = 'model-manifest.json';
const MODEL_RELEASE_REPO = process.env.KIVORA_MODEL_REPO || process.env.KIVORA_MODEL_REPO || 'Alphadarklord1/kivora';
const MODEL_WIZARD_ENABLED = (process.env.KIVORA_MODEL_WIZARD || process.env.KIVORA_MODEL_WIZARD || '1') !== '0';
const DOWNLOAD_EVENT = 'desktop-ai-download-progress';
const DOWNLOAD_STATE_IDLE = 'idle';

const SUPPORTED_TOOL_MODES = new Set([
  'assignment',
  'summarize',
  'mcq',
  'quiz',
  'notes',
  'math',
  'flashcards',
  'essay',
  'planner',
  'rephrase',
]);

let mainWindow;
let appServerProcess = null;
let appServerUrl = null;

const APP_SERVER = {
  startupTimeoutMs: 45000,
};
const DEFAULT_DESKTOP_AUTH_PORT = 3893;

let desktopAiState = {
  process: null,
  port: null,
  runtimePath: null,
  runtimeEngine: null,
  runtimeProtocol: null,
  modelPath: null,
  activeModelKey: null,
  startPromise: null,
  ready: false,
  lastError: null,
  restartAttempts: 0,
  manualStop: false,
};

let desktopAiConfigCache = null;
let localManifestCache = null;
let remoteManifestCache = null;
let remoteManifestLastAttemptAt = 0;
const modelDownloadState = new Map();
const modelDownloadLocks = new Map();

function getPlatformArchTag() {
  return `${process.platform}-${process.arch}`;
}

function getRuntimeBinaryBasePath() {
  const platformTag = getPlatformArchTag();
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin', platformTag)
    : path.join(__dirname, 'runtime', 'bin', platformTag);
}

function resolveDesktopAiRuntime() {
  const runtimeBasePath = getRuntimeBinaryBasePath();

  for (const candidate of DESKTOP_AI_RUNTIME_CANDIDATES) {
    const runtimePath = path.join(runtimeBasePath, candidate.binaryName);
    if (fs.existsSync(runtimePath)) {
      return {
        ...candidate,
        runtimePath,
        command: runtimePath,
      };
    }
  }

  const mockRuntimePath = getMockRuntimePath();
  if (!app.isPackaged && fs.existsSync(mockRuntimePath)) {
    return {
      engine: 'mock',
      protocol: 'legacy',
      runtimePath: mockRuntimePath,
      command: process.execPath,
    };
  }

  return null;
}

function getBundledModelPath(modelFile) {
  const relativeParts = ['models', modelFile];
  return app.isPackaged
    ? path.join(process.resourcesPath, ...relativeParts)
    : path.join(__dirname, 'runtime', ...relativeParts);
}

function getUserModelDir() {
  return path.join(app.getPath('userData'), 'models');
}

function getUserModelPath(modelFile) {
  return path.join(getUserModelDir(), modelFile);
}

function getDesktopAiConfigPath() {
  return path.join(app.getPath('userData'), 'desktop-ai-config.json');
}

function getLocalManifestPath() {
  return app.isPackaged
    ? path.join(__dirname, 'runtime', MODEL_MANIFEST_FILENAME)
    : path.join(__dirname, 'runtime', MODEL_MANIFEST_FILENAME);
}

function getReleaseAssetUrl(fileName, version = app.getVersion()) {
  return `https://github.com/${MODEL_RELEASE_REPO}/releases/download/v${version}/${fileName}`;
}

function getMockRuntimePath() {
  return path.join(__dirname, 'runtime', 'mock-ai-runtime.js');
}

function getPreferredRuntimePath() {
  return resolveDesktopAiRuntime()?.runtimePath;
}

function getDefaultDesktopAiConfig() {
  return {
    selectedModelKey: DEFAULT_MODEL_KEY,
    setupCompleted: false,
    lastManifestVersion: null,
  };
}

function ensureModelKey(value) {
  return DESKTOP_AI_MODELS.some((model) => model.key === value) ? value : DEFAULT_MODEL_KEY;
}

function readDesktopAiConfig() {
  const fallback = getDefaultDesktopAiConfig();
  const configPath = getDesktopAiConfigPath();

  try {
    if (!fs.existsSync(configPath)) {
      return fallback;
    }

    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);

    return {
      selectedModelKey: ensureModelKey(parsed?.selectedModelKey),
      setupCompleted: Boolean(parsed?.setupCompleted),
      lastManifestVersion: typeof parsed?.lastManifestVersion === 'string' ? parsed.lastManifestVersion : null,
    };
  } catch {
    return fallback;
  }
}

function getDesktopAiConfig() {
  if (!desktopAiConfigCache) {
    desktopAiConfigCache = readDesktopAiConfig();
  }
  return desktopAiConfigCache;
}

function saveDesktopAiConfig(config) {
  const normalized = {
    ...getDefaultDesktopAiConfig(),
    ...config,
    selectedModelKey: ensureModelKey(config?.selectedModelKey),
  };
  const configPath = getDesktopAiConfigPath();
  const configDir = path.dirname(configPath);
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  desktopAiConfigCache = normalized;
  return normalized;
}

function patchDesktopAiConfig(partial) {
  const current = getDesktopAiConfig();
  return saveDesktopAiConfig({ ...current, ...partial });
}

function getDefaultManifest(version = app.getVersion()) {
  return {
    version,
    generatedAt: new Date().toISOString(),
    models: DESKTOP_AI_MODELS.map((model) => ({
      key: model.key,
      modelId: model.modelId,
      quantization: model.quantization,
      file: model.modelFile,
      sizeBytes: 0,
      sha256: '',
      minRamGb: model.minRamGb,
      url: getReleaseAssetUrl(model.modelFile, version),
    })),
  };
}

function normalizeManifest(raw, fallbackVersion = app.getVersion()) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.models)) {
    return null;
  }

  const models = raw.models
    .filter((entry) => entry && typeof entry === 'object' && typeof entry.key === 'string')
    .map((entry) => ({
      key: ensureModelKey(entry.key),
      modelId: typeof entry.modelId === 'string' ? entry.modelId : '',
      quantization: typeof entry.quantization === 'string' ? entry.quantization : '',
      file: typeof entry.file === 'string' ? entry.file : '',
      sizeBytes: Number.isFinite(entry.sizeBytes) ? Number(entry.sizeBytes) : 0,
      sha256: typeof entry.sha256 === 'string' ? entry.sha256.toLowerCase() : '',
      minRamGb: Number.isFinite(entry.minRamGb) ? Number(entry.minRamGb) : undefined,
      url: typeof entry.url === 'string' ? entry.url : undefined,
    }))
    .filter((entry) => entry.file.length > 0);

  if (!models.length) return null;

  return {
    version: typeof raw.version === 'string' ? raw.version : fallbackVersion,
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : undefined,
    models,
  };
}

function getLocalManifest() {
  if (localManifestCache) return localManifestCache;

  const localPath = getLocalManifestPath();
  try {
    if (fs.existsSync(localPath)) {
      const parsed = JSON.parse(fs.readFileSync(localPath, 'utf8'));
      const normalized = normalizeManifest(parsed);
      if (normalized) {
        localManifestCache = normalized;
        return normalized;
      }
    }
  } catch {
    // fallback below
  }

  localManifestCache = getDefaultManifest();
  return localManifestCache;
}

async function getRemoteManifest(forceRefresh = false) {
  if (!forceRefresh && remoteManifestCache) {
    return remoteManifestCache;
  }
  if (!forceRefresh && Date.now() - remoteManifestLastAttemptAt < DESKTOP_AI.manifestRetryMs) {
    return null;
  }

  const manifestUrl = getReleaseAssetUrl(MODEL_MANIFEST_FILENAME);
  remoteManifestLastAttemptAt = Date.now();
  try {
    const { response, data } = await fetchJson(manifestUrl, {}, DESKTOP_AI.manifestFetchTimeoutMs);
    if (!response.ok) return null;
    const normalized = normalizeManifest(data);
    if (!normalized) return null;
    remoteManifestCache = normalized;
    patchDesktopAiConfig({ lastManifestVersion: normalized.version || null });
    return normalized;
  } catch {
    return null;
  }
}

async function getPreferredManifest(options = {}) {
  const { allowRemote = true, forceRemote = false } = options;
  if (forceRemote) {
    const refreshed = await getRemoteManifest(true);
    if (refreshed) return refreshed;
  }
  if (allowRemote) {
    const remote = await getRemoteManifest(false);
    if (remote) return remote;
  }
  return getLocalManifest();
}

function getModelCatalog(manifest = getLocalManifest()) {
  const manifestMap = new Map((manifest?.models || []).map((item) => [item.key, item]));
  return DESKTOP_AI_MODELS.map((base) => {
    const meta = manifestMap.get(base.key) || {};
    const modelFile = meta.file || base.modelFile;
    const bundledPath = getBundledModelPath(modelFile);
    const userPath = getUserModelPath(modelFile);
    const userExists = fs.existsSync(userPath);
    const bundledExists = fs.existsSync(bundledPath);
    const installedSource = userExists ? 'userData' : (bundledExists ? 'bundled' : 'none');

    return {
      key: base.key,
      modelId: meta.modelId || base.modelId,
      modelFile,
      quantization: meta.quantization || base.quantization,
      recommendedFor: base.recommendedFor,
      minRamGb: Number.isFinite(meta.minRamGb) ? Number(meta.minRamGb) : base.minRamGb,
      sizeBytes: Number.isFinite(meta.sizeBytes) ? Number(meta.sizeBytes) : 0,
      sha256: typeof meta.sha256 === 'string' ? meta.sha256.toLowerCase() : '',
      url: typeof meta.url === 'string' && meta.url.length > 0 ? meta.url : getReleaseAssetUrl(modelFile),
      bundledPath,
      userPath,
      bundled: bundledExists,
      isInstalled: installedSource !== 'none',
      installedSource,
      modelPath: installedSource === 'userData' ? userPath : (installedSource === 'bundled' ? bundledPath : null),
      isDownloading: modelDownloadLocks.has(base.key),
      downloadProgress: modelDownloadState.get(base.key) || null,
    };
  });
}

function getSelectedModelKey() {
  return desktopAiState.activeModelKey || getDesktopAiConfig().selectedModelKey || DEFAULT_MODEL_KEY;
}

function emitDownloadEvent(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(DOWNLOAD_EVENT, payload);
}

function setDownloadProgress(modelKey, patch) {
  const current = modelDownloadState.get(modelKey) || {
    modelKey,
    state: DOWNLOAD_STATE_IDLE,
    downloadedBytes: 0,
    totalBytes: 0,
    percent: 0,
    speedBps: 0,
  };
  const next = { ...current, ...patch, modelKey };
  modelDownloadState.set(modelKey, next);
  emitDownloadEvent(next);
  return next;
}

function clearDownloadProgress(modelKey) {
  modelDownloadState.delete(modelKey);
}

function getDeviceProfile() {
  const totalMemoryGb = os.totalmem() / (1024 ** 3);
  if (totalMemoryGb <= 12) return 'laptop';
  if (totalMemoryGb <= 24) return 'laptop-pc';
  return 'pc';
}

function getRecommendedModelKey() {
  const forcedModelKey = process.env.KIVORA_AI_MODEL_KEY;
  if (forcedModelKey && DESKTOP_AI_MODELS.some((model) => model.key === forcedModelKey)) {
    return forcedModelKey;
  }

  const profile = getDeviceProfile();
  if (profile === 'laptop') return 'mini';
  if (profile === 'laptop-pc') return 'balanced';
  return 'pro';
}

function resolveActiveModel(models = getModelCatalog()) {
  const recommendedModelKey = getRecommendedModelKey();
  const selectedModelKey = getSelectedModelKey();

  const selectedUserData = models.find((model) => model.key === selectedModelKey && model.installedSource === 'userData');
  if (selectedUserData) {
    return selectedUserData;
  }

  const selectedBundled = models.find((model) => model.key === selectedModelKey && model.installedSource === 'bundled');
  if (selectedBundled) {
    return selectedBundled;
  }

  const recommendedBundled = models.find((model) => model.key === recommendedModelKey && model.installedSource === 'bundled');
  if (recommendedBundled) {
    return recommendedBundled;
  }

  const fallbackBundled = models.find((model) => model.installedSource === 'bundled');
  if (fallbackBundled) {
    return fallbackBundled;
  }

  const fallbackInstalled = models.find((model) => model.isInstalled);
  if (fallbackInstalled) {
    return fallbackInstalled;
  }

  return null;
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to get free port'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function fetchJson(url, options = {}, timeoutMs = DESKTOP_AI.requestTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchResponse(url, options = {}, timeoutMs = DESKTOP_AI.requestTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractJsonObject(text) {
  const source = String(text || '').trim();
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return source.slice(start, end + 1);
}

function sanitizeStringList(value, limit = 12) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const output = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    output.push(trimmed);
    if (output.length >= limit) break;
  }
  return output;
}

function inferSubjectArea(text) {
  const source = String(text || '').toLowerCase();
  if (/\b(function|algorithm|database|network|protocol|equation|integral|matrix|derivative)\b/.test(source)) return 'technical';
  if (/\b(market|finance|revenue|profit|strategy|management)\b/.test(source)) return 'business';
  if (/\b(philosophy|history|literature|ethics|theme|narrative)\b/.test(source)) return 'humanities';
  if (/\b(psychology|society|economics|behavior|culture|political)\b/.test(source)) return 'social-science';
  if (/\b(experiment|molecule|cell|physics|chemistry|biology|reaction)\b/.test(source)) return 'science';
  return 'general';
}

function inferKeyTopics(sourceText) {
  const matches = String(sourceText || '').match(/\b[A-Za-z][A-Za-z0-9-]{3,}\b/g) || [];
  const skip = new Set(['this', 'that', 'with', 'from', 'into', 'your', 'their', 'about', 'have', 'will', 'they', 'them', 'then', 'study', 'notes', 'quiz']);
  const counts = new Map();
  for (const word of matches) {
    const normalized = word.toLowerCase();
    if (skip.has(normalized)) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
}

function buildDesktopGeneratedContent(mode, text, displayText, rewriteOptions, parsed = {}) {
  return {
    mode,
    displayText: String(displayText || '').trim(),
    questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    flashcards: Array.isArray(parsed.flashcards) ? parsed.flashcards : [],
    sourceText: typeof parsed.sourceText === 'string' ? parsed.sourceText : text,
    keyTopics: sanitizeStringList(parsed.keyTopics).length > 0 ? sanitizeStringList(parsed.keyTopics) : inferKeyTopics(text),
    subjectArea: typeof parsed.subjectArea === 'string' ? parsed.subjectArea : inferSubjectArea(text),
    learningObjectives: sanitizeStringList(parsed.learningObjectives).length > 0
      ? sanitizeStringList(parsed.learningObjectives)
      : ['Review source material', 'Practice key concepts'],
    ...(mode === 'rephrase'
      ? {
          rewriteMeta: {
            tone: rewriteOptions?.tone || 'professional',
            ...(rewriteOptions?.customInstruction ? { customInstruction: rewriteOptions.customInstruction } : {}),
          },
        }
      : {}),
  };
}

function buildDesktopPrompt(mode, text, rewriteOptions) {
  const guidance = DESKTOP_AI_MODE_GUIDANCE[mode] || 'Generate helpful study material.';
  const rewriteLine = mode === 'rephrase'
    ? `Rewrite options: ${JSON.stringify(rewriteOptions || { tone: 'professional' })}`
    : '';
  const outputHints = mode === 'summarize'
    ? 'For summarize mode, prefer short section headers and compact bullet points when that improves readability.'
    : mode === 'rephrase'
      ? 'For rephrase mode, return one strong final rewrite only. Do not explain your changes.'
      : '';
  return `Mode: ${mode}
Guidance: ${guidance}
${rewriteLine}
${outputHints}

Source text:
${text}`;
}

async function isLlamaRuntimeHealthy(port) {
  try {
    const response = await fetchResponse(`http://127.0.0.1:${port}/health`, {}, 3000);
    if (response.ok) return true;
  } catch {
    // keep probing
  }

  try {
    const { response, data } = await fetchJson(`http://127.0.0.1:${port}/v1/models`, {}, 3000);
    return response.ok && Array.isArray(data?.data);
  } catch {
    return false;
  }
}

async function requestLegacyDesktopGeneration(port, mode, text, rewriteOptions) {
  const { response, data } = await fetchJson(
    `http://127.0.0.1:${port}/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, text, rewriteOptions }),
    },
    DESKTOP_AI.requestTimeoutMs
  );

  if (!response.ok) {
    return {
      ok: false,
      errorCode: data.errorCode || 'RUNTIME_UNAVAILABLE',
      message: data.message || data.error || `Desktop AI runtime returned ${response.status}`,
      reason: data.reason,
      suggestionModes: data.suggestionModes,
    };
  }

  if (!data.content || typeof data.content.displayText !== 'string') {
    return {
      ok: false,
      errorCode: 'RUNTIME_UNAVAILABLE',
      message: 'Desktop AI runtime returned invalid content',
    };
  }

  return {
    ok: true,
    content: data.content,
  };
}

async function requestLlamaDesktopGeneration(port, mode, text, rewriteOptions, modelPath) {
  const llamaModel = path.basename(modelPath || '') || 'local-model';
  const response = await fetchResponse(
    `http://127.0.0.1:${port}/v1/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: llamaModel,
        temperature: 0.3,
        messages: [
          { role: 'system', content: DESKTOP_AI_SYSTEM_PROMPT },
          { role: 'user', content: buildDesktopPrompt(mode, text, rewriteOptions) },
        ],
      }),
    },
    DESKTOP_AI.requestTimeoutMs
  );

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    return {
      ok: false,
      errorCode: data.errorCode || 'RUNTIME_UNAVAILABLE',
      message: data.error?.message || data.message || `Desktop AI runtime returned ${response.status}`,
    };
  }

  const rawContent = data?.choices?.[0]?.message?.content;
  const contentText = Array.isArray(rawContent)
    ? rawContent.map((part) => part?.text || '').join('\n').trim()
    : String(rawContent || '').trim();

  if (!contentText) {
    return {
      ok: false,
      errorCode: 'RUNTIME_UNAVAILABLE',
      message: 'Desktop AI runtime returned empty content',
    };
  }

  const jsonText = extractJsonObject(contentText);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const displayText = typeof parsed.displayText === 'string' ? parsed.displayText : contentText;
      return {
        ok: true,
        content: buildDesktopGeneratedContent(mode, text, displayText, rewriteOptions, parsed),
      };
    } catch {
      // fall through to plain-text coercion
    }
  }

  return {
    ok: true,
    content: buildDesktopGeneratedContent(mode, text, contentText, rewriteOptions),
  };
}

async function isRuntimeHealthy() {
  if (!desktopAiState.port) return false;
  if (desktopAiState.runtimeProtocol === 'openai') {
    return isLlamaRuntimeHealthy(desktopAiState.port);
  }
  try {
    const { response, data } = await fetchJson(`http://127.0.0.1:${desktopAiState.port}/health`, {}, 3000);
    return response.ok && !!data.ok;
  } catch {
    return false;
  }
}

async function waitForRuntimeReady(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const healthy = await isRuntimeHealthy();
    if (healthy) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

function clearDesktopAiState() {
  desktopAiState.ready = false;
  desktopAiState.startPromise = null;
  desktopAiState.port = null;
  desktopAiState.runtimePath = null;
  desktopAiState.runtimeEngine = null;
  desktopAiState.runtimeProtocol = null;
  desktopAiState.modelPath = null;
}

function stopDesktopAiRuntime() {
  desktopAiState.manualStop = true;
  if (desktopAiState.process && !desktopAiState.process.killed) {
    desktopAiState.process.kill();
  }
  desktopAiState.process = null;
  clearDesktopAiState();
}

function classifyInstallError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'MODEL_MANIFEST_MISSING') {
    return {
      errorCode: 'checksum_error',
      message: 'Release model metadata is unavailable. Mini remains available offline.',
    };
  }
  if (code === 'MODEL_ASSET_NOT_FOUND') {
    return {
      errorCode: 'network_error',
      message: 'Model asset was not found for this release (404). Mini remains available offline.',
    };
  }
  if (code === 'MODEL_DOWNLOAD_FAILED') {
    return {
      errorCode: 'network_error',
      message: 'Model download failed from release assets. Mini remains available offline.',
    };
  }
  if (message.toLowerCase().includes('abort')) {
    return { errorCode: 'network_error', message: 'Download interrupted. Mini remains available offline.' };
  }
  if (['ENOSPC', 'EACCES', 'EPERM', 'EROFS'].includes(code)) {
    return { errorCode: 'disk_error', message: 'Failed to write model file to disk. Mini remains available offline.' };
  }
  if (message.toLowerCase().includes('checksum')) {
    return { errorCode: 'checksum_error', message: 'Model integrity check failed (checksum mismatch). Mini remains available offline.' };
  }
  return { errorCode: 'network_error', message: message || 'Model download failed. Mini remains available offline.' };
}

function getDownloadStatusSnapshot() {
  return Array.from(modelDownloadState.values());
}

async function installDesktopModel(modelKey) {
  if (modelDownloadLocks.has(modelKey)) {
    return { status: 'downloading', modelKey };
  }

  const manifest = await getPreferredManifest({ forceRemote: true });
  if (!manifest || !Array.isArray(manifest.models) || !manifest.models.length) {
    return {
      status: 'checksum_error',
      message: 'Release model metadata is unavailable. Mini remains available offline.',
      modelKey,
    };
  }
  const model = getModelCatalog(manifest).find((entry) => entry.key === modelKey);
  if (!model) {
    return { status: 'invalid_request', message: `Unknown model key: ${modelKey}` };
  }
  if (model.installedSource === 'userData') {
    return { status: 'already_installed', modelKey };
  }
  if (!model.url) {
    return { status: 'network_error', message: 'Model URL missing in manifest', modelKey };
  }
  if (!model.sha256) {
    return {
      status: 'checksum_error',
      message: 'Release model metadata is incomplete (missing checksum). Mini remains available offline.',
      modelKey,
    };
  }

  const lock = {};
  modelDownloadLocks.set(modelKey, lock);
  const startedAt = Date.now();
  setDownloadProgress(modelKey, {
    state: 'downloading',
    downloadedBytes: 0,
    totalBytes: model.sizeBytes || 0,
    percent: 0,
    speedBps: 0,
    errorCode: undefined,
    message: undefined,
  });

  const modelDir = getUserModelDir();
  const targetPath = getUserModelPath(model.modelFile);
  const tempPath = `${targetPath}.download`;
  let writer;

  try {
    fs.mkdirSync(modelDir, { recursive: true });
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });

    const response = await fetch(model.url);
    if (!response.ok || !response.body) {
      const downloadError = new Error(`Failed to download model (${response.status})`);
      downloadError.code = response.status === 404 ? 'MODEL_ASSET_NOT_FOUND' : 'MODEL_DOWNLOAD_FAILED';
      throw downloadError;
    }

    const totalHeader = Number(response.headers.get('content-length') || 0);
    const totalBytes = totalHeader > 0 ? totalHeader : (model.sizeBytes || 0);
    const hash = crypto.createHash('sha256');
    const reader = response.body.getReader();
    writer = fs.createWriteStream(tempPath, { flags: 'w' });
    let downloadedBytes = 0;
    let lastTick = Date.now();
    let lastDownloaded = 0;

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk = Buffer.from(value);
      hash.update(chunk);
      downloadedBytes += chunk.length;
      if (!writer.write(chunk)) {
        // eslint-disable-next-line no-await-in-loop
        await once(writer, 'drain');
      }

      const now = Date.now();
      if (now - lastTick >= 200) {
        const speedBps = ((downloadedBytes - lastDownloaded) / Math.max(1, now - lastTick)) * 1000;
        const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
        setDownloadProgress(modelKey, {
          state: 'downloading',
          downloadedBytes,
          totalBytes,
          percent,
          speedBps: Math.round(speedBps),
        });
        lastTick = now;
        lastDownloaded = downloadedBytes;
      }
    }

    await new Promise((resolve, reject) => {
      writer.end((error) => (error ? reject(error) : resolve()));
    });

    const digest = hash.digest('hex').toLowerCase();
    if (model.sha256 && model.sha256 !== digest) {
      throw new Error('checksum mismatch');
    }

    fs.renameSync(tempPath, targetPath);
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    const size = fs.statSync(targetPath).size;
    setDownloadProgress(modelKey, {
      state: 'completed',
      downloadedBytes: size,
      totalBytes: size,
      percent: 100,
      speedBps: Math.round((size / elapsedMs) * 1000),
    });
    setTimeout(() => clearDownloadProgress(modelKey), 2500);

    return { status: 'success', modelKey };
  } catch (error) {
    if (writer) {
      try { writer.destroy(); } catch {}
    }
    if (fs.existsSync(tempPath)) {
      try { fs.rmSync(tempPath, { force: true }); } catch {}
    }
    const mapped = classifyInstallError(error);
    setDownloadProgress(modelKey, {
      state: 'error',
      errorCode: mapped.errorCode,
      message: mapped.message,
    });
    return {
      status: mapped.errorCode,
      message: mapped.message,
      modelKey,
    };
  } finally {
    modelDownloadLocks.delete(modelKey);
  }
}

function removeDesktopModel(modelKey) {
  const model = getModelCatalog().find((entry) => entry.key === modelKey);
  if (!model || model.installedSource !== 'userData') {
    return { status: 'not_found', modelKey };
  }

  const selected = getSelectedModelKey();
  if (selected === modelKey) {
    return { status: 'active_model_blocked', modelKey };
  }

  try {
    fs.rmSync(model.userPath, { force: true });
    return { status: 'success', modelKey };
  } catch {
    return { status: 'disk_error', modelKey, message: 'Unable to remove model file from disk' };
  }
}

async function startDesktopAiRuntime() {
  if (desktopAiState.startPromise) return desktopAiState.startPromise;

  desktopAiState.startPromise = (async () => {
    const selectedModel = resolveActiveModel();
    const runtimeSpec = resolveDesktopAiRuntime();

    if (!runtimeSpec) {
      desktopAiState.lastError = 'Desktop AI runtime binary is missing';
      clearDesktopAiState();
      return;
    }

    if (!selectedModel || !selectedModel.modelPath) {
      desktopAiState.lastError = 'No installed desktop model found';
      clearDesktopAiState();
      return;
    }

    const { modelPath } = selectedModel;

    const port = await getFreePort();
    const args = runtimeSpec.engine === 'mock'
      ? [runtimeSpec.runtimePath, '--host', '127.0.0.1', '--port', String(port), '--model', modelPath]
      : ['--host', '127.0.0.1', '--port', String(port), '--model', modelPath];

    desktopAiState.manualStop = false;
    desktopAiState.activeModelKey = selectedModel.key;
    patchDesktopAiConfig({ selectedModelKey: selectedModel.key });
    desktopAiState.modelPath = modelPath;
    desktopAiState.runtimePath = runtimeSpec.runtimePath;
    desktopAiState.runtimeEngine = runtimeSpec.engine;
    desktopAiState.runtimeProtocol = runtimeSpec.protocol;
    desktopAiState.port = port;

    const child = spawn(runtimeSpec.command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        KIVORA_AI_MODEL: modelPath,
        KIVORA_AI_PORT: String(port),
      },
    });

    desktopAiState.process = child;

    child.stdout?.on('data', (chunk) => {
      const line = String(chunk || '').trim();
      if (line) {
        console.log(`[desktop-ai] ${line}`);
      }
    });

    child.stderr?.on('data', (chunk) => {
      const line = String(chunk || '').trim();
      if (line) {
        console.warn(`[desktop-ai] ${line}`);
      }
    });

    child.on('exit', (code, signal) => {
      const wasManualStop = desktopAiState.manualStop;
      const exitLabel = `Desktop AI runtime exited (code=${code}, signal=${signal || 'none'})`;
      if (!wasManualStop) {
        desktopAiState.lastError = exitLabel;
      }

      desktopAiState.process = null;
      desktopAiState.ready = false;
      desktopAiState.startPromise = null;

      if (wasManualStop) return;

      if (desktopAiState.restartAttempts >= DESKTOP_AI.maxRestartAttempts) {
        desktopAiState.lastError = `${exitLabel} - max restart attempts reached`;
        return;
      }

      desktopAiState.restartAttempts += 1;
      const backoffMs = 1000 * desktopAiState.restartAttempts;
      setTimeout(() => {
        void startDesktopAiRuntime().catch((error) => {
          desktopAiState.lastError = error instanceof Error ? error.message : String(error);
        });
      }, backoffMs);
    });

    const healthy = await withTimeout(
      waitForRuntimeReady(DESKTOP_AI.startupTimeoutMs),
      DESKTOP_AI.startupTimeoutMs + 1000,
      'Desktop AI runtime startup timed out'
    );

    if (!healthy) {
      desktopAiState.lastError = 'Desktop AI runtime failed health checks';
      stopDesktopAiRuntime();
      return;
    }

    desktopAiState.ready = true;
    desktopAiState.restartAttempts = 0;
    desktopAiState.lastError = null;
  })();

  await desktopAiState.startPromise;
}

async function ensureDesktopAiRuntime() {
  if (desktopAiState.ready && desktopAiState.port) {
    const healthy = await isRuntimeHealthy();
    if (healthy) return { ok: true };
  }

  await startDesktopAiRuntime();
  const healthy = await isRuntimeHealthy();
  if (healthy) {
    desktopAiState.ready = true;
    return { ok: true };
  }

  return {
    ok: false,
    error: desktopAiState.lastError || 'Desktop AI runtime unavailable',
  };
}

function stopAppServer() {
  if (appServerProcess && !appServerProcess.killed) {
    appServerProcess.kill();
  }
  appServerProcess = null;
  appServerUrl = null;
}

function parseDesktopAuthPort(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return DEFAULT_DESKTOP_AUTH_PORT;
  }
  return parsed;
}

function isGuestModeFromEnv() {
  const authRequired = String(process.env.AUTH_REQUIRED || '').toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(authRequired)) {
    return false;
  }
  const guestOverride = String(process.env.AUTH_GUEST_MODE || '').toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(guestOverride)) {
    return false;
  }
  if (['1', 'true', 'yes', 'on'].includes(guestOverride)) {
    return true;
  }
  return true;
}

function checkPortAvailability(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

function spawnAppServer(port, oauthDisabledReason = null) {
  const serverUrl = `http://127.0.0.1:${port}`;
  const nextCliPath = path.join(__dirname, '../node_modules/next/dist/bin/next');
  const appRoot = path.join(__dirname, '..');
  const desktopAuthPort = parseDesktopAuthPort(process.env.KIVORA_DESKTOP_AUTH_PORT);

  appServerProcess = spawn(process.execPath, [nextCliPath, 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      KIVORA_DESKTOP_ONLY: process.env.KIVORA_DESKTOP_ONLY || '1',
      AUTH_GUEST_MODE: process.env.AUTH_GUEST_MODE || '1',
      KIVORA_DESKTOP_AUTH_PORT: String(desktopAuthPort),
      KIVORA_OAUTH_DISABLED: oauthDisabledReason ? '1' : '0',
      KIVORA_OAUTH_DISABLED_REASON: oauthDisabledReason || '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  appServerProcess.stdout?.on('data', (chunk) => {
    const line = String(chunk || '').trim();
    if (line) console.log(`[app-server] ${line}`);
  });
  appServerProcess.stderr?.on('data', (chunk) => {
    const line = String(chunk || '').trim();
    if (line) console.warn(`[app-server] ${line}`);
  });
  appServerProcess.on('exit', (code, signal) => {
    console.warn(`[app-server] exited code=${code} signal=${signal || 'none'}`);
    appServerProcess = null;
    appServerUrl = null;
  });

  return serverUrl;
}

async function waitForServerUrl(url, timeoutMs = APP_SERVER.startupTimeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(url, { method: 'GET' });
      if (response.ok || response.status < 500) return true;
    } catch {
      // keep trying
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

async function ensureAppServerUrl() {
  if (isDev) return 'http://localhost:3000';
  if (appServerUrl) return appServerUrl;

  const desktopAuthPort = parseDesktopAuthPort(process.env.KIVORA_DESKTOP_AUTH_PORT);
  const allowRandomFallback = process.env.KIVORA_ALLOW_RANDOM_AUTH_PORT_FALLBACK === '1' || isGuestModeFromEnv();
  let launchPort = desktopAuthPort;
  let oauthDisabledReason = null;

  const fixedPortAvailable = await checkPortAvailability(desktopAuthPort);
  if (!fixedPortAvailable) {
    const reason = `OAuth disabled in desktop mode because required callback port 127.0.0.1:${desktopAuthPort} is already in use.`;
    if (!allowRandomFallback) {
      console.error(`[auth] ${reason}`);
      throw new Error(reason);
    }
    launchPort = await getFreePort();
    oauthDisabledReason = reason;
    console.warn(`[auth] ${reason} Falling back to ${launchPort} with guest-safe mode.`);
  }

  let serverUrl = spawnAppServer(launchPort, oauthDisabledReason);
  let ready = await waitForServerUrl(serverUrl);

  if (!ready && launchPort === desktopAuthPort && allowRandomFallback) {
    const reason = `OAuth disabled in desktop mode because callback port 127.0.0.1:${desktopAuthPort} could not be started.`;
    stopAppServer();
    launchPort = await getFreePort();
    oauthDisabledReason = reason;
    console.warn(`[auth] ${reason} Falling back to ${launchPort} with guest-safe mode.`);
    serverUrl = spawnAppServer(launchPort, oauthDisabledReason);
    ready = await waitForServerUrl(serverUrl);
  }

  if (!ready) {
    stopAppServer();
    throw new Error('Kivora app server failed to start');
  }

  appServerUrl = serverUrl;
  return appServerUrl;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#09090b' : '#fafafa',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../public/icons/icon.png'),
    show: false,
  });

  // Load the app
  const startUrl = await ensureAppServerUrl();

  await mainWindow.loadURL(startUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create menu
function createMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Folder',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow?.webContents.send('menu-action', 'new-folder');
          },
        },
        { type: 'separator' },
        {
          label: 'Export Data',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow?.webContents.send('menu-action', 'export');
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Go',
      submenu: [
        {
          label: 'Workspace',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            mainWindow?.webContents.send('menu-action', 'go-workspace');
          },
        },
        {
          label: 'Tools',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            mainWindow?.webContents.send('menu-action', 'go-tools');
          },
        },
        {
          label: 'Library',
          accelerator: 'CmdOrCtrl+3',
          click: () => {
            mainWindow?.webContents.send('menu-action', 'go-library');
          },
        },
        {
          label: 'Sharing',
          accelerator: 'CmdOrCtrl+4',
          click: () => {
            mainWindow?.webContents.send('menu-action', 'go-sharing');
          },
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow?.webContents.send('menu-action', 'go-settings');
          },
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
              { type: 'separator' },
              { role: 'window' },
            ]
          : [{ role: 'close' }]),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Desktop Guide',
          click: async () => {
            await shell.openExternal('https://github.com/Alphadarklord1/kivora#desktop');
          },
        },
        {
          label: 'Report Issue',
          click: async () => {
            await shell.openExternal('https://github.com/Alphadarklord1/kivora/issues');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App events
app.whenReady().then(() => {
  const config = getDesktopAiConfig();
  desktopAiState.activeModelKey = ensureModelKey(config.selectedModelKey);

  createWindow().catch((error) => {
    console.error('Failed to create main window:', error);
    app.quit();
  });
  createMenu();

  // Lazy warmup desktop AI runtime in the background.
  setTimeout(() => {
    void startDesktopAiRuntime().catch((error) => {
      desktopAiState.lastError = error instanceof Error ? error.message : String(error);
    });
  }, 1200);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((error) => {
        console.error('Failed to recreate main window:', error);
      });
    }
  });
});

app.on('before-quit', () => {
  stopAppServer();
  stopDesktopAiRuntime();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle theme changes
nativeTheme.on('updated', () => {
  mainWindow?.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors);
});

// IPC handlers
ipcMain.handle('get-platform', () => process.platform);
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('desktop-ai-health', async () => {
  const runtimeSpec = resolveDesktopAiRuntime();
  const runtimePath = getPreferredRuntimePath();
  const selectedModel = resolveActiveModel();
  const modelPath = selectedModel?.modelPath;
  const runtimeAvailable = Boolean(runtimeSpec);
  const modelAvailable = Boolean(selectedModel?.isInstalled);
  const modelLabel = selectedModel
    ? `${selectedModel.modelId} (${selectedModel.quantization})`
    : 'No installed model';

  if (desktopAiState.startPromise && !desktopAiState.ready) {
    return {
      ok: false,
      status: 'starting',
      provider: 'desktop-local',
      model: modelLabel,
      runtimePath,
      runtimeEngine: desktopAiState.runtimeEngine || runtimeSpec?.engine,
      modelPath,
      details: 'Desktop AI runtime is warming up',
    };
  }

  if (desktopAiState.ready) {
    const healthy = await isRuntimeHealthy();
    if (healthy) {
      return {
        ok: true,
        status: 'ready',
        provider: 'desktop-local',
        model: modelLabel,
        runtimePath: desktopAiState.runtimePath || runtimePath,
        runtimeEngine: desktopAiState.runtimeEngine || runtimeSpec?.engine,
        modelPath,
      };
    }
  }

  return {
    ok: false,
    status: runtimeAvailable && modelAvailable ? 'unavailable' : 'error',
    provider: 'desktop-local',
    model: modelLabel,
    runtimePath,
    runtimeEngine: desktopAiState.runtimeEngine || runtimeSpec?.engine,
    modelPath,
    details: desktopAiState.lastError || (!modelAvailable ? 'Model file missing' : 'Runtime unavailable'),
  };
});

ipcMain.handle('desktop-ai-model-info', async () => {
  const manifest = await getPreferredManifest({ allowRemote: false });
  const models = getModelCatalog(manifest);
  const selectedModel = resolveActiveModel();
  const recommendedModelKey = getRecommendedModelKey();
  const deviceProfile = getDeviceProfile();
  const config = getDesktopAiConfig();
  const runtimeSpec = resolveDesktopAiRuntime();
  const runtimePath = runtimeSpec?.runtimePath;
  const runtimeAvailable = Boolean(runtimeSpec);

  return {
    modelId: selectedModel?.modelId || '',
    modelFile: selectedModel?.modelFile || '',
    quantization: selectedModel?.quantization || '',
    bundled: Boolean(selectedModel?.bundled),
    activeModelKey: selectedModel?.key || null,
    recommendedModelKey,
    deviceProfile,
    setupCompleted: Boolean(config.setupCompleted),
    wizardEnabled: MODEL_WIZARD_ENABLED,
    selectedModelKey: getSelectedModelKey(),
    manifestVersion: manifest?.version || null,
    models: models.map((model) => ({
      key: model.key,
      modelId: model.modelId,
      modelFile: model.modelFile,
      quantization: model.quantization,
      recommendedFor: model.recommendedFor,
      bundled: model.bundled,
      installedSource: model.installedSource,
      isInstalled: model.isInstalled,
      isDownloading: model.isDownloading,
      downloadProgress: model.downloadProgress,
      sizeBytes: model.sizeBytes,
      minRamGb: model.minRamGb,
      sha256: model.sha256,
      url: model.url,
      modelPath: model.modelPath,
    })),
    runtimeAvailable,
    runtimeEngine: desktopAiState.runtimeEngine || runtimeSpec?.engine,
    runtimePath,
    modelPath: selectedModel?.modelPath,
  };
});

ipcMain.handle('desktop-ai-set-model', async (_, modelKey) => {
  if (typeof modelKey !== 'string') {
    return {
      ok: false,
      errorCode: 'INVALID_REQUEST',
      message: 'Model key is required',
    };
  }

  const model = getModelCatalog().find((entry) => entry.key === modelKey);
  if (!model) {
    return {
      ok: false,
      errorCode: 'INVALID_REQUEST',
      message: `Unknown model key: ${modelKey}`,
    };
  }

  if (!model.isInstalled) {
    return {
      ok: false,
      errorCode: 'MODEL_NOT_INSTALLED',
      message: 'Selected model is not installed',
    };
  }

  const changed = desktopAiState.activeModelKey !== modelKey;
  desktopAiState.activeModelKey = modelKey;
  patchDesktopAiConfig({ selectedModelKey: modelKey });

  if (changed) {
    stopDesktopAiRuntime();
    desktopAiState.activeModelKey = modelKey;
    const runtime = await ensureDesktopAiRuntime();
    if (!runtime.ok) {
      return {
        ok: false,
        errorCode: 'RUNTIME_UNAVAILABLE',
        message: runtime.error || 'Desktop AI runtime unavailable',
      };
    }
  }

  return {
    ok: true,
    activeModelKey: modelKey,
  };
});

ipcMain.handle('desktop-ai-list-models', async () => {
  const manifest = await getPreferredManifest({ allowRemote: false });
  const models = getModelCatalog(manifest);
  const recommendedModelKey = getRecommendedModelKey();

  return {
    manifestVersion: manifest?.version || null,
    recommendedModelKey,
    models: models.map((model) => ({
      key: model.key,
      modelId: model.modelId,
      modelFile: model.modelFile,
      quantization: model.quantization,
      recommendedFor: model.recommendedFor,
      minRamGb: model.minRamGb,
      sizeBytes: model.sizeBytes,
      sha256: model.sha256,
      url: model.url,
      bundled: model.bundled,
      isInstalled: model.isInstalled,
      installedSource: model.installedSource,
      modelPath: model.modelPath,
      isDownloading: model.isDownloading,
      downloadProgress: model.downloadProgress,
    })),
  };
});

ipcMain.handle('desktop-ai-get-selection', async () => {
  const config = getDesktopAiConfig();
  const resolved = resolveActiveModel();
  return {
    selectedModelKey: config.selectedModelKey,
    activeModelKey: resolved?.key || null,
    setupCompleted: Boolean(config.setupCompleted),
    wizardEnabled: MODEL_WIZARD_ENABLED,
    recommendedModelKey: getRecommendedModelKey(),
    deviceProfile: getDeviceProfile(),
  };
});

ipcMain.handle('desktop-ai-complete-setup', async (_, payload) => {
  const modelKey = typeof payload?.selectedModelKey === 'string' ? payload.selectedModelKey : undefined;
  const patch = { setupCompleted: true };
  if (modelKey) {
    patchDesktopAiConfig({ ...patch, selectedModelKey: ensureModelKey(modelKey) });
    desktopAiState.activeModelKey = ensureModelKey(modelKey);
  } else {
    patchDesktopAiConfig(patch);
  }
  return { ok: true };
});

ipcMain.handle('desktop-ai-install-model', async (_, modelKey) => {
  if (typeof modelKey !== 'string') {
    return {
      ok: false,
      status: 'invalid_request',
      message: 'Model key is required',
    };
  }

  const result = await installDesktopModel(modelKey);
  if (result.status === 'success' || result.status === 'already_installed') {
    return {
      ok: true,
      status: result.status,
      modelKey,
    };
  }

  return {
    ok: false,
    status: result.status,
    modelKey,
    message: result.message || 'Model install failed',
  };
});

ipcMain.handle('desktop-ai-remove-model', async (_, modelKey) => {
  if (typeof modelKey !== 'string') {
    return {
      ok: false,
      status: 'invalid_request',
      message: 'Model key is required',
    };
  }

  const result = removeDesktopModel(modelKey);
  if (result.status === 'success') {
    return {
      ok: true,
      status: 'success',
      modelKey,
    };
  }

  return {
    ok: false,
    status: result.status,
    modelKey,
    message: result.message || 'Unable to remove model',
  };
});

ipcMain.handle('desktop-ai-download-status', async () => ({
  ok: true,
  items: getDownloadStatusSnapshot(),
}));

ipcMain.handle('desktop-ai-generate', async (_, payload) => {
  const mode = payload?.mode;
  const text = payload?.text;
  const rewriteOptions = payload?.rewriteOptions;

  if (!mode || typeof mode !== 'string' || !SUPPORTED_TOOL_MODES.has(mode)) {
    return {
      ok: false,
      errorCode: 'INVALID_REQUEST',
      message: 'Unsupported mode for desktop AI',
    };
  }

  if (!text || typeof text !== 'string' || text.trim().length < 1) {
    return {
      ok: false,
      errorCode: 'INVALID_REQUEST',
      message: 'Study text is required',
    };
  }

  const runtime = await ensureDesktopAiRuntime();
  if (!runtime.ok || !desktopAiState.port) {
    return {
      ok: false,
      errorCode: 'RUNTIME_UNAVAILABLE',
      message: runtime.error || 'Desktop AI runtime is unavailable',
    };
  }

  try {
    if (desktopAiState.runtimeProtocol === 'openai') {
      return await requestLlamaDesktopGeneration(
        desktopAiState.port,
        mode,
        text,
        rewriteOptions,
        desktopAiState.modelPath
      );
    }

    return await requestLegacyDesktopGeneration(
      desktopAiState.port,
      mode,
      text,
      rewriteOptions
    );
  } catch (error) {
    return {
      ok: false,
      errorCode: 'RUNTIME_TIMEOUT',
      message: 'Desktop AI request timed out',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
});
