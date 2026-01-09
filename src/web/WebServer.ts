import express, { Application, Request, Response } from 'express';
import * as path from 'path';
import { QueueManager } from '../services';
import { BotConfig } from '../types';

export class WebServer {
  private app: Application;
  private server: any;

  constructor(
    private queueManager: QueueManager,
    private config: BotConfig
  ) {
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Add ngrok bypass header to all responses
    this.app.use((req: Request, res: Response, next) => {
      res.setHeader('ngrok-skip-browser-warning', '1');
      next();
    });

    // Serve static files
    this.app.use(express.static(path.join(__dirname, '../../public')));

    // API endpoint for queue data
    this.app.get('/api/queue', (req: Request, res: Response) => {
      const { pending, nowPlaying } = this.queueManager.getQueueForDisplay();
      res.json({
        nowPlaying,
        queue: pending,
        totalLength: pending.length,
        lastUpdated: new Date().toISOString(),
      });
    });

    // Queue page
    this.app.get('/queue', (req: Request, res: Response) => {
      res.send(this.generateQueuePage());
    });

    // Root redirect to queue
    this.app.get('/', (req: Request, res: Response) => {
      res.redirect('/queue');
    });
  }

  private generateQueuePage(): string {
    const { pending, nowPlaying } = this.queueManager.getQueueForDisplay();

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Song Request Queue - Rocksmith</title>
  <meta http-equiv="refresh" content="15">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #4d375a 0%, #6f4d85 50%, #8560a0 100%);
      min-height: 100vh;
      color: #fff;
      padding: 20px;
    }
    
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    
    h1 {
      text-align: center;
      margin-bottom: 30px;
      color: #f3eef8;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
      font-size: 2.5em;
    }
    
    .stats {
      display: flex;
      justify-content: center;
      gap: 30px;
      margin-bottom: 30px;
    }
    
