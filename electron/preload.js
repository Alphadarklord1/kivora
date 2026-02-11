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
  },

  // Check if running in Electron
  isElectron: true,
});
