import * as tmi from 'tmi.js';
import { ChatClient, ChatMessage, BotConfig } from '../types';

export class TwitchClient implements ChatClient {
  private client: tmi.Client;
  private channel: string;
  private messageHandlers: ((message: ChatMessage) => void)[] = [];

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

    this.client.on('connected', (addr, port) => {
      console.log(`[Twitch] Connected to ${addr}:${port}`);
    });

    this.client.on('disconnected', (reason) => {
      console.log(`[Twitch] Disconnected: ${reason}`);
    });
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
}
