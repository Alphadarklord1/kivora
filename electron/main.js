const { app, BrowserWindow, Menu, shell, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const os = require('os');
const { spawn } = require('child_process');

const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

const DESKTOP_AI = {
  startupTimeoutMs: 25000,
  requestTimeoutMs: 45000,
  maxRestartAttempts: 4,
};

const DESKTOP_AI_MODELS = [
  {
    key: 'mini',
    modelId: 'Qwen2.5-1.5B-Instruct',
    modelFile: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    quantization: 'Q4_K_M',
    recommendedFor: 'laptop',
  },
  {
    key: 'balanced',
    modelId: 'Qwen2.5-3B-Instruct',
    modelFile: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    quantization: 'Q4_K_M',
    recommendedFor: 'laptop-pc',
  },
  {
    key: 'pro',
    modelId: 'Qwen2.5-7B-Instruct',
    modelFile: 'qwen2.5-7b-instruct-q4_k_m.gguf',
    quantization: 'Q4_K_M',
    recommendedFor: 'pc',
  },
];

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

let desktopAiState = {
  process: null,
  port: null,
  runtimePath: null,
  modelPath: null,
  activeModelKey: null,
  startPromise: null,
  ready: false,
  lastError: null,
  restartAttempts: 0,
  manualStop: false,
};

function getPlatformArchTag() {
  return `${process.platform}-${process.arch}`;
}

function getRuntimeBinaryPath() {
  const binaryName = process.platform === 'win32' ? 'studypilot-ai.exe' : 'studypilot-ai';
  const platformTag = getPlatformArchTag();
  const relativeParts = ['bin', platformTag, binaryName];
  const runtimePath = app.isPackaged
    ? path.join(process.resourcesPath, ...relativeParts)
    : path.join(__dirname, 'runtime', ...relativeParts);
  return runtimePath;
}

function getModelPath(modelFile) {
  const relativeParts = ['models', modelFile];
  return app.isPackaged
    ? path.join(process.resourcesPath, ...relativeParts)
    : path.join(__dirname, 'runtime', ...relativeParts);
}

function getMockRuntimePath() {
  return path.join(__dirname, 'runtime', 'mock-ai-runtime.js');
}

function getDeviceProfile() {
  const totalMemoryGb = os.totalmem() / (1024 ** 3);
  if (totalMemoryGb <= 12) return 'laptop';
  if (totalMemoryGb <= 24) return 'laptop-pc';
  return 'pc';
}

function getRecommendedModelKey() {
  const forcedModelKey = process.env.STUDYPILOT_AI_MODEL_KEY;
  if (forcedModelKey && DESKTOP_AI_MODELS.some((model) => model.key === forcedModelKey)) {
    return forcedModelKey;
  }

  const profile = getDeviceProfile();
  if (profile === 'laptop') return 'mini';
  if (profile === 'laptop-pc') return 'balanced';
  return 'pro';
}

function getModelCatalog() {
  return DESKTOP_AI_MODELS.map((model) => {
    const modelPath = getModelPath(model.modelFile);
    return {
      ...model,
      modelPath,
      bundled: fs.existsSync(modelPath),
    };
  });
}

function resolveActiveModel() {
  const models = getModelCatalog();
  const recommendedModelKey = getRecommendedModelKey();
  const selectedModelKey = desktopAiState.activeModelKey || recommendedModelKey;

  const selectedBundled = models.find((model) => model.key === selectedModelKey && model.bundled);
  if (selectedBundled) {
    return selectedBundled;
  }

  const recommendedBundled = models.find((model) => model.key === recommendedModelKey && model.bundled);
  if (recommendedBundled) {
    return recommendedBundled;
  }

  const fallbackBundled = models.find((model) => model.bundled);
  if (fallbackBundled) {
    return fallbackBundled;
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

async function isRuntimeHealthy() {
  if (!desktopAiState.port) return false;
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

async function startDesktopAiRuntime() {
  if (desktopAiState.startPromise) return desktopAiState.startPromise;

  desktopAiState.startPromise = (async () => {
    const selectedModel = resolveActiveModel();
    const runtimePath = getRuntimeBinaryPath();
    const mockRuntimePath = getMockRuntimePath();
    const runtimeExists = fs.existsSync(runtimePath);
    const mockExists = fs.existsSync(mockRuntimePath);
    const canUseMockRuntime = !app.isPackaged && mockExists;

    if (!runtimeExists && !canUseMockRuntime) {
      desktopAiState.lastError = 'Desktop AI runtime binary is missing';
      clearDesktopAiState();
      return;
    }

    if (!selectedModel) {
      desktopAiState.lastError = 'No bundled desktop model found';
      clearDesktopAiState();
      return;
    }

    const { modelPath } = selectedModel;

    const port = await getFreePort();
    const command = runtimeExists ? runtimePath : process.execPath;
    const args = runtimeExists
      ? ['--host', '127.0.0.1', '--port', String(port), '--model', modelPath]
      : [mockRuntimePath, '--host', '127.0.0.1', '--port', String(port), '--model', modelPath];

    desktopAiState.manualStop = false;
    desktopAiState.activeModelKey = selectedModel.key;
    desktopAiState.modelPath = modelPath;
    desktopAiState.runtimePath = command;
    desktopAiState.port = port;

    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        STUDYPILOT_AI_MODEL: modelPath,
        STUDYPILOT_AI_PORT: String(port),
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

  const port = await getFreePort();
  const serverUrl = `http://127.0.0.1:${port}`;
  const nextCliPath = path.join(__dirname, '../node_modules/next/dist/bin/next');
  const appRoot = path.join(__dirname, '..');

  appServerProcess = spawn(process.execPath, [nextCliPath, 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      STUDYPILOT_DESKTOP_ONLY: process.env.STUDYPILOT_DESKTOP_ONLY || '1',
      AUTH_GUEST_MODE: process.env.AUTH_GUEST_MODE || '1',
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

  const ready = await waitForServerUrl(serverUrl);
  if (!ready) {
    stopAppServer();
    throw new Error('StudyPilot app server failed to start');
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
            await shell.openExternal('https://github.com/studypilot/app#desktop');
          },
        },
        {
          label: 'Report Issue',
          click: async () => {
            await shell.openExternal('https://github.com/studypilot/app/issues');
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
  const runtimePath = getRuntimeBinaryPath();
  const selectedModel = resolveActiveModel();
  const modelPath = selectedModel?.modelPath;
  const runtimeAvailable = fs.existsSync(runtimePath) || (!app.isPackaged && fs.existsSync(getMockRuntimePath()));
  const modelAvailable = Boolean(selectedModel?.bundled);
  const modelLabel = selectedModel
    ? `${selectedModel.modelId} (${selectedModel.quantization})`
    : 'No bundled model';

  if (desktopAiState.startPromise && !desktopAiState.ready) {
    return {
      ok: false,
      status: 'starting',
      provider: 'desktop-local',
      model: modelLabel,
      runtimePath,
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
    modelPath,
    details: desktopAiState.lastError || (!modelAvailable ? 'Model file missing' : 'Runtime unavailable'),
  };
});

ipcMain.handle('desktop-ai-model-info', async () => {
  const models = getModelCatalog();
  const selectedModel = resolveActiveModel();
  const recommendedModelKey = getRecommendedModelKey();
  const deviceProfile = getDeviceProfile();
  const runtimePath = getRuntimeBinaryPath();
  const runtimeAvailable = fs.existsSync(runtimePath) || (!app.isPackaged && fs.existsSync(getMockRuntimePath()));

  return {
    modelId: selectedModel?.modelId || '',
    modelFile: selectedModel?.modelFile || '',
    quantization: selectedModel?.quantization || '',
    bundled: Boolean(selectedModel?.bundled),
    activeModelKey: selectedModel?.key || null,
    recommendedModelKey,
    deviceProfile,
    models: models.map((model) => ({
      key: model.key,
      modelId: model.modelId,
      modelFile: model.modelFile,
      quantization: model.quantization,
      recommendedFor: model.recommendedFor,
      bundled: model.bundled,
      modelPath: model.modelPath,
    })),
    runtimeAvailable,
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

  if (!model.bundled) {
    return {
      ok: false,
      errorCode: 'MODEL_NOT_BUNDLED',
      message: 'Selected model is not bundled with this installer',
    };
  }

  const changed = desktopAiState.activeModelKey !== modelKey;
  desktopAiState.activeModelKey = modelKey;

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
    const { response, data } = await fetchJson(
      `http://127.0.0.1:${desktopAiState.port}/generate`,
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
  } catch (error) {
    return {
      ok: false,
      errorCode: 'RUNTIME_TIMEOUT',
      message: 'Desktop AI request timed out',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
});
