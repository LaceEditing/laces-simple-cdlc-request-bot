import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const VIP_FILE = path.join(DATA_DIR, 'vip-tokens.json');

export interface VIPUser {
  platform: 'twitch' | 'youtube';
  platformUserId: string;
  displayName: string;
  tokens: number;
  totalEarned: number;
  lastUpdated: Date;
  history: VIPTransaction[];
}

export interface VIPTransaction {
  timestamp: Date;
  type: 'subscription' | 'bits' | 'superchat' | 'manual' | 'spent';
  amount: number;
  description: string;
}

export interface VIPTokenRates {
  // Twitch subscription tiers
  twitchTier1: number;
  twitchTier2: number;
  twitchTier3: number;
  twitchPrime: number;
  // Twitch bits (tokens per X bits)
  twitchBitsAmount: number; // e.g., 250 bits
  twitchBitsTokens: number; // e.g., 1 token
  // YouTube membership tiers (mapped to Twitch equivalent)
  youtubeMember: number;        // Basic member ~ Tier 1
  youtubeSuperChat: number;     // Tokens per dollar (scaled similar to bits)
  youtubeSuperChatMinimum: number; // Minimum $ to earn tokens
}

export interface VIPTokenData {
  users: { [key: string]: VIPUser };
  rates: VIPTokenRates;
}

const DEFAULT_RATES: VIPTokenRates = {
  // Twitch rates
  twitchTier1: 1,
  twitchTier2: 2,
  twitchTier3: 4,
  twitchPrime: 1,
  twitchBitsAmount: 250,
  twitchBitsTokens: 1,
  // YouTube rates (equivalent to Twitch)
  // YouTube membership is ~$4.99/month like Twitch Tier 1
  youtubeMember: 1,
  // Super Chat: $5 = ~500 bits = 2 tokens (1 token per $2.50)
  youtubeSuperChat: 1,        // tokens per youtubeSuperChatMinimum dollars
  youtubeSuperChatMinimum: 2.50, // $2.50 = 1 token (similar to 250 bits)
};

export class VIPTokenService {
  private data: VIPTokenData;

  constructor() {
    console.log(`[VIP] Data directory: ${DATA_DIR}`);
    console.log(`[VIP] Data file: ${VIP_FILE}`);
    this.data = this.loadData();
    console.log(`[VIP] Loaded ${Object.keys(this.data.users).length} users`);
  }

