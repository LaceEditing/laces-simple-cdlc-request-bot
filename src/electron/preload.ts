import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
  getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),

  // Bot control
  startBot: () => ipcRenderer.invoke('start-bot'),
  stopBot: () => ipcRenderer.invoke('stop-bot'),
  getBotStatus: () => ipcRenderer.invoke('get-bot-status'),

  // Queue management
  getQueue: () => ipcRenderer.invoke('get-queue'),
  queueNext: () => ipcRenderer.invoke('queue-next'),
  queueSkip: () => ipcRenderer.invoke('queue-skip'),
  queueClear: () => ipcRenderer.invoke('queue-clear'),
  queuePlayed: () => ipcRenderer.invoke('queue-played'),
  reorderQueue: (fromIndex: number, toIndex: number) => ipcRenderer.invoke('reorder-queue', fromIndex, toIndex),
  queueRemove: (index: number) => ipcRenderer.invoke('queue-remove', index),

  // Customsforge
  getCustomsforgeStatus: () => ipcRenderer.invoke('get-customsforge-status'),
  testCustomsforgeLogin: () => ipcRenderer.invoke('test-customsforge-login'),

  // Utilities
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
});

// Type declaration for the API
declare global {
  interface Window {
    electronAPI: {
      getSettings: () => Promise<any>;
      saveSettings: (settings: any) => Promise<{ success: boolean }>;
      getSetting: (key: string) => Promise<any>;
      startBot: () => Promise<{ success: boolean; error?: string; urls?: any }>;
      stopBot: () => Promise<{ success: boolean; error?: string }>;
      getBotStatus: () => Promise<{ running: boolean; urls?: any }>;
      getQueue: () => Promise<{ pending: any[]; nowPlaying: any }>;
      queueNext: () => Promise<any>;
      queueSkip: () => Promise<any>;
      queueClear: () => Promise<any>;
      queuePlayed: () => Promise<any>;
      reorderQueue: (fromIndex: number, toIndex: number) => Promise<any>;
      queueRemove: (index: number) => Promise<any>;
      getCustomsforgeStatus: () => Promise<{ authenticated: boolean; username: string }>;
      testCustomsforgeLogin: () => Promise<{ success: boolean; message: string }>;
      openExternal: (url: string) => Promise<void>;
    };
  }
}
