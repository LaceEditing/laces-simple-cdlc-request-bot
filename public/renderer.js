// ============================================
// Rocksmith Request Bot - Renderer Script
// ============================================

// ============================================
// Theme Toggle (Light/Dark)
// ============================================

const THEME_STORAGE_KEY = 'uiTheme';

function getInitialTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  updateThemeToggleLabel();
}

function updateThemeToggleLabel() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const current = document.documentElement.dataset.theme || 'light';
  btn.textContent = current === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
}

applyTheme(getInitialTheme());

document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// Tab Navigation
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    
    // Show corresponding tab
    const tabId = item.dataset.tab;
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
  });
});

// ============================================
// Settings Management
// ============================================

async function loadSettings() {
  const settings = await window.electronAPI.getSettings();
  
  // Twitch
  document.getElementById('twitchUsername').value = settings.twitch?.username || '';
  document.getElementById('twitchChannel').value = settings.twitch?.channel || '';
  document.getElementById('twitchOauth').value = settings.twitch?.oauthToken || '';
  
  // YouTube
  document.getElementById('youtubeApiKey').value = settings.youtube?.apiKey || '';
  document.getElementById('youtubeChatId').value = settings.youtube?.liveChatId || '';
  
  // Customsforge
  document.getElementById('cfUsername').value = settings.customsforge?.username || '';
  document.getElementById('cfPassword').value = settings.customsforge?.password || '';
  
  // Ngrok
  document.getElementById('ngrokEnabled').checked = settings.ngrok?.enabled || false;
  document.getElementById('ngrokToken').value = settings.ngrok?.authToken || '';
  
  // Bot settings
  document.getElementById('webPort').value = settings.web?.port || 3000;
  document.getElementById('maxRequests').value = settings.limits?.maxRequestsPerUser || 3;
  document.getElementById('cooldown').value = settings.limits?.cooldownSeconds || 10;

  // Hotkeys
  const hotkeys = settings.hotkeys || {};
  document.getElementById('hotkeyNext').value = hotkeys.next || 'Ctrl+N';
  document.getElementById('hotkeySkip').value = hotkeys.skip || 'Ctrl+S';
  document.getElementById('hotkeyPlayed').value = hotkeys.played || 'Ctrl+P';
  document.getElementById('hotkeyClear').value = hotkeys.clear || 'Ctrl+C';

  // Response Templates
  const templates = settings.responseTemplates || {};
  document.getElementById('templateRequestAdded').value = templates.requestAdded || '';
  document.getElementById('templateVipRequestAdded').value = templates.vipRequestAdded || '';
  document.getElementById('templateSongNotFound').value = templates.songNotFound || '';
  document.getElementById('templateVipSongNotFound').value = templates.vipSongNotFound || '';
  document.getElementById('templateAlreadyInQueue').value = templates.alreadyInQueue || '';
  document.getElementById('templateQueueEmpty').value = templates.queueEmpty || '';
  document.getElementById('templateQueueList').value = templates.queueList || '';
  document.getElementById('templateNowPlaying').value = templates.nowPlaying || '';
  document.getElementById('templateUpNext').value = templates.upNext || '';
  document.getElementById('templateNoSongsPlaying').value = templates.noSongsPlaying || '';
  document.getElementById('templateTokenBalance').value = templates.tokenBalance || '';
  document.getElementById('templateNoTokens').value = templates.noTokens || '';
}

