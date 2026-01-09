import { ChatMessage, CommandContext, CommandHandler, BotConfig } from '../types';
import { QueueManager, CustomsforgeService } from '../services';

export class CommandProcessor {
  private commands: Map<string, CommandHandler> = new Map();
  private prefix: string = '!';

  constructor(
    private queueManager: QueueManager,
    private customsforge: CustomsforgeService,
    private config: BotConfig,
    private getPublicUrl?: () => string
  ) {
    this.registerCommands();
  }

  private registerCommands(): void {
    // User commands
    this.commands.set('request', this.handleRequest.bind(this));
    this.commands.set('sr', this.handleRequest.bind(this)); // Alias
    this.commands.set('list', this.handleList.bind(this));
    this.commands.set('queue', this.handleList.bind(this)); // Alias
    this.commands.set('song', this.handleCurrentSong.bind(this));
    this.commands.set('position', this.handlePosition.bind(this));
    this.commands.set('myqueue', this.handleMyQueue.bind(this));
    this.commands.set('remove', this.handleRemove.bind(this));
    this.commands.set('help', this.handleHelp.bind(this));

    // Mod/Broadcaster commands
    this.commands.set('next', this.handleNext.bind(this));
    this.commands.set('played', this.handlePlayed.bind(this));
    this.commands.set('skip', this.handleSkip.bind(this));
    this.commands.set('clear', this.handleClear.bind(this));
  }

  async processMessage(message: ChatMessage, sendReply: (text: string) => Promise<void>): Promise<void> {
    const text = message.message.trim();
    
    if (!text.startsWith(this.prefix)) {
      return;
    }

    const parts = text.slice(this.prefix.length).split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);

    const handler = this.commands.get(commandName);
    if (!handler) {
      return;
    }

    const ctx: CommandContext = {
      message,
      args,
      reply: sendReply,
    };

