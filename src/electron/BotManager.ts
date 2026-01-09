import { TwitchClient, YouTubeClient } from '../clients';
import { QueueManager, CustomsforgeService, VIPTokenService, VIPUser, VIPTokenRates } from '../services';
import { CommandProcessor } from '../commands';
import { WebServer } from '../web';
import { ChatClient, ChatMessage, BotConfig } from '../types';
import ngrok from '@ngrok/ngrok';

// Tunnel instance
let tunnel: ngrok.Listener | null = null;

interface BotSettings {
  twitch: {
    username: string;
    oauthToken: string;
    channel: string;
  };
  youtube: {
    apiKey?: string;
    liveChatId?: string;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
  };
  customsforge: {
    username: string;
    password: string;
  };
  web: {
    port: number;
  };
  limits: {
    maxRequestsPerUser: number;
    cooldownSeconds: number;
  };
  ngrok: {
    enabled: boolean;
    authToken: string;
  };
}

interface BotUrls {
  local: string;
  public?: string;
}

interface BotStatus {
  running: boolean;
  urls: BotUrls;
  platforms: { twitch: boolean; youtube: boolean };
}

interface StartResult {
  success: boolean;
  error?: string;
  urls?: BotUrls;
}

export class BotManager {
  private twitchClient: TwitchClient | null = null;
  private youtubeClient: YouTubeClient | null = null;
  private queueManager: QueueManager;
  private customsforge: CustomsforgeService;
  private vipTokenService: VIPTokenService;
  private commandProcessor: CommandProcessor;
  private webServer: WebServer;
  private isRunning: boolean = false;
  private urls: BotUrls = { local: '' };
  private tunnelUrl: string | null = null;

  constructor(private settings: BotSettings) {
    const config = this.settingsToConfig(settings);
    
    this.queueManager = new QueueManager(
      settings.limits.maxRequestsPerUser,
      settings.limits.cooldownSeconds
    );
    this.customsforge = new CustomsforgeService(
      settings.customsforge.username,
      settings.customsforge.password
    );
    this.vipTokenService = new VIPTokenService();
    this.commandProcessor = new CommandProcessor(
      this.queueManager,
      this.customsforge,
      config,
      () => this.tunnelUrl || `http://localhost:${settings.web.port}`,
      this.vipTokenService
    );
    this.webServer = new WebServer(this.queueManager, config);
    this.urls.local = `http://localhost:${settings.web.port}`;
  }

  private settingsToConfig(settings: BotSettings): BotConfig {
    return {
      twitch: settings.twitch,
      youtube: settings.youtube,
      web: {
        port: settings.web.port,
        baseUrl: `http://localhost:${settings.web.port}`,
      },
      limits: settings.limits,
    };
  }