async function saveSettings() {
  const settings = {
    twitch: {
      username: document.getElementById('twitchUsername').value,
      channel: document.getElementById('twitchChannel').value,
      oauthToken: document.getElementById('twitchOauth').value,
    },
    youtube: {
      apiKey: document.getElementById('youtubeApiKey').value,
      liveChatId: document.getElementById('youtubeChatId').value,
      clientId: '',
      clientSecret: '',
      refreshToken: '',
    },
    customsforge: {
      username: document.getElementById('cfUsername').value,
      password: document.getElementById('cfPassword').value,
    },
    web: {
      port: parseInt(document.getElementById('webPort').value) || 3000,
    },
    limits: {
      maxRequestsPerUser: parseInt(document.getElementById('maxRequests').value) || 3,
      cooldownSeconds: parseInt(document.getElementById('cooldown').value) || 10,
    },
    hotkeys: {
      next: (document.getElementById('hotkeyNext').value || 'Ctrl+N').trim(),
      skip: (document.getElementById('hotkeySkip').value || 'Ctrl+S').trim(),
      played: (document.getElementById('hotkeyPlayed').value || 'Ctrl+P').trim(),
      clear: (document.getElementById('hotkeyClear').value || 'Ctrl+C').trim(),
    },
    ngrok: {
      enabled: document.getElementById('ngrokEnabled').checked,
      authToken: document.getElementById('ngrokToken').value,
    },
    responseTemplates: {
      requestAdded: document.getElementById('templateRequestAdded').value,
      vipRequestAdded: document.getElementById('templateVipRequestAdded').value,
      songNotFound: document.getElementById('templateSongNotFound').value,
      vipSongNotFound: document.getElementById('templateVipSongNotFound').value,
      alreadyInQueue: document.getElementById('templateAlreadyInQueue').value,
      queueEmpty: document.getElementById('templateQueueEmpty').value,
      queueList: document.getElementById('templateQueueList').value,
      nowPlaying: document.getElementById('templateNowPlaying').value,
      upNext: document.getElementById('templateUpNext').value,
      noSongsPlaying: document.getElementById('templateNoSongsPlaying').value,
      tokenBalance: document.getElementById('templateTokenBalance').value,
      noTokens: document.getElementById('templateNoTokens').value,
    },
  };
  
  await window.electronAPI.saveSettings(settings);
  currentHotkeys = settings.hotkeys;
  showToast('Settings saved!', 'success');
}

document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

// ============================================
// Bot Control
// ============================================

async function startBot() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  
  startBtn.disabled = true;
  startBtn.innerHTML = '<span class="btn-icon">⏳</span> Starting...';
  
  const result = await window.electronAPI.startBot();
  
  if (result.success) {
    stopBtn.disabled = false;
    startBtn.innerHTML = '<span class="btn-icon">▶️</span> Running';
    updateStatus(true, result.urls);
    showToast('Bot started successfully!', 'success');
  } else {
    startBtn.disabled = false;
    startBtn.innerHTML = '<span class="btn-icon">▶️</span> Start Bot';
    showToast('Failed to start: ' + result.error, 'error');
  }
}

async function stopBot() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  
  stopBtn.disabled = true;
  
  await window.electronAPI.stopBot();
  
  startBtn.disabled = false;
  startBtn.innerHTML = '<span class="btn-icon">▶️</span> Start Bot';
  stopBtn.innerHTML = '<span class="btn-icon">⏹️</span> Stop Bot';
  
  updateStatus(false);
  showToast('Bot stopped', 'success');
}

document.getElementById('startBtn').addEventListener('click', startBot);
document.getElementById('stopBtn').addEventListener('click', stopBot);

// ============================================
// Status Updates
// ============================================

function updateStatus(running, urls = null) {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  
  if (running) {
    statusIndicator.classList.remove('offline');
    statusIndicator.classList.add('online');
    statusText.textContent = 'Online';
  } else {
    statusIndicator.classList.remove('online');
    statusIndicator.classList.add('offline');
    statusText.textContent = 'Offline';
  }
  
  // Update URLs
  if (urls) {
    document.getElementById('localUrl').value = urls.local + '/queue';
    document.getElementById('publicUrl').value = urls.public ? urls.public + '/queue' : 'Not enabled';
  } else {
    document.getElementById('localUrl').value = 'Not running';
    document.getElementById('publicUrl').value = 'Enable ngrok in settings';
  }
}

async function refreshStatus() {
  const status = await window.electronAPI.getBotStatus();
  
  updateStatus(status.running, status.urls);
  
  if (status.running) {
    document.getElementById('startBtn').disabled = true;
    document.getElementById('startBtn').innerHTML = '<span class="btn-icon">▶️</span> Running';
    document.getElementById('stopBtn').disabled = false;
    
    // Update platform statuses
    document.getElementById('twitchStatus').textContent = status.platforms?.twitch ? 'Connected' : 'Not Connected';
    document.getElementById('twitchStatus').className = 'status-badge ' + (status.platforms?.twitch ? 'connected' : 'disconnected');
    
    document.getElementById('youtubeStatus').textContent = status.platforms?.youtube ? 'Connected' : 'Not Connected';
    document.getElementById('youtubeStatus').className = 'status-badge ' + (status.platforms?.youtube ? 'connected' : 'disconnected');
    
    // Update Customsforge status
    await refreshCustomsforgeStatus();
  }
}

