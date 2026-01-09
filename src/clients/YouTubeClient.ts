import { google, youtube_v3 } from 'googleapis';
import { ChatClient, ChatMessage, BotConfig } from '../types';

export interface YouTubeMembershipEvent {
  channelId: string;
  displayName: string;
  levelName?: string;
}

export interface YouTubeSuperChatEvent {
  channelId: string;
  displayName: string;
  amountMicros: number;
  currency: string;
  message?: string;
}

export type YouTubeMembershipHandler = (event: YouTubeMembershipEvent) => void;
export type YouTubeSuperChatHandler = (event: YouTubeSuperChatEvent) => void;

export class YouTubeClient implements ChatClient {
  private youtube: youtube_v3.Youtube;
  private liveChatId: string;
  private messageHandlers: ((message: ChatMessage) => void)[] = [];
  private membershipHandlers: YouTubeMembershipHandler[] = [];
  private superChatHandlers: YouTubeSuperChatHandler[] = [];
  private pollingInterval: NodeJS.Timeout | null = null;
  private nextPageToken: string | undefined;
  private isConnected: boolean = false;
  private hasOAuth: boolean = false;

  constructor(private config: BotConfig['youtube']) {
    this.liveChatId = config.liveChatId || '';
    
    // Initialize YouTube API client
    if (config.clientId && config.clientSecret && config.refreshToken) {
      // OAuth2 authentication (allows sending messages and auto-detecting streams)
      const oauth2Client = new google.auth.OAuth2(
        config.clientId,
        config.clientSecret
      );
      oauth2Client.setCredentials({
        refresh_token: config.refreshToken,
      });
      this.youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      this.hasOAuth = true;
    } else if (config.apiKey) {
      // API Key authentication (read-only, requires manual liveChatId)
      this.youtube = google.youtube({ version: 'v3', auth: config.apiKey });
      this.hasOAuth = false;
    } else {
      throw new Error('YouTube API key or OAuth credentials required');
    }
  }

  async connect(): Promise<void> {
    if (!this.liveChatId) {
      if (this.hasOAuth) {
        console.log('[YouTube] No live chat ID configured, attempting to find active stream...');
        await this.findActiveLiveChat();
      } else {
        console.log('[YouTube] No live chat ID configured.');
        console.log('[YouTube] To auto-detect streams, configure OAuth (clientId, clientSecret, refreshToken).');
        console.log('[YouTube] Or manually set the Live Chat ID in settings.');
        return;
      }
    }

    if (!this.liveChatId) {
      console.log('[YouTube] No active live stream found. YouTube client not started.');
      return;
    }

    this.isConnected = true;
    this.startPolling();
    console.log(`[YouTube] Connected to live chat: ${this.liveChatId}`);
  }

  private async findActiveLiveChat(): Promise<void> {
    try {
      // This requires OAuth to list the broadcaster's own streams
      const response = await this.youtube.liveBroadcasts.list({
        part: ['snippet', 'status'],
        broadcastStatus: 'active',
        broadcastType: 'all',
      });

      const broadcasts = response.data.items;
      if (broadcasts && broadcasts.length > 0) {
        const activeBroadcast = broadcasts[0];
        this.liveChatId = activeBroadcast.snippet?.liveChatId || '';
        console.log(`[YouTube] Found active broadcast: ${activeBroadcast.snippet?.title}`);
      }
    } catch (error) {
      console.error('[YouTube] Error finding active live chat:', error);
    }
  }

  private startPolling(): void {
    // Poll for new messages every 5 seconds (YouTube rate limits)
    this.pollingInterval = setInterval(() => this.pollMessages(), 5000);
    // Initial poll
    this.pollMessages();
  }