  private loadData(): VIPTokenData {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(VIP_FILE)) {
        const content = fs.readFileSync(VIP_FILE, 'utf-8');
        const parsed = JSON.parse(content);
        console.log(`[VIP] Loaded data from file:`, Object.keys(parsed.users || {}).length, 'users');
        // Ensure rates exist with defaults
        return {
          users: parsed.users || {},
          rates: { ...DEFAULT_RATES, ...parsed.rates },
        };
      }
    } catch (error) {
      console.error('[VIP] Error loading data:', error);
    }

    return {
      users: {},
      rates: { ...DEFAULT_RATES },
    };
  }

  private saveData(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(VIP_FILE, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('[VIP] Error saving data:', error);
    }
  }

  /**
   * Generate a unique key for a user
   */
  private getUserKey(platform: 'twitch' | 'youtube', platformUserId: string): string {
    return `${platform}:${platformUserId}`;
  }

  /**
   * Find an existing user by displayName (case-insensitive) on the same platform
   */
  private findUserByDisplayName(platform: 'twitch' | 'youtube', displayName: string): { key: string; user: VIPUser } | null {
    const lowerName = displayName.toLowerCase();
    for (const [key, user] of Object.entries(this.data.users)) {
      if (user.platform === platform && user.displayName.toLowerCase() === lowerName) {
        return { key, user };
      }
    }
    return null;
  }

  /**
   * Get or create a user entry.
   * If a user with this exact platformUserId exists, use it.
   * Otherwise, check if a user with the same displayName exists (e.g., created via !givevip)
   * and migrate them to the correct userId.
   */
  private getOrCreateUser(platform: 'twitch' | 'youtube', platformUserId: string, displayName: string): VIPUser {
    const key = this.getUserKey(platform, platformUserId);
    
    // Check if user exists with this exact key
    if (this.data.users[key]) {
      // Update display name if it changed
      this.data.users[key].displayName = displayName;
      return this.data.users[key];
    }
    
    // Check if there's an existing user with the same displayName (created via !givevip with placeholder ID)
    const existingByName = this.findUserByDisplayName(platform, displayName);
    if (existingByName) {
      // Migrate the user to the correct platformUserId
      console.log(`[VIP] Migrating user ${displayName} from ${existingByName.key} to ${key}`);
      const migratedUser: VIPUser = {
        ...existingByName.user,
        platformUserId,
        displayName, // Update to proper casing
        lastUpdated: new Date(),
      };
      // Remove old entry and create new one with correct key
      delete this.data.users[existingByName.key];
      this.data.users[key] = migratedUser;
      return migratedUser;
    }
    
    // Create new user
    this.data.users[key] = {
      platform,
      platformUserId,
      displayName,
      tokens: 0,
      totalEarned: 0,
      lastUpdated: new Date(),
      history: [],
    };
    return this.data.users[key];
  }

  /**
   * Ensure a user exists in the system (creates entry if needed, updates displayName if exists)
   * Call this when a user interacts with VIP commands so they can be found later by displayName
   */
  ensureUser(platform: 'twitch' | 'youtube', platformUserId: string, displayName: string): VIPUser {
    const user = this.getOrCreateUser(platform, platformUserId, displayName);
    this.saveData();
    return user;
  }

  /**
   * Award tokens to a user
   */
  awardTokens(
    platform: 'twitch' | 'youtube',
    platformUserId: string,
    displayName: string,
    amount: number,
    type: VIPTransaction['type'],
    description: string
  ): VIPUser {
    const user = this.getOrCreateUser(platform, platformUserId, displayName);
    user.tokens += amount;
    user.totalEarned += amount;
    user.lastUpdated = new Date();
    user.history.push({
      timestamp: new Date(),
      type,
      amount,
      description,
    });
    
    // Keep history to last 100 entries
    if (user.history.length > 100) {
      user.history = user.history.slice(-100);
    }
    
    this.saveData();
    console.log(`[VIP] Awarded ${amount} tokens to ${displayName} (${platform}) - ${description}`);
    return user;
  }

  /**
   * Spend tokens for a VIP request
   */
  spendTokens(
    platform: 'twitch' | 'youtube',
    platformUserId: string,
    amount: number = 1
  ): { success: boolean; remainingTokens: number; error?: string } {
    const key = this.getUserKey(platform, platformUserId);
    const user = this.data.users[key];
    
    if (!user) {
      return { success: false, remainingTokens: 0, error: 'No VIP tokens found' };
    }
    
    if (user.tokens < amount) {
      return { success: false, remainingTokens: user.tokens, error: `Not enough tokens (have ${user.tokens}, need ${amount})` };
    }
    
    user.tokens -= amount;
    user.lastUpdated = new Date();
    user.history.push({
      timestamp: new Date(),
      type: 'spent',
      amount: -amount,
      description: 'VIP request',
    });
    
    this.saveData();
    return { success: true, remainingTokens: user.tokens };
  }

  /**
   * Get a user's token balance
   */
  getBalance(platform: 'twitch' | 'youtube', platformUserId: string): number {
    const key = this.getUserKey(platform, platformUserId);
    return this.data.users[key]?.tokens || 0;
  }

  /**
   * Get user info
   */
  getUser(platform: 'twitch' | 'youtube', platformUserId: string): VIPUser | null {
    const key = this.getUserKey(platform, platformUserId);
    return this.data.users[key] || null;
  }

  /**
   * Get all users
   */
  getAllUsers(): VIPUser[] {
    return Object.values(this.data.users);
  }

  /**
   * Search users by name
   */
  searchUsers(query: string): VIPUser[] {
    const lowerQuery = query.toLowerCase();
    return Object.values(this.data.users).filter(user =>
      user.displayName.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Find or create a user by username (for GUI operations where we don't have the real userId)
   * Uses displayName as the platformUserId placeholder if user doesn't exist
   */
  findOrCreateByUsername(platform: 'twitch' | 'youtube', username: string): VIPUser {
    // First, try to find existing user by displayName
    const existing = this.findUserByDisplayName(platform, username);
    if (existing) {
      return existing.user;
    }
    
    // Create new user with username as placeholder ID (will be migrated when they interact)
    const user = this.getOrCreateUser(platform, username.toLowerCase(), username);
    this.saveData();
    return user;
  }

  /**
   * Award tokens by username (for GUI operations)
   */
  awardTokensByUsername(
    platform: 'twitch' | 'youtube',
    username: string,
    amount: number,
    description: string = 'Manual award'
  ): VIPUser {
    const user = this.findOrCreateByUsername(platform, username);
    user.tokens += amount;
    user.totalEarned += amount;
    user.lastUpdated = new Date();
    user.history.push({
      timestamp: new Date(),
      type: 'manual',
      amount,
      description,
    });
    
    if (user.history.length > 100) {
      user.history = user.history.slice(-100);
    }
    
    this.saveData();
    console.log(`[VIP] Awarded ${amount} tokens to ${username} (${platform}) via GUI - ${description}`);
    return user;
  }

  /**
   * Set tokens by username (for GUI operations)
   */
  setTokensByUsername(
    platform: 'twitch' | 'youtube',
    username: string,
    tokens: number
  ): VIPUser {
    const user = this.findOrCreateByUsername(platform, username);
    const diff = tokens - user.tokens;
    user.tokens = tokens;
    user.lastUpdated = new Date();
    user.history.push({
      timestamp: new Date(),
      type: 'manual',
      amount: diff,
      description: 'Set via GUI',
    });
    
    this.saveData();
    console.log(`[VIP] Set ${username}'s tokens to ${tokens} (${platform}) via GUI`);
    return user;
  }

  /**
   * Get current token rates
   */
  getRates(): VIPTokenRates {
    return { ...this.data.rates };
  }

  /**
   * Update token rates
   */
  setRates(rates: Partial<VIPTokenRates>): void {
    this.data.rates = { ...this.data.rates, ...rates };
    this.saveData();
    console.log('[VIP] Token rates updated');
  }

  /**
   * Manually set a user's token balance
   */
  setUserTokens(
    platform: 'twitch' | 'youtube',
    platformUserId: string,
    displayName: string,
    tokens: number
  ): VIPUser {
    const user = this.getOrCreateUser(platform, platformUserId, displayName);
    const diff = tokens - user.tokens;
    user.tokens = tokens;
    user.lastUpdated = new Date();
    user.history.push({
      timestamp: new Date(),
      type: 'manual',
      amount: diff,
      description: 'Manual adjustment',
    });
    this.saveData();
    return user;
  }

  // ============================================
  // Twitch Event Handlers
  // ============================================

  /**
   * Handle Twitch subscription
   */
  handleTwitchSubscription(
    userId: string,
    displayName: string,
    tier: 'Prime' | '1000' | '2000' | '3000',
    months?: number
  ): VIPUser {
    let tokens: number;
    let tierName: string;
    
    switch (tier) {
      case 'Prime':
        tokens = this.data.rates.twitchPrime;
        tierName = 'Prime';
        break;
      case '1000':
        tokens = this.data.rates.twitchTier1;
        tierName = 'Tier 1';
        break;
      case '2000':
        tokens = this.data.rates.twitchTier2;
        tierName = 'Tier 2';
        break;
      case '3000':
        tokens = this.data.rates.twitchTier3;
        tierName = 'Tier 3';
        break;
      default:
        tokens = this.data.rates.twitchTier1;
        tierName = 'Unknown';
    }
    
    const monthStr = months && months > 1 ? ` (${months} months)` : '';
    return this.awardTokens(
      'twitch',
      userId,
      displayName,
      tokens,
      'subscription',
      `Twitch ${tierName} subscription${monthStr}`
    );
  }

  /**
   * Handle Twitch bits cheer
   */
  handleTwitchBits(userId: string, displayName: string, bits: number): VIPUser | null {
    const { twitchBitsAmount, twitchBitsTokens } = this.data.rates;
    
    if (bits < twitchBitsAmount) {
      console.log(`[VIP] ${displayName} cheered ${bits} bits (below ${twitchBitsAmount} threshold)`);
      return null;
    }
    
    // Calculate tokens: floor(bits / threshold) * tokensPerThreshold
    const tokens = Math.floor(bits / twitchBitsAmount) * twitchBitsTokens;
    
    return this.awardTokens(
      'twitch',
      userId,
      displayName,
      tokens,
      'bits',
      `Cheered ${bits} bits`
    );
  }

  // ============================================
  // YouTube Event Handlers
  // ============================================

  /**
   * Handle YouTube membership
   */
  handleYouTubeMembership(channelId: string, displayName: string, levelName?: string): VIPUser {
    return this.awardTokens(
      'youtube',
      channelId,
      displayName,
      this.data.rates.youtubeMember,
      'subscription',
      `YouTube membership${levelName ? ` (${levelName})` : ''}`
    );
  }

  /**
   * Handle YouTube Super Chat
   */
  handleYouTubeSuperChat(
    channelId: string,
    displayName: string,
    amountMicros: number,
    currency: string
  ): VIPUser | null {
    // Convert micros to dollars (amountMicros is in millionths)
    // Note: This assumes USD. For other currencies, you might want to add conversion
    const amountDollars = amountMicros / 1000000;
    
    const { youtubeSuperChat, youtubeSuperChatMinimum } = this.data.rates;
    
    if (amountDollars < youtubeSuperChatMinimum) {
      console.log(`[VIP] ${displayName} sent ${currency}${amountDollars.toFixed(2)} Super Chat (below $${youtubeSuperChatMinimum} threshold)`);
      return null;
    }
    
    // Calculate tokens: floor(amount / minimum) * tokensPerMinimum
    const tokens = Math.floor(amountDollars / youtubeSuperChatMinimum) * youtubeSuperChat;
    
    return this.awardTokens(
      'youtube',
      channelId,
      displayName,
      tokens,
      'superchat',
      `Super Chat ${currency}${amountDollars.toFixed(2)}`
    );
  }

  /**
   * Get data for export/display
   */
  getFullData(): VIPTokenData {
    return JSON.parse(JSON.stringify(this.data));
  }

  /**
   * Import data (merge with existing)
   */
  importData(importedData: Partial<VIPTokenData>): void {
    if (importedData.users) {
      this.data.users = { ...this.data.users, ...importedData.users };
    }
    if (importedData.rates) {
      this.data.rates = { ...this.data.rates, ...importedData.rates };
    }
    this.saveData();
  }
}
