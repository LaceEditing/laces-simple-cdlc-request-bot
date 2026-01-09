import { loadConfig } from './config';
import { TwitchClient, YouTubeClient } from './clients';
import { QueueManager, CustomsforgeService } from './services';
import { CommandProcessor } from './commands';
import { WebServer } from './web';
import { ChatClient, ChatMessage, BotConfig } from './types';

class RocksmithRequestBot {
  private config: BotConfig;
  private twitchClient: TwitchClient | null = null;
  private youtubeClient: YouTubeClient | null = null;
  private queueManager: QueueManager;
  private customsforge: CustomsforgeService;
  private commandProcessor: CommandProcessor;
  private webServer: WebServer;

  constructor() {
    this.config = loadConfig();
    
    // Initialize services
    this.queueManager = new QueueManager(
      this.config.limits.maxRequestsPerUser,
      this.config.limits.cooldownSeconds
    );
    this.customsforge = new CustomsforgeService();
    
    // Initialize command processor
    this.commandProcessor = new CommandProcessor(
      this.queueManager,
      this.customsforge,
      this.config
    );

    // Initialize web server
    this.webServer = new WebServer(this.queueManager, this.config);
  }

  async start(): Promise<void> {
    console.log('='.repeat(50));
    console.log('🎸 Rocksmith Song Request Bot');
    console.log('='.repeat(50));

    // Start web server
    this.webServer.start();

    // Connect to Twitch
    if (this.config.twitch.username && this.config.twitch.oauthToken) {
      try {
        this.twitchClient = new TwitchClient(this.config.twitch);
        this.setupChatHandler(this.twitchClient);
        await this.twitchClient.connect();
      } catch (error) {
        console.error('[Twitch] Failed to connect:', error);
      }
    } else {
      console.log('[Twitch] Not configured - skipping');
    }

    // Connect to YouTube
    if (this.config.youtube.apiKey || this.config.youtube.clientId) {
      try {
        this.youtubeClient = new YouTubeClient(this.config.youtube);
        this.setupChatHandler(this.youtubeClient);
        await this.youtubeClient.connect();
      } catch (error) {
        console.error('[YouTube] Failed to connect:', error);
      }
    } else {
      console.log('[YouTube] Not configured - skipping');
    }

    // Check if at least one platform is connected
    if (!this.twitchClient && !this.youtubeClient) {
      console.error('\n⚠️  No chat platforms configured!');
      console.error('Please configure at least one platform in your .env file.');
      console.error('See .env.example for configuration options.\n');
    }

    console.log('='.repeat(50));
    console.log('Bot is running! Press Ctrl+C to stop.');
    console.log(`Queue page: ${this.config.web.baseUrl}/queue`);
    console.log('='.repeat(50));

    // Handle shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  private setupChatHandler(client: ChatClient): void {
    client.onMessage(async (message: ChatMessage) => {
      // Create a reply function bound to the correct client
      const reply = async (text: string) => {
        await client.sendMessage(text);
      };

      await this.commandProcessor.processMessage(message, reply);
    });
  }

  private async shutdown(): Promise<void> {
    console.log('\nShutting down...');

    if (this.twitchClient) {
      await this.twitchClient.disconnect();
    }
    if (this.youtubeClient) {
      await this.youtubeClient.disconnect();
    }
    this.webServer.stop();

    console.log('Goodbye! 👋');
    process.exit(0);
  }
}

// Start the bot
const bot = new RocksmithRequestBot();
bot.start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