// ============================================
// Customsforge Login Test
// ============================================

async function refreshCustomsforgeStatus() {
  try {
    const cfStatus = await window.electronAPI.getCustomsforgeStatus();
    const statusEl = document.getElementById('cfStatus');
    
    if (cfStatus.authenticated) {
      statusEl.className = 'connection-status connected';
      statusEl.title = `Logged in as ${cfStatus.username}`;
    } else {
      statusEl.className = 'connection-status disconnected';
      statusEl.title = 'Not authenticated';
    }
  } catch (e) {
    // Bot not running yet
  }
}

async function testCustomsforgeLogin() {
  const resultEl = document.getElementById('cfLoginResult');
  const btnEl = document.getElementById('testCfLogin');
  
  // Check if credentials are entered
  const username = document.getElementById('cfUsername').value;
  const password = document.getElementById('cfPassword').value;
  
  if (!username || !password) {
    resultEl.textContent = 'Enter username and password first';
    resultEl.className = 'login-result error';
    return;
  }
  
  // Make sure settings are saved first
  await saveSettings();
  
  // Check if bot is running
  const status = await window.electronAPI.getBotStatus();
  if (!status.running) {
    resultEl.textContent = 'Start bot first to test login';
    resultEl.className = 'login-result error';
    return;
  }
  
  // Test login
  btnEl.disabled = true;
  resultEl.textContent = 'Testing...';
  resultEl.className = 'login-result testing';
  
  try {
    const result = await window.electronAPI.testCustomsforgeLogin();
    
    if (result.success) {
      resultEl.textContent = '✓ ' + result.message;
      resultEl.className = 'login-result success';
      
      // Update status indicator
      const statusEl = document.getElementById('cfStatus');
      statusEl.className = 'connection-status connected';
      statusEl.title = result.message;
    } else {
      resultEl.textContent = '✗ ' + result.message;
      resultEl.className = 'login-result error';
    }
  } catch (e) {
    resultEl.textContent = '✗ Error testing login';
    resultEl.className = 'login-result error';
  }
  
  btnEl.disabled = false;
}

// Hook up the test login button
document.getElementById('testCfLogin')?.addEventListener('click', testCustomsforgeLogin);

// ============================================
// Queue Management
// ============================================

async function refreshQueue() {
  const { pending, nowPlaying } = await window.electronAPI.getQueue();
  
  // Update stats
  document.getElementById('queueLength').textContent = pending.length;
  
  // Update now playing
  const nowPlayingContent = document.getElementById('nowPlayingContent');
  if (nowPlaying) {
    document.getElementById('nowPlayingCount').textContent = '1';
    nowPlayingContent.innerHTML = `
      <div class="song-info">
        <div class="title">${escapeHtml(nowPlaying.song.title)}</div>
        <div class="artist">${escapeHtml(nowPlaying.song.artist)}</div>
        <div class="requester">Requested by ${escapeHtml(nowPlaying.requestedBy)}</div>
      </div>
    `;
  } else {
    document.getElementById('nowPlayingCount').textContent = '-';
    nowPlayingContent.innerHTML = '<div class="no-song">No song playing</div>';
  }
  
  // Update queue list
  const queueList = document.getElementById('queueList');
  if (pending.length === 0) {
    queueList.innerHTML = `
      <div class="empty-queue">
        <span class="empty-icon">🎵</span>
        <p>No songs in queue</p>
        <p class="empty-hint">Songs requested via !request will appear here</p>
      </div>
    `;
  } else {
    queueList.innerHTML = pending.map((item, index) => `
      <div class="queue-item ${item.isVIP ? 'vip-request' : ''}" draggable="true" data-index="${index}">
        <div class="queue-position">${index + 1}</div>
        <div class="queue-song">
          <div class="title">${item.isVIP ? '⭐ ' : ''}${escapeHtml(item.song.title)}</div>
          <div class="artist">${escapeHtml(item.song.artist)}</div>
        </div>
        <div class="queue-meta">
          ${item.isVIP ? '<div class="vip-badge">VIP</div>' : ''}
          <div class="platform ${item.platform}">${item.platform}</div>
          <div class="requester">${escapeHtml(item.requestedBy)}</div>
        </div>
        <div class="queue-actions">
          <button class="btn btn-danger btn-small queue-delete-btn" type="button" draggable="false" data-index="${index}" title="Remove from queue">🗑️</button>
        </div>
      </div>
    `).join('');
    
    // Setup drag and drop handlers
    setupDragAndDrop();
    setupQueueDeleteButtons();
  }
}

