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

  // VIP Token System
  vipGetUsers: () => ipcRenderer.invoke('vip-get-users'),
  vipSearchUsers: (query: string) => ipcRenderer.invoke('vip-search-users', query),
  vipGetUser: (platform: 'twitch' | 'youtube', platformUserId: string) => ipcRenderer.invoke('vip-get-user', platform, platformUserId),
  vipGetBalance: (platform: 'twitch' | 'youtube', platformUserId: string) => ipcRenderer.invoke('vip-get-balance', platform, platformUserId),
  vipSetTokens: (platform: 'twitch' | 'youtube', platformUserId: string, displayName: string, tokens: number) => 
    ipcRenderer.invoke('vip-set-tokens', platform, platformUserId, displayName, tokens),
  vipAwardTokens: (platform: 'twitch' | 'youtube', platformUserId: string, displayName: string, amount: number, description: string) =>
    ipcRenderer.invoke('vip-award-tokens', platform, platformUserId, displayName, amount, description),
  vipAwardTokensByUsername: (platform: 'twitch' | 'youtube', username: string, amount: number, description: string) =>
    ipcRenderer.invoke('vip-award-tokens-by-username', platform, username, amount, description),
  vipSetTokensByUsername: (platform: 'twitch' | 'youtube', username: string, tokens: number) =>
    ipcRenderer.invoke('vip-set-tokens-by-username', platform, username, tokens),
  vipGetRates: () => ipcRenderer.invoke('vip-get-rates'),
  vipSetRates: (rates: any) => ipcRenderer.invoke('vip-set-rates', rates),

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
      // VIP Token System
      vipGetUsers: () => Promise<any[]>;
      vipSearchUsers: (query: string) => Promise<any[]>;
      vipGetUser: (platform: 'twitch' | 'youtube', platformUserId: string) => Promise<any>;
      vipGetBalance: (platform: 'twitch' | 'youtube', platformUserId: string) => Promise<number>;
      vipSetTokens: (platform: 'twitch' | 'youtube', platformUserId: string, displayName: string, tokens: number) => Promise<{ success: boolean; user?: any; error?: string }>;
      vipAwardTokens: (platform: 'twitch' | 'youtube', platformUserId: string, displayName: string, amount: number, description: string) => Promise<{ success: boolean; user?: any; error?: string }>;
      vipAwardTokensByUsername: (platform: 'twitch' | 'youtube', username: string, amount: number, description: string) => Promise<{ success: boolean; user?: any; error?: string }>;
      vipSetTokensByUsername: (platform: 'twitch' | 'youtube', username: string, tokens: number) => Promise<{ success: boolean; user?: any; error?: string }>;
      vipGetRates: () => Promise<any>;
      vipSetRates: (rates: any) => Promise<{ success: boolean; error?: string }>;
      openExternal: (url: string) => Promise<void>;
    };
  }
}
