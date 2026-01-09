import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import { BotManager } from './BotManager';

// Electron store for persistent settings
const store = new Store({
  defaults: {
    twitch: {
      username: '',
      oauthToken: '',
      channel: '',
    },
    youtube: {
      apiKey: '',
      liveChatId: '',
      clientId: '',
      clientSecret: '',
      refreshToken: '',
    },
    customsforge: {
      username: '',
      password: '',
    },
    web: {
      port: 3000,
    },
    limits: {
      maxRequestsPerUser: 3,
      cooldownSeconds: 10,
    },
    hotkeys: {
      next: 'Ctrl+N',
      skip: 'Ctrl+S',
      played: 'Ctrl+P',
      clear: 'Ctrl+C',
    },
    ngrok: {
      enabled: false,
      authToken: '',
    },
    responseTemplates: {
      requestAdded: '@{user} Added "{artist} - {title}" to the queue! Position: #{position} | Queue length: {queueLength}',
      vipRequestAdded: '@{user} ⭐ VIP Request! Added "{artist} - {title}" to position #{position}! ({tokensRemaining} VIP token(s) remaining)',
      songNotFound: '@{user} Sorry, "{query}" was not found on Customsforge. Please check the spelling or try a different song.',
      vipSongNotFound: '@{user} Sorry, "{query}" was not found on Customsforge. Your VIP token was not spent. Please check the spelling or try a different song.',
      alreadyInQueue: '@{user} "{artist} - {title}" is already in the queue!',
      queueEmpty: '@{user} The queue is empty! Be the first to request with !request',
      queueList: '@{user} {count} song(s) in queue. View the list: {url}',
      nowPlaying: '@{user} Now playing: "{artist} - {title}" (requested by {requester})',
      upNext: '@{user} Up next: "{artist} - {title}" (requested by {requester})',
      noSongsPlaying: '@{user} No songs in queue. Request one with !request',
      tokenBalance: '@{user} You have {tokens} VIP token(s). Use !viprequest to make a priority request!',
      noTokens: '@{user} You don\'t have any VIP tokens yet! Earn tokens by subscribing, cheering bits, or Super Chatting.',
    },
  },
});

// One-time-ish migration: older installs defaulted to 30s. If the stored value is still 30,
// switch it to the new 10s default so users don't need to manually edit settings.
try {
  const currentCooldown = store.get('limits.cooldownSeconds');
  if (currentCooldown === 30) {
    store.set('limits.cooldownSeconds', 10);
  }
} catch {
  // ignore
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let botManager: BotManager | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    frame: true,
    backgroundColor: '#e8e0f0',
    icon: path.join(__dirname, '../../public/icon.png'),
  });

  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.loadFile(path.join(__dirname, '../../public/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createTray(): void {
  const iconPath = path.join(__dirname, '../../public/icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setToolTip('Lace\'s Simple CDLC Request Bot');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow?.show());
}

