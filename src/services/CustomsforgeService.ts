import * as cheerio from 'cheerio';
import { SongInfo } from '../types';

// Use native fetch (available in Node 18+ / Electron 28+)
const fetchUrl = globalThis.fetch;

const CUSTOMSFORGE_BASE_URL = 'https://customsforge.com';
const IGNITION_BASE_URL = 'https://ignition4.customsforge.com';
const OAUTH_URL = `${CUSTOMSFORGE_BASE_URL}/oauth/authorize/`;

interface CustomsforgeSearchResult {
  found: boolean;
  songs: SongInfo[];
  totalResults: number;
}

export class CustomsforgeService {
  private searchCache: Map<string, CustomsforgeSearchResult> = new Map();
  private cacheExpiry: number = 30 * 60 * 1000; // 30 minutes
  private cookies: string = '';
  private isLoggedIn: boolean = false;

  constructor(
    private username: string = '',
    private password: string = ''
  ) {
    // Don't auto-login in constructor - let BotManager call login() explicitly
  }

  /**
   * Check if currently authenticated
   */
  isAuthenticated(): boolean {
    return this.isLoggedIn;
  }

  /**
   * Login to Customsforge to enable authenticated searches
   * Uses a two-phase approach: first login to forum, then complete OAuth for Ignition4
   * @param force Force re-login even if already authenticated
   */
  async login(force: boolean = false): Promise<boolean> {
    if (!this.username || !this.password) {
      console.log('[Customsforge] No credentials provided, skipping login');
      return false;
    }

    // Skip if already logged in (unless forced)
    if (this.isLoggedIn && !force) {
      console.log('[Customsforge] Already logged in');
      return true;
    }

    try {
      console.log(`[Customsforge] Logging in as ${this.username}...`);

      // Phase 1: Login to the main CustomsForge forum first
      
      // Get the main page to establish session and extract CSRF
      const mainPageResponse = await fetchUrl(`${CUSTOMSFORGE_BASE_URL}/`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      let cookies: string[] = [];
      const mainCookies = mainPageResponse.headers.getSetCookie?.() || [];
      cookies.push(...mainCookies.map(c => c.split(';')[0]));
      
      const mainHtml = await mainPageResponse.text();
      
      // Extract CSRF key
      const csrfMatch = mainHtml.match(/csrfKey=([a-f0-9]+)/i)
        || mainHtml.match(/name=["']csrfKey["']\s+value=["']([^"']+)["']/i);
      const csrfKey = csrfMatch ? csrfMatch[1] : '';

      // POST to the forum login endpoint
      const loginFormData = new URLSearchParams({
        'login__standard_submitted': '1',
        'csrfKey': csrfKey,
        'auth': this.username,
        'password': this.password,
        'remember_me': '1',
        'remember_me_checkbox': '1',
        '_processLogin': 'usernamepassword',
        'signin_anonymous': '0',
      });

      const loginResponse = await fetchUrl(`${CUSTOMSFORGE_BASE_URL}/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Cookie': cookies.join('; '),
          'Origin': CUSTOMSFORGE_BASE_URL,
          'Referer': `${CUSTOMSFORGE_BASE_URL}/login/`,
        },
        body: loginFormData.toString(),
        redirect: 'manual',
      });

      const loginCookies = loginResponse.headers.getSetCookie?.() || [];
      cookies.push(...loginCookies.map(c => c.split(';')[0]));

      // Follow any redirects from login
      let nextUrl = loginResponse.headers.get('location');
      while (nextUrl) {
        const fullUrl = nextUrl.startsWith('http') ? nextUrl : `${CUSTOMSFORGE_BASE_URL}${nextUrl}`;
        
        const redirectResponse = await fetchUrl(fullUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Cookie': cookies.join('; '),
          },
          redirect: 'manual',
        });
        
        const redirectCookies = redirectResponse.headers.getSetCookie?.() || [];
        cookies.push(...redirectCookies.map(c => c.split(';')[0]));
        nextUrl = redirectResponse.headers.get('location');
      }

      // Check if forum login succeeded
      const hasForumMemberCookie = cookies.some(c => c.includes('ips4_member_id') || c.includes('ips4_loggedIn'));

      if (!hasForumMemberCookie) {
        console.log('[Customsforge] ✗ Forum login failed - check credentials');
        return false;
      }
      
      console.log('[Customsforge] Forum login OK, completing OAuth...');

      // Phase 2: Now complete OAuth flow for Ignition4
      
      // Visit Ignition4's login endpoint to start OAuth
      const ignitionLoginResponse = await fetchUrl(`${IGNITION_BASE_URL}/login`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Cookie': cookies.join('; '),
        },
        redirect: 'manual',
      });
      
      const ignCookies = ignitionLoginResponse.headers.getSetCookie?.() || [];
      cookies.push(...ignCookies.map(c => c.split(';')[0]));
      
      // Follow OAuth redirect chain
      let oauthUrl = ignitionLoginResponse.headers.get('location');
      let redirectCount = 0;
      const maxRedirects = 10;
      
      while (oauthUrl && redirectCount < maxRedirects) {
        redirectCount++;
        const fullUrl = oauthUrl.startsWith('http') ? oauthUrl : 
          (oauthUrl.startsWith('/') ? `${CUSTOMSFORGE_BASE_URL}${oauthUrl}` : `${IGNITION_BASE_URL}/${oauthUrl}`);
        
        const oauthResponse = await fetchUrl(fullUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Cookie': cookies.join('; '),
          },
          redirect: 'manual',
        });
        
        const newCookies = oauthResponse.headers.getSetCookie?.() || [];
        cookies.push(...newCookies.map(c => c.split(';')[0]));
        
        // If we get a 200 on the OAuth authorize page, we need to accept it
        if (oauthResponse.status === 200 && fullUrl.includes('oauth/authorize')) {
          const html = await oauthResponse.text();
          
          // Check if this is an authorization confirmation page (first-time app auth)
          if (html.includes('authorize_yes') || html.includes('Allow')) {
            console.log('[Customsforge] Authorizing app access...');
            
            // Extract CSRF and form action
            const authCsrfMatch = html.match(/name=["']csrfKey["']\s+value=["']([^"']+)["']/i);
            const authCsrf = authCsrfMatch ? authCsrfMatch[1] : csrfKey;
            
            // POST to authorize
            const authResponse = await fetchUrl(fullUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
                'Cookie': cookies.join('; '),
                'Origin': CUSTOMSFORGE_BASE_URL,
                'Referer': fullUrl,
              },
              body: new URLSearchParams({
                'csrfKey': authCsrf,
                'authorize_yes': '1',
              }).toString(),
              redirect: 'manual',
            });
            
            const authCookies = authResponse.headers.getSetCookie?.() || [];
            cookies.push(...authCookies.map(c => c.split(';')[0]));
            
            oauthUrl = authResponse.headers.get('location');
          } else {
            break;
          }
        } else if (oauthResponse.status === 301 || oauthResponse.status === 302) {
          oauthUrl = oauthResponse.headers.get('location');
        } else {
          break;
        }
      }

      // De-duplicate cookies
      const cookieMap = new Map<string, string>();
      for (const c of cookies) {
        const [name] = c.split('=');
        if (name) cookieMap.set(name, c);
      }
      this.cookies = Array.from(cookieMap.values()).join('; ');

      // Verify by testing a protected endpoint
      const verifyResponse = await fetchUrl(`${IGNITION_BASE_URL}/cdlc/search/artists?search=test`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Cookie': this.cookies,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (verifyResponse.status === 200) {
        this.isLoggedIn = true;
        console.log('[Customsforge] ✓ Login successful!');
      } else {
        // Forum login worked but Ignition4 API still 401 - may need different approach
        this.isLoggedIn = hasForumMemberCookie;
        if (this.isLoggedIn) {
          console.log('[Customsforge] ⚠ Forum login OK but Ignition4 API returned ' + verifyResponse.status);
        } else {
          console.log('[Customsforge] ✗ Login verification failed');
        }
      }
      
      return this.isLoggedIn;
    } catch (error: any) {
      console.error('[Customsforge] Login error:', error.message);
      return false;
    }
  }

  /**
   * Search for a song on Customsforge Ignition
   */
  async searchSong(query: string): Promise<CustomsforgeSearchResult> {
    const cacheKey = query.toLowerCase().trim();
    
    // Check cache first
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const variants = this.getQueryVariants(query);
      let result: CustomsforgeSearchResult = { found: false, songs: [], totalResults: 0 };

      for (const variant of variants) {
        result = await this.performSearch(variant);
        if (result.found && result.songs.length > 0) {
          break;
        }
      }

      // Cache the result
      this.searchCache.set(cacheKey, result);
      setTimeout(() => this.searchCache.delete(cacheKey), this.cacheExpiry);

      return result;
    } catch (error) {
      console.error('[Customsforge] Search error:', error);
      return { found: false, songs: [], totalResults: 0 };
    }
  }

  private getQueryVariants(query: string): string[] {
    const trimmed = (query || '').trim();
    const normalizedSpace = trimmed.replace(/\s+/g, ' ');
    const lower = normalizedSpace.toLowerCase();
    const titleCase = normalizedSpace
      .split(' ')
      .map(w => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(' ');
    const noPunct = normalizedSpace.replace(/["'`~!@#$%^&*()_+=\[\]{}\\|:;,.<>/?-]+/g, ' ').replace(/\s+/g, ' ').trim();

    const variants = [trimmed, normalizedSpace, titleCase, lower, noPunct];
    // Unique, preserve order
    return variants.filter((v, i) => v && variants.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i);
  }

  private async performSearch(query: string): Promise<CustomsforgeSearchResult> {
    console.log(`[Customsforge] Searching for: "${query}"${this.isLoggedIn ? ' (authenticated)' : ''}`);
    
    // Try autocomplete endpoints first (more reliable when authenticated)
    if (this.isLoggedIn && this.cookies) {
      const autocompleteResult = await this.tryAutocompleteSearch(query);
      if (autocompleteResult.found && autocompleteResult.songs.length > 0) {
        return autocompleteResult;
      }
    }
    
    // Fall back to DataTables/HTML parsing
    const baseUrl = `${IGNITION_BASE_URL}/`;
    
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${baseUrl}?search=${encodeURIComponent(query)}`,
      };

      // Add cookies if logged in
      if (this.cookies) {
        headers['Cookie'] = this.cookies;
      }

      // Ignition4 renders results via a server-side DataTables JSON request.
      // The search term must be in search[value] parameter for server-side filtering.
      const dtUrl = `${baseUrl}?${this.buildDataTablesQuery(query)}`;
      console.log(`[Customsforge] DataTables search for: "${query}"`);
      
      let response = await fetchUrl(dtUrl, { headers });

      // If JSON fails (e.g., blocked/cached), fall back to HTML.
      if (!response.ok) {
        console.log(`[Customsforge] DataTables request failed (${response.status}), trying HTML fallback`);
        const searchUrl = `${baseUrl}?search=${encodeURIComponent(query)}`;
        response = await fetchUrl(searchUrl, { headers: { ...headers, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } });
      }

      if (!response.ok) {
        console.error(`[Customsforge] HTTP ${response.status}`);
        throw new Error(`HTTP ${response.status}`)
      }

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      
      let result: CustomsforgeSearchResult;

      // Check if it's JSON (either by content-type or by content)
      if (contentType.includes('application/json') || (text.trim().startsWith('{') && text.includes('"data"'))) {
        try {
          const json = JSON.parse(text);
          result = this.parseDataTablesResults(json, query);
        } catch (e: any) {
          result = this.parseSearchResults(text, query);
        }
      } else {
        result = this.parseSearchResults(text, query);
      }
      
      console.log(`[Customsforge] Found ${result.songs.length} results`);
      if (result.songs.length > 0) {
        console.log(`[Customsforge] First result: ${result.songs[0].artist} - ${result.songs[0].title}`);
      }
      
      return result;
    } catch (error: any) {
      console.error('[Customsforge] Fetch error:', error.message);
      return { found: false, songs: [], totalResults: 0 };
    }
  }

  /**
   * Try using the autocomplete/typeahead endpoints which return cleaner JSON
   * These endpoints return artist names and song titles for dropdown suggestions
   */
  private async tryAutocompleteSearch(query: string): Promise<CustomsforgeSearchResult> {
    const songs: SongInfo[] = [];
    
    try {
      // Parse query to extract potential artist and title
      const parts = this.parseArtistTitle(query);
      
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': this.cookies,
      };

      // The autocomplete endpoints return names for dropdowns, not full CDLC data
      // But we can use them to validate that an artist/title exists
      
      let foundArtist: string | null = null;
      let foundTitle: string | null = null;

      // Search for artist
      // Note: The autocomplete endpoints return a list of suggestions but don't filter server-side
      // We need to search through the results ourselves
      
      if (parts.artist) {
        const artistUrl = `${IGNITION_BASE_URL}/cdlc/search/artists?search=${encodeURIComponent(parts.artist)}`;
        console.log(`[Customsforge] Autocomplete artist search: ${parts.artist}`);
        
        const artistResp = await fetchUrl(artistUrl, { headers });
        if (artistResp.ok) {
          const artistText = await artistResp.text();
          
          let artistJson;
          try {
            artistJson = JSON.parse(artistText);
          } catch {
            artistJson = { results: [] };
          }
          const artistData = artistJson.results || artistJson || [];
          
          if (Array.isArray(artistData) && artistData.length > 0) {
            const searchArtist = parts.artist.toLowerCase().trim();
            
            // Find exact or close match - DO NOT fall back to first result
            const matchedArtist = artistData.find((a: any) => {
              const text = (a.text || a.name || '').toLowerCase().trim();
              // Check for exact match or close containment
              return text === searchArtist || 
                     text.includes(searchArtist) || 
                     searchArtist.includes(text);
            });
            
            if (matchedArtist) {
              foundArtist = (matchedArtist.text || matchedArtist.name || '').trim();
              console.log(`[Customsforge] Artist match found: "${foundArtist}"`);
            } else {
              console.log(`[Customsforge] No artist match for "${parts.artist}" in ${artistData.length} results`);
            }
          }
        }
      }

      // Search for title
      if (parts.title) {
        const titleUrl = `${IGNITION_BASE_URL}/cdlc/search/titles?search=${encodeURIComponent(parts.title)}`;
        console.log(`[Customsforge] Autocomplete title search: ${parts.title}`);
        
        const titleResp = await fetchUrl(titleUrl, { headers });
        if (titleResp.ok) {
          const titleText = await titleResp.text();
          
          let titleJson;
          try {
            titleJson = JSON.parse(titleText);
          } catch {
            titleJson = { results: [] };
          }
          const titleData = titleJson.results || titleJson || [];
          
          if (Array.isArray(titleData) && titleData.length > 0) {
            const searchTitle = parts.title.toLowerCase().trim();
            
            // Find exact or close match - DO NOT fall back to first result
            const matchedTitle = titleData.find((t: any) => {
              const text = (t.text || t.name || '').toLowerCase().trim();
              return text === searchTitle || 
                     text.includes(searchTitle) || 
                     searchTitle.includes(text);
            });
            
            if (matchedTitle) {
              foundTitle = (matchedTitle.text || matchedTitle.name || '').trim();
              console.log(`[Customsforge] Title match found: "${foundTitle}"`);
            } else {
              console.log(`[Customsforge] No title match for "${parts.title}" in ${titleData.length} results`);
            }
          }
        }
      }

      // If we found both artist and title via autocomplete, that's a valid song
      if (foundArtist && foundTitle) {
        songs.push({
          artist: foundArtist,
          title: foundTitle,
        });
        console.log(`[Customsforge] Found via autocomplete: ${foundArtist} - ${foundTitle}`);
      } else if (foundArtist && !parts.title) {
        // Just searching for an artist
        songs.push({
          artist: foundArtist,
          title: query.replace(new RegExp(foundArtist, 'i'), '').trim() || 'Unknown Title',
        });
      }
    } catch (error: any) {
      console.log(`[Customsforge] Autocomplete search error: ${error.message}`);
    }

    return {
      found: songs.length > 0,
      songs,
      totalResults: songs.length,
    };
  }

  /**
   * Parse a query string into potential artist and title parts
   */
  private parseArtistTitle(query: string): { artist?: string; title?: string } {
    const q = query.trim();
    
    // Try common separators
    const separators = [' - ', ' – ', ' — ', ' by '];
    for (const sep of separators) {
      const idx = q.toLowerCase().indexOf(sep.toLowerCase());
      if (idx > 0) {
        return {
          artist: q.substring(0, idx).trim(),
          title: q.substring(idx + sep.length).trim(),
        };
      }
    }
    
    // No separator found - try to guess based on known patterns
    // For queries like "Green Day Too Much Too Soon", the artist is likely the first 2-3 words
    const words = q.split(/\s+/);
    if (words.length >= 4) {
      // Try splitting after 2 words first (common for "First Last" artist names)
      return {
        artist: words.slice(0, 2).join(' '),
        title: words.slice(2).join(' '),
      };
    }
    
    // Can't reliably split - return whole query
    return { title: q };
  }

  private buildDataTablesQuery(searchTerm: string = ''): string {
    // Matches the Ignition4 search table configuration enough to get results.
    // Key detail: server expects DataTables-style params and uses column 7 (updated_at) for default ordering.
    const params = new URLSearchParams();
    params.set('draw', '1');
    params.set('start', '0');
    params.set('length', '25');
    params.set('order[0][column]', '7');
    params.set('order[0][dir]', 'desc');
    params.set('search[value]', searchTerm);
    params.set('search[regex]', 'false');

    const columns = [
      { data: 'add', name: 'add', searchable: 'false', orderable: 'false' },
      { data: 'artistName', name: 'artist.name', searchable: 'true', orderable: 'true' },
      { data: 'titleName', name: 'title', searchable: 'true', orderable: 'true' },
      { data: 'albumName', name: 'album', searchable: 'true', orderable: 'true' },
      { data: 'tuning', name: 'tuning', searchable: 'false', orderable: 'true' },
      { data: 'memberName', name: 'author.name', searchable: 'true', orderable: 'true' },
      { data: 'created_at', name: 'created_at', searchable: 'false', orderable: 'true' },
      { data: 'updated_at', name: 'updated_at', searchable: 'false', orderable: 'true' },
    ];

    columns.forEach((col, i) => {
      params.set(`columns[${i}][data]`, col.data);
      params.set(`columns[${i}][name]`, col.name);
      params.set(`columns[${i}][searchable]`, col.searchable);
      params.set(`columns[${i}][orderable]`, col.orderable);
      params.set(`columns[${i}][search][value]`, '');
      params.set(`columns[${i}][search][regex]`, 'false');
    });

    return params.toString();
  }

  private parseDataTablesResults(json: any, query: string): CustomsforgeSearchResult {
    const songs: SongInfo[] = [];
    const queryLower = (query || '').toLowerCase();
    const rows: any[] = Array.isArray(json?.data) ? json.data : [];

    const stripHtml = (input: any): string => {
      const text = String(input ?? '');
      return text
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    for (const row of rows) {
      const artist = stripHtml(row.artistName || row['artist.name'] || row.artist || '');
      const title = stripHtml(row.titleName || row.title || '');
      if (!title) continue;

      const combinedLower = `${artist} ${title}`.toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
      const matchesQuery = queryWords.length === 0 || queryWords.some(w => combinedLower.includes(w));
      if (!matchesQuery) continue;

      const urlCandidate = row.file_pc_link || row.file_mac_link || row.url || row.permalink;
      const customsforgeUrl = typeof urlCandidate === 'string' && urlCandidate
        ? (urlCandidate.startsWith('http') ? urlCandidate : `${IGNITION_BASE_URL}${urlCandidate}`)
        : undefined;

      songs.push({
        artist: artist || 'Unknown Artist',
        title,
        customsforgeUrl,
      });
    }

    // De-dupe by artist+title
    const unique = songs.filter((s, i, arr) => i === arr.findIndex(x => x.artist.toLowerCase() === s.artist.toLowerCase() && x.title.toLowerCase() === s.title.toLowerCase()));

    console.log(`[Customsforge] Parsed ${unique.length} songs from DataTables JSON`);

    return {
      found: unique.length > 0,
      songs: unique,
      totalResults: typeof json?.recordsFiltered === 'number' ? json.recordsFiltered : unique.length,
    };
  }

  private parseSearchResults(html: string, query: string): CustomsforgeSearchResult {
    const $ = cheerio.load(html);
    const songs: SongInfo[] = [];
    const queryLower = query.toLowerCase();

    const decodeHtmlEntities = (input: string): string => {
      return input
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    };

    const addSong = (artistRaw: string, titleRaw: string, href?: string) => {
      const artist = (artistRaw || '').trim();
      const title = (titleRaw || '').trim();
      if (!title || title.length <= 1) return;

      // Basic query gating
      const combinedLower = `${artist} ${title}`.toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
      const matchesQuery = queryWords.length === 0 || queryWords.some(word => combinedLower.includes(word));
      if (!matchesQuery) return;

      const absoluteUrl = href
        ? (href.startsWith('http') ? href : `${IGNITION_BASE_URL}${href}`)
        : undefined;

      if (!songs.some(s => s.artist.toLowerCase() === (artist || 'unknown artist').toLowerCase() && s.title.toLowerCase() === title.toLowerCase())) {
        songs.push({
          artist: artist || 'Unknown Artist',
          title,
          customsforgeUrl: absoluteUrl,
        });
      }
    };

    // 1) Try parsing the results table directly (Ignition4 UI)
    $('table tbody tr').each((_, tr) => {
      const $tr = $(tr);
      const tds = $tr.find('td');
      if (tds.length < 2) return;

      const artistText = $(tds.get(0)).text().trim();
      const titleText = $(tds.get(1)).text().trim();

      // Try to find a details/download link in the row (if present)
      const href = $tr.find('a[href]').first().attr('href') || undefined;
      if (artistText && titleText) {
        addSong(artistText, titleText, href);
      }
    });

    // 2) Try parsing Livewire snapshots (often contain the row data as JSON)
    if (songs.length === 0) {
      const snapshots: string[] = [];
      $('[wire\\:snapshot]').each((_, el) => {
        const raw = $(el).attr('wire:snapshot');
        if (raw) snapshots.push(raw);
      });

      const collectFromObject = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
          obj.forEach(collectFromObject);
          return;
        }

        // Heuristic: objects that have artist-ish and title-ish string keys.
        const keys = Object.keys(obj);
        const artistKey = keys.find(k => /artist/i.test(k));
        const titleKey = keys.find(k => /(title|song|track|name)/i.test(k));

        if (artistKey && titleKey) {
          const artistVal = obj[artistKey];
          const titleVal = obj[titleKey];
          if (typeof artistVal === 'string' && typeof titleVal === 'string') {
            // Avoid obvious non-song entries
            if (artistVal.length <= 120 && titleVal.length <= 200) {
              addSong(artistVal, titleVal);
            }
          }
        }

        // Recurse
        for (const k of keys) {
          collectFromObject(obj[k]);
        }
      };

      for (const snap of snapshots) {
        try {
          const decoded = decodeHtmlEntities(snap);
          const parsed = JSON.parse(decoded);
          collectFromObject(parsed);
        } catch {
          // ignore snapshot parse errors
        }
      }
    }

    // 3) Older Ignition layouts / other fallbacks
    const selectors = [
      '.ipsDataItem',
      'li[data-role="activityItem"]',
      'article.ipsContained',
      '.cDownloadsCat',
      '[itemtype*="SoftwareApplication"]'
    ];

    selectors.forEach(selector => {
      $(selector).each((_, item) => {
        const $item = $(item);
        
        // Try multiple ways to find the title/song info
        let title = '';
        let href = '';
        
        // Try data-ipsHover links (common pattern)
        const hoverLink = $item.find('a[data-ipsHover]').first();
        if (hoverLink.length) {
          title = hoverLink.attr('title') || hoverLink.text().trim();
          href = hoverLink.attr('href') || '';
        }
        
        // Try file links
        if (!title) {
          const fileLink = $item.find('a[href*="/file/"]').first();
          if (fileLink.length) {
            title = fileLink.attr('title') || fileLink.text().trim();
            href = fileLink.attr('href') || '';
          }
        }
        
        // Try any link in the item
        if (!title) {
          const anyLink = $item.find('a').first();
          if (anyLink.length) {
            title = anyLink.attr('title') || anyLink.text().trim();
            href = anyLink.attr('href') || '';
          }
        }
        
        // Try h4 or strong tags
        if (!title) {
          const heading = $item.find('h4, h3, strong, .ipsType_break').first();
          title = heading.text().trim();
          href = heading.find('a').attr('href') || $item.find('a').first().attr('href') || '';
        }
        
        if (title && title.length > 3) {
          // Parse "Artist - Song" format from title
          let artist = '';
          let songTitle = title;
          
          if (title.includes(' - ')) {
            const parts = title.split(' - ');
            artist = parts[0].trim();
            songTitle = parts.slice(1).join(' - ').trim();
          }
          
          // Check if this result matches the query
          const titleLower = title.toLowerCase();
          const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
          const matchesQuery = queryWords.length === 0 || queryWords.some(word => titleLower.includes(word));
          
          if (matchesQuery) {
            addSong(artist || 'Unknown Artist', songTitle, href);
          }
        }
      });
    });

    // 4) Final fallback: scan all file links directly.
    if (songs.length === 0) {
      $('a[href*="/file/"]').each((_, link) => {
        const $link = $(link);
        const title = ($link.attr('title') || $link.text() || '').trim();
        const href = ($link.attr('href') || '').trim();
        if (!title || title.length <= 3) {
          return;
        }

        let artist = '';
        let songTitle = title;
        if (title.includes(' - ')) {
          const parts = title.split(' - ');
          artist = parts[0].trim();
          songTitle = parts.slice(1).join(' - ').trim();
        }

        const titleLower = title.toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
        const matchesQuery = queryWords.length === 0 || queryWords.some(word => titleLower.includes(word));
        if (!matchesQuery) {
          return;
        }

        addSong(artist || 'Unknown Artist', songTitle, href);
      });
    }

    console.log(`[Customsforge] Parsed ${songs.length} unique songs from HTML`);

    return {
      found: songs.length > 0,
      songs,
      totalResults: songs.length,
    };
  }

  /**
   * Find the best match for a song request
   */
  async findBestMatch(artist: string, title: string): Promise<SongInfo | null> {
    const query = `${artist} ${title}`;
    const result = await this.searchSong(query);

    if (!result.found || result.songs.length === 0) {
      return null;
    }

    // Try to find an exact or close match
    const lowerArtist = artist.toLowerCase();
    const lowerTitle = title.toLowerCase();

    // Look for exact match first
    const exactMatch = result.songs.find(song => 
      song.artist.toLowerCase() === lowerArtist && 
      song.title.toLowerCase() === lowerTitle
    );
    if (exactMatch) return exactMatch;

    // Look for partial match (contains both artist and title)
    const partialMatch = result.songs.find(song =>
      (lowerArtist === '' || song.artist.toLowerCase().includes(lowerArtist)) &&
      song.title.toLowerCase().includes(lowerTitle)
    );
    if (partialMatch) return partialMatch;

    // Look for title-only match (in case artist is wrong/missing)
    const titleMatch = result.songs.find(song =>
      song.title.toLowerCase().includes(lowerTitle)
    );
    if (titleMatch) return titleMatch;

    // Return the first result as a fallback
    return result.songs[0];
  }

  /**
   * Parse a request string into artist and title
   * Handles formats like:
   * - "Green Day American Idiot"
   * - "Green Day - American Idiot"
   * - "American Idiot by Green Day"
   * - "Babymetal song 3" (artist + partial title)
   */
  parseRequest(request: string): { artist: string; title: string } | null {
    const trimmed = request.trim();
    
    if (!trimmed) {
      return null;
    }

    // Try "Artist - Title" format
    if (trimmed.includes(' - ')) {
      const [artist, title] = trimmed.split(' - ').map(s => s.trim());
      if (artist && title) {
        return { artist, title };
      }
    }

    // Try "Title by Artist" format
    const byMatch = trimmed.match(/^(.+?)\s+by\s+(.+)$/i);
    if (byMatch) {
      return { title: byMatch[1].trim(), artist: byMatch[2].trim() };
    }

    // Default: treat everything as a search query without splitting.
    // (Splitting heuristics live in CommandProcessor where we can decide based on context.)
    return { artist: '', title: trimmed };
  }
}