  async start(): Promise<StartResult> {
    try {
      // Try to login to Customsforge first (if credentials provided)
      if (this.settings.customsforge.username && this.settings.customsforge.password) {
        console.log('[Customsforge] Logging in before starting bot...');
        const loggedIn = await this.customsforge.login();
        if (loggedIn) {
          console.log('[Customsforge] ✓ Authenticated - song validation enabled');
        } else {
          console.warn('[Customsforge] ✗ Login failed - songs will be added without validation');
          console.warn('[Customsforge] Note: The website may have bot protection. Try:');
          console.warn('[Customsforge]   1. Login to customsforge.com in your browser first');
          console.warn('[Customsforge]   2. Wait a few minutes and try again');
          console.warn('[Customsforge]   3. Check if your account is active');
        }
      } else {
        console.log('[Customsforge] No credentials provided - songs will be added without validation');
      }

      // Start web server
      this.webServer.start();
      console.log(`[Web] Server started on http://localhost:${this.settings.web.port}`);
      
      // Start tunnel if enabled
      if (this.settings.ngrok.enabled && this.settings.ngrok.authToken) {
        try {
          console.log('[Ngrok] Starting tunnel...');
          tunnel = await ngrok.connect({
            addr: this.settings.web.port,
            authtoken: this.settings.ngrok.authToken,
          });
          this.tunnelUrl = tunnel.url();
          this.urls.public = this.tunnelUrl || undefined;
          
          // Update config with public URL
          const config = this.settingsToConfig(this.settings);
          config.web.baseUrl = this.tunnelUrl || config.web.baseUrl;
          
          console.log(`[Ngrok] Public URL: ${this.tunnelUrl}`);
        } catch (error: any) {
          console.error('[Ngrok] Failed to start:', error.message);
          console.error('[Ngrok] Make sure your auth token is correct.');
        }
      }

      // Connect to Twitch
      const twitchConfig = this.settings.twitch;
      if (twitchConfig.username && twitchConfig.oauthToken && twitchConfig.channel) {
        try {
          console.log(`[Twitch] Attempting to connect as ${twitchConfig.username} to #${twitchConfig.channel}...`);
          this.twitchClient = new TwitchClient(twitchConfig);
          this.setupChatHandler(this.twitchClient);
          this.setupTwitchVIPHandlers(this.twitchClient);
          await this.twitchClient.connect();
          console.log('[Twitch] Successfully connected!');
        } catch (error: any) {
          console.error('[Twitch] Failed to connect:', error.message);
          console.error('[Twitch] Check your OAuth token and channel name.');
        }
      } else {
        console.log('[Twitch] Skipped - missing credentials');
      }

      // Connect to YouTube
      const ytConfig = this.settings.youtube;
      if (ytConfig.apiKey || ytConfig.clientId) {
        try {
          console.log('[YouTube] Attempting to connect...');
          this.youtubeClient = new YouTubeClient(ytConfig);
          this.setupChatHandler(this.youtubeClient);
          this.setupYouTubeVIPHandlers(this.youtubeClient);
          await this.youtubeClient.connect();
          // Only log success if client actually connected (has liveChatId)
          if (this.youtubeClient.isActive()) {
            console.log('[YouTube] Successfully connected!');
          }
        } catch (error: any) {
          console.error('[YouTube] Failed to connect:', error.message);
        }
      } else {
        console.log('[YouTube] Skipped - no API key provided');
      }

      this.isRunning = true;
      return { success: true, urls: this.urls };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private setupChatHandler(client: ChatClient): void {
    client.onMessage(async (message: ChatMessage) => {
      const reply = async (text: string) => {
        await client.sendMessage(text);
      };
      await this.commandProcessor.processMessage(message, reply);
    });
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.twitchClient) {
      await this.twitchClient.disconnect();
      this.twitchClient = null;
    }

    if (this.youtubeClient) {
      await this.youtubeClient.disconnect();
      this.youtubeClient = null;
    }

    if (tunnel) {
      await ngrok.disconnect();
      tunnel = null;
      this.tunnelUrl = null;
    }

    this.webServer.stop();
  }

  getStatus(): BotStatus {
    return {
      running: this.isRunning,
      urls: this.urls,
      platforms: {
        twitch: this.twitchClient !== null,
        youtube: this.youtubeClient !== null,
      },
    };
  }

  getQueue() {
    return this.queueManager.getQueueForDisplay();
  }

  nextSong() {
    const next = this.queueManager.popNextRequest();
    return { success: true, song: next };
  }

  skipSong() {
    const { nowPlaying } = this.queueManager.getQueueForDisplay();
    if (nowPlaying) {
      this.queueManager.skipRequest(nowPlaying.id);
      return { success: true };
    }
    const next = this.queueManager.getNextRequest();
    if (next) {
      this.queueManager.skipRequest(next.id);
      return { success: true };
    }
    return { success: false };
  }

  clearQueue() {
    const count = this.queueManager.clearQueue();
    return { success: true, count };
  }

  markPlayed() {
    const { nowPlaying } = this.queueManager.getQueueForDisplay();
    if (nowPlaying) {
      this.queueManager.markCompleted(nowPlaying.id);
      return { success: true };
    }
    return { success: false };
  }

  reorderQueue(fromIndex: number, toIndex: number) {
    this.queueManager.reorderQueue(fromIndex, toIndex);
    return { success: true };
  }

  removeQueueItem(index: number) {
    const removed = this.queueManager.removePendingAt(index);
    return { success: !!removed };
  }

  /**
   * Get Customsforge authentication status
   */
  getCustomsforgeStatus(): { authenticated: boolean; username: string } {
    return {
      authenticated: this.customsforge.isAuthenticated(),
      username: this.settings.customsforge.username || '',
    };
  }

  /**
   * Test Customsforge login with current credentials
   */
  async testCustomsforgeLogin(): Promise<{ success: boolean; message: string }> {
    if (!this.settings.customsforge.username || !this.settings.customsforge.password) {
      return { success: false, message: 'No credentials provided' };
    }
    
    // Force re-login to test credentials
    const loggedIn = await this.customsforge.login(true);
    if (loggedIn) {
      return { success: true, message: `Logged in as ${this.settings.customsforge.username}` };
    } else {
      return { success: false, message: 'Login failed - check username and password' };
    }
  }

  // ============================================
  // VIP Token System Handlers
  // ============================================

  private setupTwitchVIPHandlers(client: TwitchClient): void {
    // Handle subscriptions
    client.onSubscription((event) => {
      this.vipTokenService.handleTwitchSubscription(
        event.userId,
        event.displayName,
        event.tier,
        event.months
      );
    });

    // Handle bits
    client.onBits((event) => {
      this.vipTokenService.handleTwitchBits(
        event.userId,
        event.displayName,
        event.bits
      );
    });
  }

  private setupYouTubeVIPHandlers(client: YouTubeClient): void {
    // Handle memberships
    client.onMembership((event) => {
      this.vipTokenService.handleYouTubeMembership(
        event.channelId,
        event.displayName,
        event.levelName
      );
    });

    // Handle Super Chats
    client.onSuperChat((event) => {
      this.vipTokenService.handleYouTubeSuperChat(
        event.channelId,
        event.displayName,
        event.amountMicros,
        event.currency
      );
    });
  }

  // ============================================
  // VIP Token Public Methods
  // ============================================

  /**
   * Get all VIP users
   */
  getVIPUsers(): VIPUser[] {
    return this.vipTokenService.getAllUsers();
  }

  /**
   * Search VIP users by name
   */
  searchVIPUsers(query: string): VIPUser[] {
    return this.vipTokenService.searchUsers(query);
  }

  /**
   * Get a specific user's VIP info
   */
  getVIPUser(platform: 'twitch' | 'youtube', platformUserId: string): VIPUser | null {
    return this.vipTokenService.getUser(platform, platformUserId);
  }

  /**
   * Get a user's token balance
   */
  getVIPBalance(platform: 'twitch' | 'youtube', platformUserId: string): number {
    return this.vipTokenService.getBalance(platform, platformUserId);
  }

  /**
   * Manually set a user's tokens
   */
  setVIPUserTokens(
    platform: 'twitch' | 'youtube',
    platformUserId: string,
    displayName: string,
    tokens: number
  ): VIPUser {
    return this.vipTokenService.setUserTokens(platform, platformUserId, displayName, tokens);
  }

  /**
   * Award tokens to a user
   */
  awardVIPTokens(
    platform: 'twitch' | 'youtube',
    platformUserId: string,
    displayName: string,
    amount: number,
    description: string
  ): VIPUser {
    return this.vipTokenService.awardTokens(
      platform,
      platformUserId,
      displayName,
      amount,
      'manual',
      description
    );
  }

  /**
   * Award tokens by username (GUI-friendly)
   */
  awardVIPTokensByUsername(
    platform: 'twitch' | 'youtube',
    username: string,
    amount: number,
    description: string
  ): VIPUser {
    return this.vipTokenService.awardTokensByUsername(platform, username, amount, description);
  }

  /**
   * Set tokens by username (GUI-friendly)
   */
  setVIPTokensByUsername(
    platform: 'twitch' | 'youtube',
    username: string,
    tokens: number
  ): VIPUser {
    return this.vipTokenService.setTokensByUsername(platform, username, tokens);
  }
  /**
   * Get VIP token rates
   */
  getVIPRates(): VIPTokenRates {
    return this.vipTokenService.getRates();
  }

  /**
   * Update VIP token rates
   */
  setVIPRates(rates: Partial<VIPTokenRates>): void {
    this.vipTokenService.setRates(rates);
  }
}
