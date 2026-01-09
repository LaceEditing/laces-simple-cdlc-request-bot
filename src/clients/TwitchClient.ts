import * as tmi from 'tmi.js';
import { ChatClient, ChatMessage, BotConfig } from '../types';

export interface TwitchSubscriptionEvent {
  userId: string;
  displayName: string;
  tier: 'Prime' | '1000' | '2000' | '3000';
  months?: number;
  isGift: boolean;
  gifterId?: string;
  gifterName?: string;
}

export interface TwitchBitsEvent {
  userId: string;
  displayName: string;
  bits: number;
}

export type TwitchSubscriptionHandler = (event: TwitchSubscriptionEvent) => void;
export type TwitchBitsHandler = (event: TwitchBitsEvent) => void;

export class TwitchClient implements ChatClient {
  private client: tmi.Client;
  private channel: string;
  private messageHandlers: ((message: ChatMessage) => void)[] = [];
  private subscriptionHandlers: TwitchSubscriptionHandler[] = [];
  private bitsHandlers: TwitchBitsHandler[] = [];

  constructor(config: BotConfig['twitch']) {
    this.channel = config.channel;
    
    this.client = new tmi.Client({
      options: { debug: false },
      connection: {
        secure: true,
        reconnect: true,
      },
      identity: {
        username: config.username,
        password: config.oauthToken,
      },
      channels: [config.channel],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('message', (channel, tags, message, self) => {
      // Ignore messages from the bot itself
      if (self) return;

      const chatMessage: ChatMessage = {
        platform: 'twitch',
        username: tags['display-name'] || tags.username || 'Anonymous',
        userId: tags['user-id'] || '',
        message: message,
        timestamp: new Date(),
        isMod: tags.mod === true,
        isBroadcaster: tags.badges?.broadcaster === '1',
      };

      this.messageHandlers.forEach(handler => handler(chatMessage));
    });

    // Handle subscriptions (new subs and resubs)
    this.client.on('subscription', (channel, username, method, message, userstate) => {
      const event: TwitchSubscriptionEvent = {
        userId: userstate['user-id'] || '',
        displayName: userstate['display-name'] || username,
        tier: this.parseTier(method.plan),
        months: 1,
        isGift: false,
      };
      this.subscriptionHandlers.forEach(handler => handler(event));
    });

    this.client.on('resub', (channel, username, months, message, userstate, methods) => {
      const event: TwitchSubscriptionEvent = {
        userId: userstate['user-id'] || '',
        displayName: userstate['display-name'] || username,
        tier: this.parseTier(methods.plan),
        months: months,
        isGift: false,
      };
      this.subscriptionHandlers.forEach(handler => handler(event));
    });

    // Handle gift subs - credit goes to the gifter
    this.client.on('subgift', (channel, username, streakMonths, recipient, methods, userstate) => {
      const event: TwitchSubscriptionEvent = {
        userId: userstate['user-id'] || '',
        displayName: userstate['display-name'] || username,
        tier: this.parseTier(methods.plan),
        months: 1,
        isGift: true,
        gifterId: userstate['user-id'] || '',
        gifterName: userstate['display-name'] || username,
      };
      // Award tokens to the gifter, not the recipient
      this.subscriptionHandlers.forEach(handler => handler(event));
    });

    // Handle community gift subs (mystery gifts)
    this.client.on('submysterygift', (channel, username, numbOfSubs, methods, userstate) => {
      // Award tokens for each gift sub in the mystery gift
      for (let i = 0; i < numbOfSubs; i++) {
        const event: TwitchSubscriptionEvent = {
          userId: userstate['user-id'] || '',
          displayName: userstate['display-name'] || username,
          tier: this.parseTier(methods.plan),
          months: 1,
          isGift: true,
          gifterId: userstate['user-id'] || '',
          gifterName: userstate['display-name'] || username,
        };
        this.subscriptionHandlers.forEach(handler => handler(event));
      }
    });

    // Handle bits/cheers
    this.client.on('cheer', (channel, userstate, message) => {
      const bits = parseInt(userstate.bits || '0', 10);
      if (bits > 0) {
        const event: TwitchBitsEvent = {
          userId: userstate['user-id'] || '',
          displayName: userstate['display-name'] || 'Anonymous',
          bits: bits,
        };
        this.bitsHandlers.forEach(handler => handler(event));
      }
    });

    this.client.on('connected', (addr, port) => {
      console.log(`[Twitch] Connected to ${addr}:${port}`);
    });

    this.client.on('disconnected', (reason) => {
      console.log(`[Twitch] Disconnected: ${reason}`);
    });
  }

  private parseTier(plan: string | undefined): 'Prime' | '1000' | '2000' | '3000' {
    switch (plan) {
      case 'Prime':
        return 'Prime';
      case '2000':
        return '2000';
      case '3000':
        return '3000';
      default:
        return '1000'; // Tier 1 is the default
    }
  }

  async connect(): Promise<void> {
    await this.client.connect();
    console.log(`[Twitch] Joined channel: ${this.channel}`);
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  async sendMessage(message: string): Promise<void> {
    await this.client.say(this.channel, message);
  }

  onMessage(handler: (message: ChatMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Register a handler for subscription events
   */
  onSubscription(handler: TwitchSubscriptionHandler): void {
    this.subscriptionHandlers.push(handler);
  }

  /**
   * Register a handler for bits/cheer events
   */
  onBits(handler: TwitchBitsHandler): void {
    this.bitsHandlers.push(handler);
  }
}