function setupQueueDeleteButtons() {
  document.querySelectorAll('.queue-delete-btn').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const index = parseInt(btn.dataset.index);
      if (Number.isNaN(index)) return;

      const result = await window.electronAPI.queueRemove(index);
      if (result?.success) {
        showToast('Removed from queue', 'success');
      } else {
        showToast('Failed to remove item', 'error');
      }
      await refreshQueue();
    });
  });
}

// ============================================
// Drag and Drop Queue Reordering
// ============================================

let draggedIndex = null;

function setupDragAndDrop() {
  const items = document.querySelectorAll('.queue-item');
  
  items.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedIndex = parseInt(item.dataset.index);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    
    item.addEventListener('dragend', (e) => {
      item.classList.remove('dragging');
      draggedIndex = null;
      // Remove all drag-over indicators
      items.forEach(i => i.classList.remove('drag-over'));
    });
    
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      // Add visual indicator
      const afterElement = getDragAfterElement(item.parentElement, e.clientY);
      items.forEach(i => i.classList.remove('drag-over'));
      
      if (afterElement == null) {
        item.parentElement.appendChild(item);
      } else {
        item.classList.add('drag-over');
      }
    });
    
    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      const dropIndex = parseInt(item.dataset.index);
      
      if (draggedIndex !== null && draggedIndex !== dropIndex) {
        await window.electronAPI.reorderQueue(draggedIndex, dropIndex);
        await refreshQueue();
      }
    });
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.queue-item:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Queue control buttons
document.getElementById('nextBtn').addEventListener('click', async () => {
  await window.electronAPI.queueNext();
  refreshQueue();
});

document.getElementById('playedBtn').addEventListener('click', async () => {
  await window.electronAPI.queuePlayed();
  refreshQueue();
});

document.getElementById('skipBtn').addEventListener('click', async () => {
  await window.electronAPI.queueSkip();
  refreshQueue();
});

document.getElementById('clearQueueBtn').addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear the entire queue?')) {
    await window.electronAPI.queueClear();
    refreshQueue();
    showToast('Queue cleared', 'success');
  }
});

// ============================================
// Utility Functions
// ============================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function copyUrl(inputId) {
  const input = document.getElementById(inputId);
  navigator.clipboard.writeText(input.value);
  showToast('Copied to clipboard!', 'success');
}

function openUrl(inputId) {
  const input = document.getElementById(inputId);
  if (input.value && input.value !== 'Not running' && input.value !== 'Not enabled') {
    window.electronAPI.openExternal(input.value);
  }
}

function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ============================================
// Initialization
// ============================================

async function init() {
  await loadSettings();
  await refreshStatus();
  await refreshQueue();
  
  // Initialize VIP system
  await loadVIPRates();
  await loadVIPUsers();
  setupVIPHandlers();
  
  // Refresh queue every 5 seconds
  setInterval(refreshQueue, 5000);
  // Refresh status every 3 seconds to update connection indicators
  setInterval(refreshStatus, 3000);
  // Refresh VIP users every 10 seconds
  setInterval(() => loadVIPUsers(), 10000);
  
  // Add keyboard hotkeys
  setupHotkeys();

  // Allow user to set hotkeys in Settings
  setupHotkeyInputs();
}

// ============================================
// Keyboard Hotkeys
// ============================================