// IPC Handlers
function setupIpcHandlers(): void {
  // Get all settings
  ipcMain.handle('get-settings', () => {
    return store.store;
  });

  // Save settings
  ipcMain.handle('save-settings', (_, settings) => {
    store.set(settings);
    return { success: true };
  });

  // Get specific setting
  ipcMain.handle('get-setting', (_, key: string) => {
    return store.get(key);
  });

  // Start bot
  ipcMain.handle('start-bot', async () => {
    try {
      if (botManager) {
        await botManager.stop();
      }
      
      botManager = new BotManager(store.store as any);
      const result = await botManager.start();
      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Stop bot
  ipcMain.handle('stop-bot', async () => {
    try {
      if (botManager) {
        await botManager.stop();
        botManager = null;
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get bot status
  ipcMain.handle('get-bot-status', () => {
    if (!botManager) {
      return { running: false };
    }
    return botManager.getStatus();
  });

  // Get queue data
  ipcMain.handle('get-queue', () => {
    if (!botManager) {
      return { pending: [], nowPlaying: null };
    }
    return botManager.getQueue();
  });

  // Queue management commands
  ipcMain.handle('queue-next', () => {
    return botManager?.nextSong() || { success: false };
  });

  ipcMain.handle('queue-skip', () => {
    return botManager?.skipSong() || { success: false };
  });

  ipcMain.handle('queue-clear', () => {
    return botManager?.clearQueue() || { success: false };
  });

  ipcMain.handle('queue-played', () => {
    return botManager?.markPlayed() || { success: false };
  });

  ipcMain.handle('reorder-queue', (_, fromIndex: number, toIndex: number) => {
    return botManager?.reorderQueue(fromIndex, toIndex) || { success: false };
  });

  ipcMain.handle('queue-remove', (_, index: number) => {
    return botManager?.removeQueueItem(index) || { success: false };
  });

  // Get Customsforge authentication status
  ipcMain.handle('get-customsforge-status', () => {
    if (!botManager) {
      return { authenticated: false, username: '' };
    }
    return botManager.getCustomsforgeStatus();
  });

  // Test Customsforge login
  ipcMain.handle('test-customsforge-login', async () => {
    if (!botManager) {
      return { success: false, message: 'Bot not started' };
    }
    return await botManager.testCustomsforgeLogin();
  });

  // Open external URL
  ipcMain.handle('open-external', (_, url: string) => {
    shell.openExternal(url);
  });

  // ============================================
  // VIP Token IPC Handlers
  // ============================================

  // Get all VIP users
  ipcMain.handle('vip-get-users', () => {
    if (!botManager) {
      return [];
    }
    return botManager.getVIPUsers();
  });

  // Search VIP users
  ipcMain.handle('vip-search-users', (_, query: string) => {
    if (!botManager) {
      return [];
    }
    return botManager.searchVIPUsers(query);
  });

  // Get specific VIP user
  ipcMain.handle('vip-get-user', (_, platform: 'twitch' | 'youtube', platformUserId: string) => {
    if (!botManager) {
      return null;
    }
    return botManager.getVIPUser(platform, platformUserId);
  });

  // Get VIP balance
  ipcMain.handle('vip-get-balance', (_, platform: 'twitch' | 'youtube', platformUserId: string) => {
    if (!botManager) {
      return 0;
    }
    return botManager.getVIPBalance(platform, platformUserId);
  });

  // Set VIP user tokens
  ipcMain.handle('vip-set-tokens', (_, platform: 'twitch' | 'youtube', platformUserId: string, displayName: string, tokens: number) => {
    if (!botManager) {
      return { success: false, error: 'Bot not running' };
    }
    try {
      const user = botManager.setVIPUserTokens(platform, platformUserId, displayName, tokens);
      return { success: true, user };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Award VIP tokens
  ipcMain.handle('vip-award-tokens', (_, platform: 'twitch' | 'youtube', platformUserId: string, displayName: string, amount: number, description: string) => {
    if (!botManager) {
      return { success: false, error: 'Bot not running' };
    }
    try {
      const user = botManager.awardVIPTokens(platform, platformUserId, displayName, amount, description);
      return { success: true, user };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Award VIP tokens by username (GUI-friendly)
  ipcMain.handle('vip-award-tokens-by-username', (_, platform: 'twitch' | 'youtube', username: string, amount: number, description: string) => {
    if (!botManager) {
      return { success: false, error: 'Bot not running' };
    }
    try {
      const user = botManager.awardVIPTokensByUsername(platform, username, amount, description);
      return { success: true, user };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Set VIP tokens by username (GUI-friendly)
  ipcMain.handle('vip-set-tokens-by-username', (_, platform: 'twitch' | 'youtube', username: string, tokens: number) => {
    if (!botManager) {
      return { success: false, error: 'Bot not running' };
    }
    try {
      const user = botManager.setVIPTokensByUsername(platform, username, tokens);
      return { success: true, user };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get VIP rates
  ipcMain.handle('vip-get-rates', () => {
    if (!botManager) {
      // Return defaults when bot not running
      return {
        twitchTier1: 1,
        twitchTier2: 2,
        twitchTier3: 4,
        twitchPrime: 1,
        twitchBitsAmount: 250,
        twitchBitsTokens: 1,
        youtubeMember: 1,
        youtubeSuperChat: 1,
        youtubeSuperChatMinimum: 2.50,
      };
    }
    return botManager.getVIPRates();
  });

  // Set VIP rates
  ipcMain.handle('vip-set-rates', (_, rates: any) => {
    if (!botManager) {
      return { success: false, error: 'Bot not running' };
    }
    try {
      botManager.setVIPRates(rates);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

app.whenReady().then(() => {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  createWindow();
  createTray();
  setupIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit on macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (botManager) {
    await botManager.stop();
  }
});
