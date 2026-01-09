// Common types used across the bot

export interface SongRequest {
  id: string;
  song: SongInfo;
  requestedBy: string;
  platform: 'twitch' | 'youtube';
  requestedAt: Date;
  status: 'pending' | 'playing' | 'completed' | 'skipped';
  isVIP?: boolean;
}

export interface SongInfo {
  artist: string;
  title: string;
  album?: string;
  tuning?: string;
  difficulty?: string;
  customsforgeId?: string;
  customsforgeUrl?: string;
}

export interface ChatMessage {
  platform: 'twitch' | 'youtube';
  username: string;
  userId: string;
  message: string;
  timestamp: Date;
  isMod: boolean;
  isBroadcaster: boolean;
}

export interface BotConfig {
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
  web: {
    port: number;
    baseUrl: string;
  };
  limits: {
    maxRequestsPerUser: number;
    cooldownSeconds: number;
  };
}

export interface CommandContext {
  message: ChatMessage;
  args: string[];
  reply: (text: string) => Promise<void>;
}

export type CommandHandler = (ctx: CommandContext) => Promise<void>;

export interface ChatClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(message: string): Promise<void>;
  onMessage(handler: (message: ChatMessage) => void): void;
}