function setupHotkeys() {
  document.addEventListener('keydown', async (e) => {
    // Only trigger if not in an input field
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      return;
    }

    const pressed = eventToHotkeyString(e);
    if (!pressed) {
      return;
    }

    const hotkeys = currentHotkeys || {
      next: 'Ctrl+N',
      skip: 'Ctrl+S',
      played: 'Ctrl+P',
      clear: 'Ctrl+C',
    };

    const match = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();

    if (match(pressed, hotkeys.next)) {
      e.preventDefault();
      await window.electronAPI.queueNext();
      await refreshQueue();
      return;
    }

    if (match(pressed, hotkeys.skip)) {
      e.preventDefault();
      await window.electronAPI.queueSkip();
      await refreshQueue();
      return;
    }

    if (match(pressed, hotkeys.played)) {
      e.preventDefault();
      await window.electronAPI.queuePlayed();
      await refreshQueue();
      return;
    }

    if (match(pressed, hotkeys.clear)) {
      e.preventDefault();
      if (confirm('Clear entire queue?')) {
        await window.electronAPI.queueClear();
        await refreshQueue();
      }
    }
  });
}

let currentHotkeys = {
  next: 'Ctrl+N',
  skip: 'Ctrl+S',
  played: 'Ctrl+P',
  clear: 'Ctrl+C',
};

function eventToHotkeyString(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Cmd');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  // Ignore modifier-only presses
  const key = (e.key || '').toUpperCase();
  if (!key || ['CONTROL', 'SHIFT', 'ALT', 'META'].includes(key)) {
    return null;
  }

  // Normalize common keys
  const normalizedKey = (() => {
    if (key.length === 1) return key;
    if (key === ' ') return 'Space';
    if (key === 'ESCAPE') return 'Esc';
    if (key === 'ARROWUP') return 'Up';
    if (key === 'ARROWDOWN') return 'Down';
    if (key === 'ARROWLEFT') return 'Left';
    if (key === 'ARROWRIGHT') return 'Right';
    return e.key;
  })();

  parts.push(normalizedKey);
  return parts.join('+');
}

function setupHotkeyInputs() {
  const fields = [
    { id: 'hotkeyNext', key: 'next', fallback: 'Ctrl+N' },
    { id: 'hotkeySkip', key: 'skip', fallback: 'Ctrl+S' },
    { id: 'hotkeyPlayed', key: 'played', fallback: 'Ctrl+P' },
    { id: 'hotkeyClear', key: 'clear', fallback: 'Ctrl+C' },
  ];

  let recording = null;

  fields.forEach(f => {
    const el = document.getElementById(f.id);
    if (!el) return;

    el.addEventListener('focus', () => {
      recording = f;
      el.classList.add('hotkey-recording');
      el.value = 'Recording...';
    });

    el.addEventListener('blur', async () => {
      if (recording && recording.id === f.id && (el.value === 'Press keys...' || el.value === 'Recording...')) {
        // Revert if nothing recorded
        const settings = await window.electronAPI.getSettings();
        const hotkeys = settings.hotkeys || {};
        el.value = hotkeys[f.key] || f.fallback;
      }
      if (recording && recording.id === f.id) {
        recording = null;
      }
      el.classList.remove('hotkey-recording');
    });
  });

  document.addEventListener('keydown', (e) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();

    // Allow clearing
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const el = document.getElementById(recording.id);
      el.value = recording.fallback;
      el.classList.remove('hotkey-recording');
      recording = null;
      el.blur();
      return;
    }

    const value = eventToHotkeyString(e);
    if (!value) return;

    const el = document.getElementById(recording.id);
    el.value = value;
    el.classList.remove('hotkey-recording');
    recording = null;
    el.blur();
  }, true);
}

// ============================================
// VIP Token Management
// ============================================

async function loadVIPRates() {
  try {
    const rates = await window.electronAPI.vipGetRates();
    
    document.getElementById('rateTwitchPrime').value = rates.twitchPrime || 1;
    document.getElementById('rateTwitchTier1').value = rates.twitchTier1 || 1;
    document.getElementById('rateTwitchTier2').value = rates.twitchTier2 || 2;
    document.getElementById('rateTwitchTier3').value = rates.twitchTier3 || 4;
    document.getElementById('rateTwitchBitsAmount').value = rates.twitchBitsAmount || 250;
    document.getElementById('rateTwitchBitsTokens').value = rates.twitchBitsTokens || 1;
    document.getElementById('rateYoutubeMember').value = rates.youtubeMember || 1;
    document.getElementById('rateYoutubeSuperChatMin').value = rates.youtubeSuperChatMinimum || 2.50;
    document.getElementById('rateYoutubeSuperChat').value = rates.youtubeSuperChat || 1;
  } catch (e) {
    console.error('Error loading VIP rates:', e);
  }
}

