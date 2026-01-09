import * as fs from 'fs';
import * as path from 'path';
import { SongRequest, SongInfo } from '../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');

interface QueueData {
  requests: SongRequest[];
  history: SongRequest[];
}

export class QueueManager {
  private requests: SongRequest[] = [];
  private history: SongRequest[] = [];
  private userCooldowns: Map<string, Date> = new Map();
  private maxRequestsPerUser: number;
  private cooldownSeconds: number;

  constructor(maxRequestsPerUser: number = 3, cooldownSeconds: number = 10) {
    this.maxRequestsPerUser = maxRequestsPerUser;
    this.cooldownSeconds = cooldownSeconds;
    this.loadQueue();
  }

  private loadQueue(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(QUEUE_FILE)) {
        const data = fs.readFileSync(QUEUE_FILE, 'utf-8');
        const parsed: QueueData = JSON.parse(data);
        this.requests = parsed.requests || [];
        this.history = parsed.history || [];
        console.log(`[Queue] Loaded ${this.requests.length} pending requests`);
      }
    } catch (error) {
      console.error('[Queue] Error loading queue:', error);
      this.requests = [];
      this.history = [];
    }
  }

  private saveQueue(): void {
    try {
      const data: QueueData = {
        requests: this.requests,
        history: this.history,
      };
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[Queue] Error saving queue:', error);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if a user can make a request (cooldown and limit checks)
   */
  canUserRequest(userId: string, platform: 'twitch' | 'youtube'): { allowed: boolean; reason?: string } {
    const userKey = `${platform}:${userId}`;

    // Check cooldown
    const lastRequest = this.userCooldowns.get(userKey);
    if (lastRequest) {
      const elapsed = (Date.now() - lastRequest.getTime()) / 1000;
      if (elapsed < this.cooldownSeconds) {
        const remaining = Math.ceil(this.cooldownSeconds - elapsed);
        return { allowed: false, reason: `Please wait ${remaining} seconds before requesting again.` };
      }
    }

    // Check user's pending requests
    const userPending = this.requests.filter(
      r => r.requestedBy === userId && r.platform === platform && r.status === 'pending'
    );
    if (userPending.length >= this.maxRequestsPerUser) {
      return { 
        allowed: false, 
        reason: `You already have ${this.maxRequestsPerUser} pending requests. Wait for some to be played!` 
      };
    }

    return { allowed: true };
  }

  /**
   * Add a new song request to the queue
   */
  addRequest(song: SongInfo, userId: string, username: string, platform: 'twitch' | 'youtube', isVIP: boolean = false): SongRequest {
    const request: SongRequest = {
      id: this.generateId(),
      song,
      requestedBy: username,
      platform,
      requestedAt: new Date(),
      status: 'pending',
      isVIP,
    };

    if (isVIP) {
      // Insert VIP request at top, but after other VIP requests
      const lastVIPIndex = this.requests.reduce((lastIdx, req, idx) => {
        return req.status === 'pending' && req.isVIP ? idx : lastIdx;
      }, -1);
      this.requests.splice(lastVIPIndex + 1, 0, request);
    } else {
      this.requests.push(request);
    }
    
    // Update cooldown
    const userKey = `${platform}:${userId}`;
    this.userCooldowns.set(userKey, new Date());

    this.saveQueue();
    
    return request;
  }

  /**
   * Get all pending requests
   */
  getPendingRequests(): SongRequest[] {
    return this.requests.filter(r => r.status === 'pending');
  }

  /**
   * Get a user's pending requests
   */
  getUserRequests(username: string, platform: 'twitch' | 'youtube'): SongRequest[] {
    return this.requests.filter(
      r => r.requestedBy === username && r.platform === platform && r.status === 'pending'
    );
  }

  /**
   * Get the position of a request in the queue
   */
  getQueuePosition(requestId: string): number {
    const pending = this.getPendingRequests();
    return pending.findIndex(r => r.id === requestId) + 1;
  }

  /**
   * Get the current queue length
   */
  getQueueLength(): number {
    return this.getPendingRequests().length;
  }

  /**
   * Mark a request as playing (broadcaster/mod command)
   */
  markPlaying(requestId: string): SongRequest | null {
    const request = this.requests.find(r => r.id === requestId);
    if (request) {
      request.status = 'playing';
      this.saveQueue();
    }
    return request || null;
  }

  /**
   * Mark a request as completed
   */
  markCompleted(requestId: string): SongRequest | null {
    const request = this.requests.find(r => r.id === requestId);
    if (request) {
      request.status = 'completed';
      this.history.push(request);
      this.requests = this.requests.filter(r => r.id !== requestId);
      this.saveQueue();
    }
    return request || null;
  }

  /**
   * Skip/remove a request
   */
  skipRequest(requestId: string): SongRequest | null {
    const request = this.requests.find(r => r.id === requestId);
    if (request) {
      request.status = 'skipped';
      this.history.push(request);
      this.requests = this.requests.filter(r => r.id !== requestId);
      this.saveQueue();
    }
    return request || null;
  }

  /**
   * Get the next request in queue
   */
  getNextRequest(): SongRequest | null {
    const pending = this.getPendingRequests();
    return pending.length > 0 ? pending[0] : null;
  }

  /**
   * Pop (get and mark as playing) the next request
   */
  popNextRequest(): SongRequest | null {
    const next = this.getNextRequest();
    if (next) {
      this.markPlaying(next.id);
    }
    return next;
  }

  /**
   * Clear all pending requests (broadcaster/mod command)
   */
  clearQueue(): number {
    const count = this.requests.length;
    this.requests.forEach(r => {
      r.status = 'skipped';
      this.history.push(r);
    });
    this.requests = [];
    this.saveQueue();
    return count;
  }

  /**
   * Remove a specific user's request
   */
  removeUserRequest(username: string, platform: 'twitch' | 'youtube'): SongRequest | null {
    const userRequests = this.getUserRequests(username, platform);
    if (userRequests.length > 0) {
      return this.skipRequest(userRequests[userRequests.length - 1].id);
    }
    return null;
  }

  /**
   * Remove a pending request by its position in the pending queue (0-based)
   */
  removePendingAt(index: number): SongRequest | null {
    const pending = this.getPendingRequests();
    if (index < 0 || index >= pending.length) return null;
    return this.skipRequest(pending[index].id);
  }

  /**
   * Check if a song is already in the queue
   */
  isSongInQueue(artist: string, title: string): boolean {
    const lowerArtist = artist.toLowerCase();
    const lowerTitle = title.toLowerCase();
    
    return this.requests.some(
      r => r.status === 'pending' &&
           r.song.artist.toLowerCase() === lowerArtist &&
           r.song.title.toLowerCase() === lowerTitle
    );
  }

  /**
   * Reorder a song in the queue
   */
  reorderQueue(fromIndex: number, toIndex: number): void {
    const pending = this.getPendingRequests();
    
    if (fromIndex < 0 || fromIndex >= pending.length || toIndex < 0 || toIndex >= pending.length) {
      console.log('[QueueManager] Invalid reorder indices');
      return;
    }

    // Work on a copy of the pending array
    const reordered = [...pending];
    // Remove the item from its original position
    const [movedItem] = reordered.splice(fromIndex, 1);
    // Insert it at the new position
    reordered.splice(toIndex, 0, movedItem);

    // Rebuild the full requests array: non-pending items stay, then the reordered pending items
    const nonPending = this.requests.filter(r => r.status !== 'pending');
    this.requests = [...nonPending, ...reordered];
    
    this.saveQueue();
    console.log(`[QueueManager] Reordered queue: moved position ${fromIndex + 1} to ${toIndex + 1}`);
  }

  /**
   * Get queue data for web display
   */
  getQueueForDisplay(): { pending: SongRequest[]; nowPlaying: SongRequest | null } {
    const pending = this.getPendingRequests();
    const nowPlaying = this.requests.find(r => r.status === 'playing') || null;
    
    return { pending, nowPlaying };
  }
}