    try {
      await handler(ctx);
    } catch (error) {
      console.error(`[Command] Error handling ${commandName}:`, error);
      await sendReply('Sorry, something went wrong processing your request.');
    }
  }

  // ============ User Commands ============

  private guessArtistTitleFromFreeform(requestText: string): { artist: string; title: string } {
    const words = requestText.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) {
      return { artist: '', title: requestText.trim() };
    }

    const hasAnyUppercase = /[A-Z]/.test(requestText);
    const isAllLowercase = !hasAnyUppercase;

    // If user typed all-lowercase, assume "artist title".
    if (isAllLowercase) {
      return { artist: words[0], title: words.slice(1).join(' ') };
    }

    // If exactly two words and first is capitalized but second is not, assume artist/title.
    if (words.length === 2) {
      const [w1, w2] = words;
      const w1Cap = w1[0] === w1[0].toUpperCase();
      const w2Cap = w2[0] === w2[0].toUpperCase();
      if (w1Cap && !w2Cap) {
        return { artist: w1, title: w2 };
      }
    }

    // Otherwise, don't guess; treat as a raw search query.
    return { artist: '', title: requestText.trim() };
  }

  private findBestMatch(songs: any[], searchArtist: string, searchTitle: string): any {
    const lowerArtist = searchArtist.toLowerCase();
    const lowerTitle = searchTitle.toLowerCase();
    const fullQuery = `${searchArtist} ${searchTitle}`.trim().toLowerCase();
    const queryWords = fullQuery.split(/\s+/).filter(w => w.length > 2);
    
    // Score each song based on how well it matches
    const scored = songs.map(song => {
      let score = 0;
      const songArtist = song.artist.toLowerCase();
      const songTitle = song.title.toLowerCase();
      const songCombined = `${songArtist} ${songTitle}`.trim();
      
      // Exact artist match = +10
      if (songArtist === lowerArtist) score += 10;
      // Artist contains search = +5
      else if (lowerArtist && songArtist.includes(lowerArtist)) score += 5;
      // Search contains artist = +3
      else if (lowerArtist && lowerArtist.includes(songArtist)) score += 3;
      
      // Exact title match = +10
      if (songTitle === lowerTitle) score += 10;
      // Title contains search = +5  
      else if (songTitle.includes(lowerTitle)) score += 5;
      // Search contains title = +3
      else if (lowerTitle.includes(songTitle)) score += 3;
      
      // Bonus: both artist and title match words
      const titleWords = lowerTitle.split(/\s+/).filter(w => w.length > 2);
      const matchingWords = titleWords.filter(w => songTitle.includes(w));
      score += matchingWords.length * 2;

      // Extra: overall query token overlap (artist+title together)
      if (queryWords.length > 0) {
        const combinedMatches = queryWords.filter(w => songCombined.includes(w));
        score += combinedMatches.length * 2;

        // If we matched most of the query tokens, boost.
        if (combinedMatches.length >= Math.max(2, Math.ceil(queryWords.length * 0.7))) {
          score += 5;
        }
      }
      
      return { song, score };
    });
    
    // Sort by score and return best match
    scored.sort((a, b) => b.score - a.score);
    
    console.log(`[Request] Best match scores:`, scored.slice(0, 3).map(s => 
      `${s.song.artist} - ${s.song.title} (score: ${s.score})`
    ));
    
    return scored[0].song;
  }

  private async handleRequest(ctx: CommandContext): Promise<void> {
    const { message, args, reply } = ctx;
    
    if (args.length === 0) {
      await reply('Usage: !request <artist> - <song title> (e.g., !request Green Day - American Idiot)');
      return;
    }

    // Check if user can make a request
    const canRequest = this.queueManager.canUserRequest(message.userId, message.platform);
    if (!canRequest.allowed) {
      await reply(`@${message.username} ${canRequest.reason}`);
      return;
    }

    const requestText = args.join(' ');
    const parsed = this.customsforge.parseRequest(requestText);

    const explicit = parsed || { artist: '', title: requestText };
    const guess = this.guessArtistTitleFromFreeform(requestText);

    // Use explicit parsing only when user used an explicit format.
    const isExplicitFormat = requestText.includes(' - ') || /\s+by\s+/i.test(requestText);
    const effective = isExplicitFormat ? explicit : guess;

    if (!parsed) {
      await reply(`@${message.username} Could not parse your request. Try: !request Artist - Song Title`);
      return;
    }

    // Search for the song on Customsforge
    // Try multiple search strategies
    let searchResult;
    let song: any = null;
    
    // Strategy 1: Search with full query
    searchResult = await this.customsforge.searchSong(requestText);
    
    // Strategy 2: If we have a reasonable artist/title guess, try "artist title" format
    if ((!searchResult.found || searchResult.songs.length === 0) && effective.artist) {
      console.log(`[Request] Trying artist-specific search: ${effective.artist} ${effective.title}`);
      searchResult = await this.customsforge.searchSong(`${effective.artist} ${effective.title}`);
    }
    
    // Strategy 3: Just search the title if we have one
    if ((!searchResult.found || searchResult.songs.length === 0) && effective.title && effective.title !== requestText) {
      console.log(`[Request] Trying title-only search: ${effective.title}`);
      searchResult = await this.customsforge.searchSong(effective.title);
    }

    if (searchResult.found && searchResult.songs.length > 0) {
      // Find best match from results
      // Score against the full request text (plus any guessed artist/title when available)
      const scoreArtist = effective.artist;
      const scoreTitle = effective.title || requestText;
      song = this.findBestMatch(searchResult.songs, scoreArtist, scoreTitle);
      console.log(`[Request] Found match: ${song.artist} - ${song.title}`);
    } else {
      // If Customsforge search fails, allow the request anyway with parsed info
      console.log(`[Request] Customsforge search failed, allowing request anyway`);
      song = {
        artist: effective.artist || 'Unknown Artist',
        title: effective.title || requestText,
        album: undefined,
        customsforgeUrl: undefined,
      };
    }

    // Check if song is already in queue
    if (this.queueManager.isSongInQueue(song.artist, song.title)) {
      await reply(`@${message.username} "${song.artist} - ${song.title}" is already in the queue!`);
      return;
    }

    // Add to queue
    const request = this.queueManager.addRequest(song, message.userId, message.username, message.platform);
    const position = this.queueManager.getQueuePosition(request.id);

    await reply(
      `@${message.username} Added "${song.artist} - ${song.title}" to the queue! ` +
      `Position: #${position} | Queue length: ${this.queueManager.getQueueLength()}`
    );
  }

  private async handleList(ctx: CommandContext): Promise<void> {
    const { message, reply } = ctx;
    // Use public URL if available, otherwise fall back to config
    const baseUrl = this.getPublicUrl ? this.getPublicUrl() : this.config.web.baseUrl;
    const listUrl = `${baseUrl}/queue`;
    const queueLength = this.queueManager.getQueueLength();

    if (queueLength === 0) {
      await reply(`@${message.username} The queue is empty! Be the first to request with !request`);
    } else {
      await reply(`@${message.username} ${queueLength} song(s) in queue. View the list: ${listUrl}`);
    }
  }

  private async handleCurrentSong(ctx: CommandContext): Promise<void> {
    const { message, reply } = ctx;
    const { nowPlaying } = this.queueManager.getQueueForDisplay();

    if (nowPlaying) {
      await reply(`@${message.username} Now playing: "${nowPlaying.song.artist} - ${nowPlaying.song.title}" (requested by ${nowPlaying.requestedBy})`);
    } else {
      const next = this.queueManager.getNextRequest();
      if (next) {
        await reply(`@${message.username} Up next: "${next.song.artist} - ${next.song.title}" (requested by ${next.requestedBy})`);
      } else {
        await reply(`@${message.username} No songs in queue. Request one with !request`);
      }
    }
  }

  private async handlePosition(ctx: CommandContext): Promise<void> {
    const { message, reply } = ctx;
    const userRequests = this.queueManager.getUserRequests(message.username, message.platform);

    if (userRequests.length === 0) {
      await reply(`@${message.username} You don't have any songs in the queue.`);
      return;
    }

    const positions = userRequests.map(r => {
      const pos = this.queueManager.getQueuePosition(r.id);
      return `"${r.song.title}" (#${pos})`;
    });

    await reply(`@${message.username} Your requests: ${positions.join(', ')}`);
  }

  private async handleMyQueue(ctx: CommandContext): Promise<void> {
    // Alias for position
    await this.handlePosition(ctx);
  }

  private async handleRemove(ctx: CommandContext): Promise<void> {
    const { message, reply } = ctx;
    const removed = this.queueManager.removeUserRequest(message.username, message.platform);

    if (removed) {
      await reply(`@${message.username} Removed "${removed.song.artist} - ${removed.song.title}" from the queue.`);
    } else {
      await reply(`@${message.username} You don't have any songs in the queue to remove.`);
    }
  }

  private async handleHelp(ctx: CommandContext): Promise<void> {
    const { message, reply } = ctx;
    await reply(
      `@${message.username} Commands: !request <song> - Request a song | !list - View queue | ` +
      `!song - Current/next song | !myqueue - Your requests | !remove - Remove your last request | !help - Show commands`
    );
  }

  // ============ Mod/Broadcaster Commands ============

  private isMod(message: ChatMessage): boolean {
    return message.isMod || message.isBroadcaster;
  }

  private async handleNext(ctx: CommandContext): Promise<void> {
    const { message, reply } = ctx;
    
    if (!this.isMod(message)) {
      return;
    }

    const next = this.queueManager.popNextRequest();
    if (next) {
      await reply(`Now playing: "${next.song.artist} - ${next.song.title}" (requested by ${next.requestedBy})`);
    } else {
      await reply('The queue is empty!');
    }
  }

  private async handlePlayed(ctx: CommandContext): Promise<void> {
    const { message, reply } = ctx;
    
    if (!this.isMod(message)) {
      return;
    }

    const { nowPlaying } = this.queueManager.getQueueForDisplay();
    if (nowPlaying) {
      this.queueManager.markCompleted(nowPlaying.id);
      const next = this.queueManager.getNextRequest();
      if (next) {
        await reply(`Marked as played! Up next: "${next.song.artist} - ${next.song.title}"`);
      } else {
        await reply('Marked as played! Queue is now empty.');
      }
    } else {
      await reply('No song is currently playing.');
    }
  }

  private async handleSkip(ctx: CommandContext): Promise<void> {
    const { message, args, reply } = ctx;
    
    if (!this.isMod(message)) {
      return;
    }

    // Skip current or by position
    if (args.length === 0) {
      const { nowPlaying } = this.queueManager.getQueueForDisplay();
      if (nowPlaying) {
        this.queueManager.skipRequest(nowPlaying.id);
        await reply(`Skipped "${nowPlaying.song.artist} - ${nowPlaying.song.title}"`);
      } else {
        const next = this.queueManager.getNextRequest();
        if (next) {
          this.queueManager.skipRequest(next.id);
          await reply(`Skipped "${next.song.artist} - ${next.song.title}"`);
        } else {
          await reply('Nothing to skip!');
        }
      }
    }
  }

  private async handleClear(ctx: CommandContext): Promise<void> {
    const { message, reply } = ctx;
    
    if (!message.isBroadcaster) {
      await reply('Only the broadcaster can clear the queue.');
      return;
    }

    const count = this.queueManager.clearQueue();
    await reply(`Cleared ${count} song(s) from the queue.`);
  }
}