    .stat-box {
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(10px);
      padding: 15px 30px;
      border-radius: 15px;
      text-align: center;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .stat-number {
      font-size: 2em;
      font-weight: bold;
      color: #e8e0f0;
    }
    
    .stat-label {
      font-size: 0.9em;
      opacity: 0.8;
    }
    
    .now-playing {
      background: linear-gradient(135deg, rgba(184, 159, 208, 0.9), rgba(157, 122, 186, 0.9));
      padding: 25px;
      border-radius: 20px;
      margin-bottom: 30px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .now-playing h2 {
      font-size: 1em;
      opacity: 0.9;
      margin-bottom: 10px;
      letter-spacing: 2px;
    }
    
    .now-playing .song-info {
      font-size: 1.5em;
      font-weight: bold;
    }
    
    .now-playing .requester {
      margin-top: 10px;
      opacity: 0.8;
    }
    
    .queue-section {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      padding: 25px;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .queue-section h2 {
      margin-bottom: 20px;
      color: #e8e0f0;
    }
    
    .queue-list {
      list-style: none;
    }
    
    .queue-item {
      background: rgba(255, 255, 255, 0.1);
      padding: 15px 20px;
      border-radius: 12px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 20px;
      transition: transform 0.2s, background 0.2s;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .queue-item:hover {
      background: rgba(255, 255, 255, 0.15);
      transform: translateX(5px);
    }
    
    .queue-position {
      background: linear-gradient(135deg, #b89fd0, #9d7aba);
      color: #fff;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    
    .queue-song {
      flex: 1;
    }
    
    .queue-song .title {
      font-weight: bold;
      font-size: 1.1em;
    }
    
    .queue-song .artist {
      opacity: 0.7;
    }
    
    .queue-meta {
      text-align: right;
      font-size: 0.85em;
      opacity: 0.8;
    }
    
    .queue-meta .platform {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 6px;
      font-size: 0.8em;
      margin-bottom: 5px;
      font-weight: 500;
    }
    
    .platform.twitch {
      background: #9146ff;
    }
    
    .platform.youtube {
      background: #ff0000;
    }
    
    /* VIP Request Styling */
    .queue-item.vip-request {
      background: linear-gradient(135deg, rgba(255, 215, 0, 0.25) 0%, rgba(255, 193, 7, 0.15) 100%);
      border: 2px solid rgba(255, 215, 0, 0.5);
      box-shadow: 0 0 15px rgba(255, 215, 0, 0.2);
    }
    
    .queue-item.vip-request:hover {
      background: linear-gradient(135deg, rgba(255, 215, 0, 0.35) 0%, rgba(255, 193, 7, 0.25) 100%);
    }
    
    .queue-item.vip-request .queue-position {
      background: linear-gradient(135deg, #ffd700 0%, #ffb700 100%);
      color: #4a3800;
    }
    
    .queue-item.vip-request .title {
      color: #ffd700;
    }
    
    .vip-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      background: linear-gradient(135deg, #ffd700 0%, #ffb700 100%);
      color: #4a3800;
      font-weight: 700;
      font-size: 0.75em;
      text-transform: uppercase;
      margin-left: 8px;
    }
    
    .empty-queue {
      text-align: center;
      padding: 50px;
      opacity: 0.7;
    }
    
    .empty-queue p {
      font-size: 1.2em;
      margin-bottom: 10px;
    }
    
    .commands {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      padding: 20px;
      border-radius: 15px;
      margin-top: 30px;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .commands h3 {
      margin-bottom: 15px;
      color: #e8e0f0;
    }
    
    .commands code {
      background: rgba(184, 159, 208, 0.4);
      padding: 3px 10px;
      border-radius: 6px;
      font-family: 'Consolas', monospace;
    }
    
    .commands ul {
      list-style: none;
    }
    
    .commands li {
      margin: 10px 0;
    }
    
    footer {
      text-align: center;
      margin-top: 40px;
      opacity: 0.5;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎸 Song Request Queue</h1>
    
    <div class="stats">
      <div class="stat-box">
        <div class="stat-number">${pending.length}</div>
        <div class="stat-label">Songs in Queue</div>
      </div>
    </div>
    
    ${nowPlaying ? `
    <div class="now-playing">
      <h2>🎵 NOW PLAYING</h2>
      <div class="song-info">${this.escapeHtml(nowPlaying.song.artist)} - ${this.escapeHtml(nowPlaying.song.title)}</div>
      <div class="requester">Requested by: ${this.escapeHtml(nowPlaying.requestedBy)} (${nowPlaying.platform})</div>
    </div>
    ` : ''}
    
    <div class="queue-section">
      <h2>📋 Up Next</h2>
      ${pending.length > 0 ? `
      <ul class="queue-list">
        ${pending.map((item, index) => `
        <li class="queue-item${item.isVIP ? ' vip-request' : ''}">
          <div class="queue-position">${index + 1}</div>
          <div class="queue-song">
            <div class="title">${this.escapeHtml(item.song.title)}${item.isVIP ? '<span class="vip-badge">⭐ VIP</span>' : ''}</div>
            <div class="artist">${this.escapeHtml(item.song.artist)}</div>
          </div>
          <div class="queue-meta">
            <div class="platform ${item.platform}">${item.platform}</div>
            <div>by ${this.escapeHtml(item.requestedBy)}</div>
          </div>
        </li>
        `).join('')}
      </ul>
      ` : `
      <div class="empty-queue">
        <p>🎶 The queue is empty!</p>
        <p>Type <code>!request Artist - Song</code> in chat to add a song</p>
      </div>
      `}
    </div>
    
    <div class="commands">
      <h3>📝 Commands</h3>
      <ul>
        <li><code>!request Artist - Song</code> - Request a song from Customsforge</li>
        <li><code>!viprequest Artist - Song</code> - VIP request (costs 1 token, priority queue)</li>
        <li><code>!tokens</code> - Check your VIP token balance</li>
        <li><code>!list</code> - Get a link to this queue page</li>
        <li><code>!song</code> - See what's currently playing</li>
        <li><code>!myqueue</code> - See your position in the queue</li>
        <li><code>!remove</code> - Remove your last request</li>
      </ul>
    </div>
    
    <footer>
      Page auto-refreshes every 15 seconds • Powered by Customsforge
    </footer>
  </div>
</body>
</html>
`;
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  start(): void {
    this.server = this.app.listen(this.config.web.port, () => {
      console.log(`[Web] Server running at ${this.config.web.baseUrl}`);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
    }
  }
}
