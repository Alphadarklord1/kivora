const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Menu actions
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (event, action) => callback(action));
  },

  // Theme changes
  onThemeChanged: (callback) => {
    ipcRenderer.on('theme-changed', (event, isDark) => callback(isDark));
  },

  desktopAI: {
    generate: (payload) => ipcRenderer.invoke('desktop-ai-generate', payload),
    health: () => ipcRenderer.invoke('desktop-ai-health'),
    modelInfo: () => ipcRenderer.invoke('desktop-ai-model-info'),
    listModels: () => ipcRenderer.invoke('desktop-ai-list-models'),
    getSelection: () => ipcRenderer.invoke('desktop-ai-get-selection'),
    setModel: (modelKey) => ipcRenderer.invoke('desktop-ai-set-model', modelKey),
    completeSetup: (payload) => ipcRenderer.invoke('desktop-ai-complete-setup', payload),
    installModel: (modelKey) => ipcRenderer.invoke('desktop-ai-install-model', modelKey),
    removeModel: (modelKey) => ipcRenderer.invoke('desktop-ai-remove-model', modelKey),
    downloadStatus: () => ipcRenderer.invoke('desktop-ai-download-status'),
    onDownloadProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('desktop-ai-download-progress', listener);
      return () => ipcRenderer.removeListener('desktop-ai-download-progress', listener);
    },
  },

  // Check if running in Electron
  isElectron: true,
});