async function saveVIPRates() {
  const rates = {
    twitchPrime: parseInt(document.getElementById('rateTwitchPrime').value) || 1,
    twitchTier1: parseInt(document.getElementById('rateTwitchTier1').value) || 1,
    twitchTier2: parseInt(document.getElementById('rateTwitchTier2').value) || 2,
    twitchTier3: parseInt(document.getElementById('rateTwitchTier3').value) || 4,
    twitchBitsAmount: parseInt(document.getElementById('rateTwitchBitsAmount').value) || 250,
    twitchBitsTokens: parseInt(document.getElementById('rateTwitchBitsTokens').value) || 1,
    youtubeMember: parseInt(document.getElementById('rateYoutubeMember').value) || 1,
    youtubeSuperChatMinimum: parseFloat(document.getElementById('rateYoutubeSuperChatMin').value) || 2.50,
    youtubeSuperChat: parseInt(document.getElementById('rateYoutubeSuperChat').value) || 1,
  };
  
  const result = await window.electronAPI.vipSetRates(rates);
  if (result.success) {
    showToast('VIP rates saved!', 'success');
  } else {
    showToast('Failed to save rates: ' + (result.error || 'Unknown error'), 'error');
  }
}

async function loadVIPUsers(searchQuery = '') {
  const listEl = document.getElementById('vipUsersList');
  
  try {
    let users;
    if (searchQuery) {
      users = await window.electronAPI.vipSearchUsers(searchQuery);
    } else {
      users = await window.electronAPI.vipGetUsers();
    }
    
    if (!users || users.length === 0) {
      listEl.innerHTML = `
        <div class="empty-vip">
          <span class="empty-icon">⭐</span>
          <p>${searchQuery ? 'No users found' : 'No VIP users yet'}</p>
          <p class="empty-hint">${searchQuery ? 'Try a different search term' : 'Users earn tokens through subscriptions, bits, and Super Chats'}</p>
        </div>
      `;
      return;
    }
    
    // Sort by tokens (descending)
    users.sort((a, b) => b.tokens - a.tokens);
    
    listEl.innerHTML = users.map((user, index) => `
      <div class="vip-user-item" data-platform="${user.platform}" data-userid="${user.platformUserId}" data-name="${escapeHtml(user.displayName)}">
        <div class="vip-rank">#${index + 1}</div>
        <div class="vip-user-info">
          <div class="vip-username">${escapeHtml(user.displayName)}</div>
          <div class="vip-platform ${user.platform}">${user.platform}</div>
        </div>
        <div class="vip-tokens">
          <span class="token-count">${user.tokens}</span>
          <span class="token-label">tokens</span>
        </div>
        <div class="vip-stats">
          <span class="total-earned" title="Total earned">📈 ${user.totalEarned || 0}</span>
        </div>
        <div class="vip-actions">
          <button class="btn btn-secondary btn-small vip-edit-btn" type="button" title="Edit user">✏️</button>
        </div>
      </div>
    `).join('');
    
    // Setup edit button handlers
    document.querySelectorAll('.vip-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.vip-user-item');
        const platform = item.dataset.platform;
        const name = item.dataset.name;
        const tokens = parseInt(item.querySelector('.token-count').textContent) || 0;
        
        // Fill edit form with username
        document.getElementById('vipEditPlatform').value = platform;
        document.getElementById('vipEditUsername').value = name;
        document.getElementById('vipEditTokens').value = tokens;
        document.getElementById('vipEditReason').value = '';
        
        // Scroll to edit section
        document.querySelector('.vip-edit-card').scrollIntoView({ behavior: 'smooth' });
      });
    });
  } catch (e) {
    console.error('Error loading VIP users:', e);
    listEl.innerHTML = `
      <div class="empty-vip">
        <span class="empty-icon">⚠️</span>
        <p>Error loading users</p>
        <p class="empty-hint">Make sure the bot is running</p>
      </div>
    `;
  }
}