  private async pollMessages(): Promise<void> {
    if (!this.isConnected || !this.liveChatId) return;

    try {
      const response = await this.youtube.liveChatMessages.list({
        liveChatId: this.liveChatId,
        part: ['snippet', 'authorDetails'],
        pageToken: this.nextPageToken,
      });

      this.nextPageToken = response.data.nextPageToken || undefined;

      const messages = response.data.items || [];
      
      for (const msg of messages) {
        // Skip if we've already processed this (first poll)
        if (!this.nextPageToken) continue;

        const messageType = msg.snippet?.type;
        const authorDetails = msg.authorDetails;
        const snippet = msg.snippet;

        // Handle different message types
        switch (messageType) {
          case 'textMessageEvent':
            // Regular chat message
            const chatMessage: ChatMessage = {
              platform: 'youtube',
              username: authorDetails?.displayName || 'Anonymous',
              userId: authorDetails?.channelId || '',
              message: snippet?.displayMessage || '',
              timestamp: new Date(snippet?.publishedAt || Date.now()),
              isMod: authorDetails?.isChatModerator || false,
              isBroadcaster: authorDetails?.isChatOwner || false,
            };
            this.messageHandlers.forEach(handler => handler(chatMessage));
            break;

          case 'superChatEvent':
            // Super Chat payment
            const superChatDetails = snippet?.superChatDetails;
            if (superChatDetails) {
              const superChatEvent: YouTubeSuperChatEvent = {
                channelId: authorDetails?.channelId || '',
                displayName: authorDetails?.displayName || 'Anonymous',
                amountMicros: parseInt(superChatDetails.amountMicros || '0', 10),
                currency: superChatDetails.currency || 'USD',
                message: superChatDetails.userComment || undefined,
              };
              this.superChatHandlers.forEach(handler => handler(superChatEvent));
              
              // Also treat super chat message as a regular chat message if it has text
              if (superChatDetails.userComment) {
                const scChatMessage: ChatMessage = {
                  platform: 'youtube',
                  username: authorDetails?.displayName || 'Anonymous',
                  userId: authorDetails?.channelId || '',
                  message: superChatDetails.userComment,
                  timestamp: new Date(snippet?.publishedAt || Date.now()),
                  isMod: authorDetails?.isChatModerator || false,
                  isBroadcaster: authorDetails?.isChatOwner || false,
                };
                this.messageHandlers.forEach(handler => handler(scChatMessage));
              }
            }
            break;

          case 'superStickerEvent':
            // Super Sticker (similar to Super Chat but with stickers)
            const stickerDetails = snippet?.superStickerDetails;
            if (stickerDetails) {
              const stickerEvent: YouTubeSuperChatEvent = {
                channelId: authorDetails?.channelId || '',
                displayName: authorDetails?.displayName || 'Anonymous',
                amountMicros: parseInt(stickerDetails.amountMicros || '0', 10),
                currency: stickerDetails.currency || 'USD',
              };
              this.superChatHandlers.forEach(handler => handler(stickerEvent));
            }
            break;

          case 'newSponsorEvent':
            // New channel membership
            // Note: memberLevelName may not be in TypeScript types but exists in API response
            const membershipEvent: YouTubeMembershipEvent = {
              channelId: authorDetails?.channelId || '',
              displayName: authorDetails?.displayName || 'Anonymous',
              levelName: (snippet as any)?.memberLevelName || undefined,
            };
            this.membershipHandlers.forEach(handler => handler(membershipEvent));
            break;

          case 'memberMilestoneChatEvent':
            // Membership milestone (resub)
            const milestoneEvent: YouTubeMembershipEvent = {
              channelId: authorDetails?.channelId || '',
              displayName: authorDetails?.displayName || 'Anonymous',
              levelName: (snippet as any)?.memberLevelName || undefined,
            };
            this.membershipHandlers.forEach(handler => handler(milestoneEvent));
            break;

          case 'membershipGiftingEvent':
            // Gift memberships - credit the gifter
            // Note: giftMembershipsCount may not be in TypeScript types but exists in API response
            const giftCount = (snippet as any)?.giftMembershipsCount || 1;
            for (let i = 0; i < giftCount; i++) {
              const giftEvent: YouTubeMembershipEvent = {
                channelId: authorDetails?.channelId || '',
                displayName: authorDetails?.displayName || 'Anonymous',
                levelName: (snippet as any)?.giftMembershipsLevelName || undefined,
              };
              this.membershipHandlers.forEach(handler => handler(giftEvent));
            }
            break;
        }
      }
    } catch (error: any) {
      if (error.code === 403) {
        console.error('[YouTube] API quota exceeded or insufficient permissions');
      } else if (error.code === 404) {
        console.error('[YouTube] Live chat not found. Stream may have ended.');
        this.isConnected = false;
        this.stopPolling();
      } else {
        console.error('[YouTube] Error polling messages:', error.message);
      }
    }
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.stopPolling();
    console.log('[YouTube] Disconnected');
  }

  /**
   * Check if the client is actively connected to a live chat
   */
  isActive(): boolean {
    return this.isConnected && !!this.liveChatId;
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.liveChatId) {
      console.warn('[YouTube] Cannot send message - no live chat connected');
      return;
    }

    try {
      await this.youtube.liveChatMessages.insert({
        part: ['snippet'],
        requestBody: {
          snippet: {
            liveChatId: this.liveChatId,
            type: 'textMessageEvent',
            textMessageDetails: {
              messageText: message,
            },
          },
        },
      });
    } catch (error: any) {
      console.error('[YouTube] Error sending message:', error.message);
    }
  }

  onMessage(handler: (message: ChatMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Register a handler for membership events (new members and milestones)
   */
  onMembership(handler: YouTubeMembershipHandler): void {
    this.membershipHandlers.push(handler);
  }

  /**
   * Register a handler for Super Chat/Sticker events
   */
  onSuperChat(handler: YouTubeSuperChatHandler): void {
    this.superChatHandlers.push(handler);
  }
}
