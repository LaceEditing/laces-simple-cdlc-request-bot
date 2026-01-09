import * as dotenv from 'dotenv';
import { BotConfig } from '../types';

dotenv.config();

export function loadConfig(): BotConfig {
  return {
    twitch: {
      username: process.env.TWITCH_USERNAME || '',
      oauthToken: process.env.TWITCH_OAUTH_TOKEN || '',
      channel: process.env.TWITCH_CHANNEL || '',
    },
    youtube: {
      apiKey: process.env.YOUTUBE_API_KEY,
      liveChatId: process.env.YOUTUBE_LIVE_CHAT_ID,
      clientId: process.env.YOUTUBE_CLIENT_ID,
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
      refreshToken: process.env.YOUTUBE_REFRESH_TOKEN,
    },
    web: {
      port: parseInt(process.env.WEB_PORT || '3000', 10),
      baseUrl: process.env.WEB_BASE_URL || 'http://localhost:3000',
    },
    limits: {
      maxRequestsPerUser: parseInt(process.env.MAX_REQUESTS_PER_USER || '3', 10),
      cooldownSeconds: parseInt(process.env.REQUEST_COOLDOWN_SECONDS || '10', 10),
    },
  };
}