async function setVIPTokens() {
  const platform = document.getElementById('vipEditPlatform').value;
  const username = document.getElementById('vipEditUsername').value.trim();
  const tokens = parseInt(document.getElementById('vipEditTokens').value) || 0;
  
  if (!username) {
    showToast('Please enter a username', 'error');
    return;
  }
  
  const result = await window.electronAPI.vipSetTokensByUsername(platform, username, tokens);
  if (result.success) {
    showToast(`Set ${username}'s tokens to ${tokens}`, 'success');
    await loadVIPUsers();
    // Clear form
    document.getElementById('vipEditUsername').value = '';
    document.getElementById('vipEditTokens').value = '0';
  } else {
    showToast('Failed to set tokens: ' + (result.error || 'Unknown error'), 'error');
  }
}

async function awardVIPTokens() {
  const platform = document.getElementById('vipEditPlatform').value;
  const username = document.getElementById('vipEditUsername').value.trim();
  const amount = parseInt(document.getElementById('vipEditTokens').value) || 0;
  const reason = document.getElementById('vipEditReason').value.trim() || 'Manual award';
  
  if (!username) {
    showToast('Please enter a username', 'error');
    return;
  }
  
  if (amount <= 0) {
    showToast('Please enter a positive token amount', 'error');
    return;
  }
  
  const result = await window.electronAPI.vipAwardTokensByUsername(platform, username, amount, reason);
  if (result.success) {
    showToast(`Awarded ${amount} tokens to ${username}`, 'success');
    await loadVIPUsers();
    // Clear form
    document.getElementById('vipEditUsername').value = '';
    document.getElementById('vipEditTokens').value = '0';
    document.getElementById('vipEditReason').value = '';
  } else {
    showToast('Failed to award tokens: ' + (result.error || 'Unknown error'), 'error');
  }
}

// ============================================
// Response Templates
// ============================================

const DEFAULT_TEMPLATES = {
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
  noTokens: '@{user} You don\\'t have any VIP tokens yet! Earn tokens by subscribing, cheering bits, or Super Chatting.',
};

function resetTemplatesToDefaults() {
  document.getElementById('templateRequestAdded').value = DEFAULT_TEMPLATES.requestAdded;
  document.getElementById('templateVipRequestAdded').value = DEFAULT_TEMPLATES.vipRequestAdded;
  document.getElementById('templateSongNotFound').value = DEFAULT_TEMPLATES.songNotFound;
  document.getElementById('templateVipSongNotFound').value = DEFAULT_TEMPLATES.vipSongNotFound;
  document.getElementById('templateAlreadyInQueue').value = DEFAULT_TEMPLATES.alreadyInQueue;
  document.getElementById('templateQueueEmpty').value = DEFAULT_TEMPLATES.queueEmpty;
  document.getElementById('templateQueueList').value = DEFAULT_TEMPLATES.queueList;
  document.getElementById('templateNowPlaying').value = DEFAULT_TEMPLATES.nowPlaying;
  document.getElementById('templateUpNext').value = DEFAULT_TEMPLATES.upNext;
  document.getElementById('templateNoSongsPlaying').value = DEFAULT_TEMPLATES.noSongsPlaying;
  document.getElementById('templateTokenBalance').value = DEFAULT_TEMPLATES.tokenBalance;
  document.getElementById('templateNoTokens').value = DEFAULT_TEMPLATES.noTokens;
  showToast('Templates reset to defaults (click Save Settings to apply)', 'success');
}

document.getElementById('resetTemplatesBtn')?.addEventListener('click', resetTemplatesToDefaults);

function setupVIPHandlers() {
  // Save rates button
  document.getElementById('saveRatesBtn')?.addEventListener('click', saveVIPRates);
  
  // Search buttons
  document.getElementById('vipSearchBtn')?.addEventListener('click', () => {
    const query = document.getElementById('vipSearchInput').value.trim();
    loadVIPUsers(query);
  });
  
  document.getElementById('vipShowAllBtn')?.addEventListener('click', () => {
    document.getElementById('vipSearchInput').value = '';
    loadVIPUsers();
  });
  
  // Search on Enter key
  document.getElementById('vipSearchInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = e.target.value.trim();
      loadVIPUsers(query);
    }
  });
  
  // Edit user buttons
  document.getElementById('vipSetTokensBtn')?.addEventListener('click', setVIPTokens);
  document.getElementById('vipAwardTokensBtn')?.addEventListener('click', awardVIPTokens);
}

// Start the app
init();

