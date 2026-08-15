import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import torrentManager, { BEST_PUBLIC_TRACKERS } from './torrentManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Load .env.local manually ---
// Electron's main process does NOT automatically load Next.js's `.env.local`.
// We parse it ourselves so TMDB_API_KEY (and any other vars) are available.
function loadEnvLocal(): void {
  try {
    const envPath = path.join(__dirname, '..', '.env.local');
    if (!fs.existsSync(envPath)) {
      console.log('[main.ts] .env.local not found, relying on process.env');
      return;
    }
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      let value = trimmed.substring(eqIdx + 1).trim();
      // Strip surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
    console.log('[main.ts] .env.local loaded');
  } catch (err: any) {
    console.warn('[main.ts] Failed to load .env.local:', err?.message || err);
  }
}

loadEnvLocal();

// --- Windows GPU Cache Fix ---
// On Windows, Electron sometimes fails to write GPU shader/HTTP cache to the
// temp folder, throwing "Unable to move the cache: Access is denied (0x5)".
// Disabling these caches eliminates the error entirely.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');

// Multiple YTS mirrors are tried in sequence, each bounded by its own
// timeout, so a single blocked/unreachable domain (e.g. ENOTFOUND from an
// ISP-level DNS block) doesn't stall the whole search - we just move on to
// the next mirror instead of failing outright.
const YTS_MIRRORS = [
  'https://yts.mx',
  'https://yts.rs',
  'https://yts.torrentbay.to',
  'https://yts.do'
];

// Torrentio is the primary stream aggregator (like Stremio). It accepts
// IMDB IDs (ttXXXXX) and returns clean JSON with infoHash + quality for
// multiple providers (YTS, 1337x, RARBG, EZTV, Kickass) — no Cloudflare
// challenge to bypass.
// Multiple mirrors are tried in sequence because the primary domain may
// return 403 (rate-limit / geo-block) at times.
const TORRENTIO_BASE_URLS = [
  'https://torrentio.strem.fun',
  'https://torrentio.fastcast.workers.dev',
  'https://torrentio.noc.workers.dev'
];

// Shared tracker list (native UDP/HTTP first, WSS fallback) from torrentManager
const TRACKERS = BEST_PUBLIC_TRACKERS;

const trackerQuery = TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');

// Read system proxy from environment (used by VPN/proxy software on Windows)
function getSystemProxy(): string | null {
  return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || null;
}

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

function getTmdbApiKey(): string {
  return process.env.TMDB_API_KEY || '8e2be4aa080a70388e9d3514dcc73339';
}

interface ResolvedMedia {
  imdbId: string;
  type: 'movie' | 'series';
  title: string;
}

/**
 * Resolve TMDB ID (movie or TV series) or IMDB ID to get:
 * - Real IMDB ID (e.g. tt14688458)
 * - Media type ('movie' or 'series')
 * - Title name (e.g. "Silo" or "Inception")
 */
async function resolveMediaInfo(tmdbIdOrQuery: string, titleHint?: string): Promise<ResolvedMedia> {
  const input = String(tmdbIdOrQuery || '').trim();
  const apiKey = getTmdbApiKey();
  const fallbackTitle = titleHint || (input && !/^\d+$/.test(input) ? input : '');

  if (!input && !titleHint) return { imdbId: '', type: 'movie', title: '' };

  // If input is already an IMDB ID (e.g. tt14688458)
  if (/^tt\d+$/i.test(input)) {
    try {
      const res = await fetch(`https://v3-cinemeta.strem.io/meta/series/${input}.json`, { headers: DEFAULT_HEADERS });
      if (res.ok) {
        const data = await res.json();
        if (data?.meta?.type === 'series') {
          console.log(`[main.ts] Recognized IMDB ID ${input} as TV series: "${data.meta.name}"`);
          return { imdbId: input, type: 'series', title: data.meta.name || fallbackTitle || input };
        }
      }
    } catch {}

    try {
      const res = await fetch(`https://v3-cinemeta.strem.io/meta/movie/${input}.json`, { headers: DEFAULT_HEADERS });
      if (res.ok) {
        const data = await res.json();
        if (data?.meta?.name) {
          console.log(`[main.ts] Recognized IMDB ID ${input} as movie: "${data.meta.name}"`);
          return { imdbId: input, type: 'movie', title: data.meta.name || fallbackTitle || input };
        }
      }
    } catch {}

    return { imdbId: input, type: 'movie', title: fallbackTitle || input };
  }

  // If numeric TMDB ID (e.g. 125988 or 1375666)
  if (/^\d+$/.test(input) && apiKey) {
    const fetchWithTimeout = async (url: string, ms = 4000) => {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), ms);
      try {
        const res = await fetch(url, { signal: c.signal, headers: DEFAULT_HEADERS });
        clearTimeout(t);
        return res;
      } catch (err) {
        clearTimeout(t);
        throw err;
      }
    };

    // 1. Check TV API
    try {
      const tvRes = await fetchWithTimeout(`https://api.themoviedb.org/3/tv/${input}?api_key=${apiKey}`, 3500);
      if (tvRes.ok) {
        const tvData = await tvRes.json();
        let resolvedImdb = '';
        try {
          const extRes = await fetchWithTimeout(`https://api.themoviedb.org/3/tv/${input}/external_ids?api_key=${apiKey}`, 3000);
          const extData = await extRes.json();
          resolvedImdb = (extData?.imdb_id && extData.imdb_id.startsWith('tt')) ? extData.imdb_id : '';
        } catch (_) {}
        console.log(`[main.ts] Resolved TMDB TV ID ${input} → IMDB ID ${resolvedImdb} ("${tvData.name}")`);
        return { imdbId: resolvedImdb, type: 'series', title: tvData.name || fallbackTitle || input };
      }
    } catch (_) {}

    // 2. Check Movie API
    try {
      const movieRes = await fetchWithTimeout(`https://api.themoviedb.org/3/movie/${input}?api_key=${apiKey}`, 3500);
      if (movieRes.ok) {
        const movieData = await movieRes.json();
        let resolvedImdb = '';
        try {
          const extRes = await fetchWithTimeout(`https://api.themoviedb.org/3/movie/${input}/external_ids?api_key=${apiKey}`, 3000);
          const extData = await extRes.json();
          resolvedImdb = (extData?.imdb_id && extData.imdb_id.startsWith('tt')) ? extData.imdb_id : '';
        } catch (_) {}
        console.log(`[main.ts] Resolved TMDB Movie ID ${input} → IMDB ID ${resolvedImdb} ("${movieData.title}")`);
        return { imdbId: resolvedImdb, type: 'movie', title: movieData.title || fallbackTitle || input };
      }
    } catch (_) {}
  }

  // Fallback: If tmdbId lookup failed or input is text
  return { imdbId: '', type: 'movie', title: fallbackTitle || input };
}

export interface StreamItem {
  title: string;
  quality: string;
  size: string;
  seeders: number;
  magnet: string;
}

/**
 * Fetch streams from Torrentio. Supports both movies and TV series (with season/episode).
 */
async function fetchTorrentioStreams(imdbId: string, type: 'movie' | 'series', season = 1, episode = 1): Promise<StreamItem[] | null> {
  if (!imdbId || !imdbId.startsWith('tt')) return null;
  const trackerQuery = TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');

  for (const baseUrl of TORRENTIO_BASE_URLS) {
    const urlPath = type === 'series' ? `/stream/series/${imdbId}:${season}:${episode}.json` : `/stream/movie/${imdbId}.json`;
    const url = `${baseUrl}${urlPath}`;
    console.log(`[main.ts] Trying Torrentio mirror: ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          ...DEFAULT_HEADERS,
          'Referer': baseUrl + '/',
          'Origin': baseUrl,
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.log(`[main.ts] Torrentio mirror responded with status ${response.status} - trying next...`);
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.log(`[main.ts] Torrentio mirror returned non-JSON content type (${contentType}) - trying next...`);
        continue;
      }

      const data = await response.json();
      if (!data || !Array.isArray(data.streams) || data.streams.length === 0) {
        console.log('[main.ts] Torrentio mirror returned no streams - trying next...');
        continue;
      }

      const results: StreamItem[] = [];
      for (const stream of data.streams) {
        if (!stream || !stream.infoHash) continue;
        const rawTitle = stream.title || stream.name || 'Unknown';
        const qualityMatch = rawTitle.match(/(\d{3,4}p|4K|2160p|1080p|720p|480p)/i);
        const quality = qualityMatch ? qualityMatch[1].toUpperCase() : '720P';

        const sizeMatch = rawTitle.match(/([\d.]+)\s*(GB|MB)/i);
        const size = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}` : 'Unknown';

        const seedersMatch = rawTitle.match(/👤\s*(\d+)/i) || rawTitle.match(/⚙️\s*(\d+)/i);
        const seeders = seedersMatch ? Number(seedersMatch[1]) : 10;

        const magnet = `magnet:?xt=urn:btih:${stream.infoHash}&dn=${encodeURIComponent(rawTitle)}&${trackerQuery}`;
        results.push({ title: rawTitle, quality, size, seeders, magnet });
      }

      if (results.length > 0) {
        console.log(`[main.ts] Torrentio mirror succeeded: ${baseUrl} (${results.length} streams)`);
        return results;
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.log(`[main.ts] Torrentio mirror failed (${baseUrl}: ${error?.message || error}) - trying next...`);
      continue;
    }
  }

  console.log('[main.ts] All Torrentio mirrors failed or returned 403.');
  return null;
}

/**
 * Fetch streams from APIBay (ThePirateBay API).
 * Fast, reliable, no Cloudflare block, works for Movies & TV series.
 */
async function fetchApibayStreams(imdbId: string, title: string): Promise<StreamItem[] | null> {
  const trackerQuery = TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');
  const queriesToTry: string[] = [];
  if (imdbId && imdbId.startsWith('tt')) queriesToTry.push(imdbId);
  if (title && title !== imdbId) queriesToTry.push(title);

  for (const q of queriesToTry) {
    try {
      console.log(`[main.ts] Trying APIBay search with query: ${q}`);
      const res = await fetch(`https://apibay.org/q.php?q=${encodeURIComponent(q)}`, { headers: DEFAULT_HEADERS });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0 || data[0].id === '0') continue;

      const results: StreamItem[] = [];
      for (const item of data) {
        if (!item.info_hash || item.name === 'No results found') continue;
        const rawTitle = item.name;
        const qualityMatch = rawTitle.match(/(\d{3,4}p|4K|2160p|1080p|720p|480p)/i);
        const quality = qualityMatch ? qualityMatch[1].toUpperCase() : '720P';

        let sizeStr = 'Unknown';
        if (item.size && !isNaN(Number(item.size))) {
          const bytes = Number(item.size);
          if (bytes > 1073741824) sizeStr = `${(bytes / 1073741824).toFixed(1)} GB`;
          else sizeStr = `${(bytes / 1048576).toFixed(0)} MB`;
        }

        const seeders = Number(item.seeders) || 0;
        const magnet = `magnet:?xt=urn:btih:${item.info_hash}&dn=${encodeURIComponent(rawTitle)}&${trackerQuery}`;
        results.push({ title: rawTitle, quality, size: sizeStr, seeders, magnet });
      }

      if (results.length > 0) {
        console.log(`[main.ts] APIBay returned ${results.length} streams for query: ${q}`);
        return results;
      }
    } catch (err: any) {
      console.log(`[main.ts] APIBay search error for ${q}: ${err?.message || err}`);
    }
  }
  return null;
}

/**
 * Fetch streams from EZTV API for TV Series.
 */
async function fetchEztvStreams(imdbId: string): Promise<StreamItem[] | null> {
  const cleanId = imdbId.replace(/^tt/i, '');
  if (!cleanId || !/^\d+$/.test(cleanId)) return null;

  try {
    console.log(`[main.ts] Trying EZTV search for IMDB ID: ${cleanId}`);
    const res = await fetch(`https://eztv.re/api/get-torrents?imdb_id=${cleanId}`, { headers: DEFAULT_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.torrents) || data.torrents.length === 0) return null;

    const results: StreamItem[] = [];
    for (const item of data.torrents) {
      if (!item.magnet_url && !item.hash) continue;
      const rawTitle = item.title || item.filename || 'Unknown';
      const qualityMatch = rawTitle.match(/(\d{3,4}p|4K|2160p|1080p|720p|480p)/i);
      const quality = qualityMatch ? qualityMatch[1].toUpperCase() : '720P';

      let sizeStr = 'Unknown';
      if (item.size_bytes && !isNaN(Number(item.size_bytes))) {
        const bytes = Number(item.size_bytes);
        if (bytes > 1073741824) sizeStr = `${(bytes / 1073741824).toFixed(1)} GB`;
        else sizeStr = `${(bytes / 1048576).toFixed(0)} MB`;
      }

      const seeders = Number(item.seeds) || 0;
      const baseMagnet = item.magnet_url || `magnet:?xt=urn:btih:${item.hash}&dn=${encodeURIComponent(rawTitle)}`;
      const magnet = baseMagnet.includes('tr=') ? baseMagnet : `${baseMagnet}&${trackerQuery}`;
      results.push({ title: rawTitle, quality, size: sizeStr, seeders, magnet });
    }

    if (results.length > 0) {
      console.log(`[main.ts] EZTV returned ${results.length} streams for IMDB ID: ${cleanId}`);
      return results;
    }
  } catch (err: any) {
    console.log(`[main.ts] EZTV search error for ${cleanId}: ${err?.message || err}`);
  }
  return null;
}

async function fetchYtsWithFallback(query: string): Promise<any[]> {
  const proxyUrl = getSystemProxy();

  for (const baseUrl of YTS_MIRRORS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout per mirror

      console.log(`[main.ts] Trying YTS mirror: ${baseUrl} with query: ${query}`);
      if (proxyUrl) console.log(`[main.ts] Using proxy: ${proxyUrl}`);

      const fetchOptions: RequestInit = {
        signal: controller.signal,
        headers: DEFAULT_HEADERS
      };

      const response = await fetch(`${baseUrl}/api/v2/list_movies.json?query_term=${query}&sort_by=seeds&limit=5`, fetchOptions);
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.log(`[main.ts] YTS Mirror returned non-JSON content type (${contentType}) - trying next...`);
        continue;
      }

      if (response.ok) {
        const data = await response.json();
        if (data && data.status === 'ok' && data.data && Array.isArray(data.data.movies) && data.data.movies.length > 0) {
          console.log(`[main.ts] YTS mirror succeeded: ${baseUrl}`);
          return data.data.movies;
        }
      }
      console.log(`[main.ts] YTS Mirror returned no results (${baseUrl}) - trying next...`);
    } catch (error: any) {
      console.log(`[main.ts] YTS Mirror failed (${baseUrl}: ${error?.message || error}) - trying next...`);
      continue;
    }
  }
  throw new Error('All YTS mirrors failed.');
}

let mainWindow: BrowserWindow | null = null;
// removed let torrentManager declaration

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false, // Ensure contextIsolation and preload work properly with Next.js
    },
  });

  // Electron loads the Next.js dev server or deployed Railway URL (via WEB_APP_URL or VITE_DEV_SERVER_URL).
  // Default to production domain if not specified.
  const startUrl = process.env.WEB_APP_URL || process.env.NEXT_PUBLIC_WEB_URL || process.env.VITE_DEV_SERVER_URL || 'https://streamor-app-production.up.railway.app';
  console.log('[main.ts] Loading Web App URL:', startUrl);
  mainWindow.loadURL(startUrl);

  // Bypass CORS Headers Globally
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*']
      }
    } as any);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Prevent network/WebRTC aborts in webtorrent/polyfill from crashing the app
process.on('uncaughtException', (error) => {
  // Ignore specific expected disconnection/abort errors
  if (
    error.message.includes('User-Initiated Abort') ||
    error.message.includes('Close called') ||
    error.name === 'OperationError'
  ) {
    console.warn('[main.ts] Ignored specific WebRTC/network abort:', error.message);
    return;
  }
  console.error('[main.ts] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[main.ts] Unhandled Rejection at:', promise, 'reason:', reason);
});

app.whenReady().then(() => {
  // Set proxy from system/VPN automatically
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (proxyUrl) {
    console.log(`[main.ts] Setting Electron session proxy to: ${proxyUrl}`);
    const { session } = require('electron');
    session.defaultSession.setProxy({ proxyRules: proxyUrl });
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  // Clean up torrent and server on quit to free memory
    await torrentManager.destroy();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- IPC Bridge Handlers ---

// Window Controls
ipcMain.on('window:controls', (event, action: 'minimize' | 'maximize' | 'close') => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;

  switch (action) {
    case 'minimize':
      win.minimize();
      break;
    case 'maximize':
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
      break;
    case 'close':
      win.close();
      break;
  }
});

// Stream Resolution (Direct URL) — validates and returns the URL for the renderer
ipcMain.handle('stream:resolve', async (event, rawUrl: string) => {
  try {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return { success: false, error: 'URL نامعتبر است.' };
    }

    // Magnet links are handled by the torrent flow, not here
    if (rawUrl.startsWith('magnet:?')) {
      return { success: false, error: 'مگنت باید از طریق torrent:start پردازش شود.' };
    }

    // Basic URL validation
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return { success: false, error: 'فرمت URL صحیح نیست.' };
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { success: false, error: 'فقط پروتکل http/https پشتیبانی می‌شود.' };
    }

    // Return the URL as-is; the renderer will load it directly.
    // Electron's webSecurity:false + CORS bypass headers handle cross-origin.
    return { success: true, directUrl: rawUrl };
  } catch (err: any) {
    const message = err?.message || String(err) || 'خطای ناشناخته در resolveStream';
    console.error('[IPC] stream:resolve error:', message);
    return { success: false, error: message };
  }
});

// --- Torrent IPC ---

// --- Stream Search IPC ---

// Guards against duplicate stream:search requests from the renderer
// (React StrictMode double-mount in dev, or rapid re-navigation).
// Electron main process is a single-threaded event loop, so a simple
// in-process marker is sufficient.
const SEARCH_IN_FLIGHT = new Set<string>();

// stream:search — Multi-source torrent stream resolution:
// 1. Resolve TMDB (Movie/TV) or IMDB ID to get IMDB ID, type ('movie'|'series'), and Title
// 2. Try Torrentio (Movies & Series)
// 3. Try APIBay / PirateBay API (Fast, no Cloudflare block)
// 4. Try EZTV (TV Series)
// 5. Try YTS mirrors (Movies)
ipcMain.on('stream:search', async (event, { tmdbId, title, season, episode }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;

  const rawQuery = String(tmdbId || title || '').trim();
  const s = Number(season) || 1;
  const e = Number(episode) || 1;
  const searchKey = `${rawQuery}::${s}:${e}`;

  if (searchKey && SEARCH_IN_FLIGHT.has(searchKey)) {
    console.log(`[main.ts] Duplicate stream:search ignored for: ${searchKey}`);
    return;
  }
  if (searchKey) SEARCH_IN_FLIGHT.add(searchKey);

  const clearInFlight = () => {
    if (searchKey) SEARCH_IN_FLIGHT.delete(searchKey);
  };

  try {
    // Mock Bypass for testing
    const sendMockData = () => {
      win.webContents.send('stream:results', [
        {
          title: 'Big Buck Bunny (Test - MP4)',
          quality: '1080p',
          size: '275 MB',
          magnet: 'magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny'
        }
      ]);
    };

    // Quick test bypass check
    if (String(tmdbId).toLowerCase().includes('test') || String(tmdbId) === 'Watch Party') {
      console.log('[main.ts] Using mock data for test title');
      sendMockData();
      return;
    }

    const rawIdOrTitle = String(tmdbId || '').trim();
    const titleHint = String(title || '').trim();
    const media = await resolveMediaInfo(rawIdOrTitle, titleHint);
    console.log(`[main.ts] Resolved Media: imdbId=${media.imdbId}, type=${media.type}, title="${media.title}"`);

    // Helper to filter and send sorted streams
    const sendSortedStreams = (streams: StreamItem[]) => {
      // Deduplicate by infoHash in magnet
      const map = new Map<string, StreamItem>();
      for (const s of streams) {
        const hashMatch = s.magnet.match(/btih:([a-f0-9]{40})/i);
        const hash = hashMatch ? hashMatch[1].toLowerCase() : s.magnet;
        if (!map.has(hash) || (map.get(hash)?.seeders || 0) < s.seeders) {
          map.set(hash, s);
        }
      }

      const deduplicated = Array.from(map.values());
      // Sort descending by seeders
      const sorted = deduplicated.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));

      console.log(`[main.ts] Sending ${sorted.length} aggregated streams to renderer (Top seeders: ${sorted[0]?.seeders || 0})`);
      win.webContents.send('stream:results', sorted);
    };

    const aggregatedStreams: StreamItem[] = [];
    const s = Number(season) || 1;
    const e = Number(episode) || 1;

    console.log(`[main.ts] Launching concurrent stream searches for ${media.type} "${media.title}" (IMDB: ${media.imdbId || 'N/A'}) S${s}E${e}`);

    const tasks: Promise<StreamItem[] | null>[] = [
      fetchTorrentioStreams(media.imdbId, media.type, s, e),
      fetchApibayStreams(media.imdbId, media.title)
    ];

    if (media.type === 'series' && media.imdbId) {
      tasks.push(fetchEztvStreams(media.imdbId));
    } else if (media.type === 'movie') {
      const ytsQuery = media.imdbId.startsWith('tt') ? media.imdbId : (media.title || rawIdOrTitle);
      tasks.push(
        fetchYtsWithFallback(encodeURIComponent(ytsQuery)).then(movies => {
          if (!movies || movies.length === 0) return null;
          const trackerQuery = TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');
          const results: StreamItem[] = [];
          for (const movie of movies) {
            if (movie?.torrents) {
              for (const t of movie.torrents) {
                results.push({
                  title: movie.title,
                  quality: t.quality || 'Unknown',
                  size: t.size || 'Unknown',
                  seeders: Number(t.seeds) || 10,
                  magnet: `magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(movie.title)}&${trackerQuery}`
                });
              }
            }
          }
          return results;
        }).catch(() => null)
      );
    }

    const settled = await Promise.allSettled(tasks);
    for (const res of settled) {
      if (res.status === 'fulfilled' && res.value && Array.isArray(res.value)) {
        aggregatedStreams.push(...res.value);
      }
    }

    if (aggregatedStreams.length > 0) {
      sendSortedStreams(aggregatedStreams);
      return;
    }

    console.log('[main.ts] All stream providers returned 0 results. Returning empty list to renderer.');
    win.webContents.send('stream:results', []);

  } catch (err: any) {
    console.error('[main.ts] stream:search error:', err.message);
    if (win && !win.isDestroyed()) {
      win.webContents.send('stream:results', []);
    }
  } finally {
    clearInFlight();
  }
});

// torrent:start — Renderer sends a magnet link, we destroy previous and start new
ipcMain.on('torrent:start', async (event, magnet: string) => {
  try {
    const { streamUrl, infoHash } = await torrentManager.startTorrent(magnet, 60000, (prog) => {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('torrent:progress', prog);
      }
    });
    event.sender.send('torrent:ready', { streamUrl, infoHash });
  } catch (error: any) {
    console.error('[Torrent Main Error]:', error.message);
    if (event.sender && !event.sender.isDestroyed()) {
      event.sender.send('torrent:error', {
        code: error.message?.includes('NO_PEERS') ? 'NO_PEERS' : 'STREAM_ERROR',
        message: error.message || 'خطا در بارگذاری تورنت'
      });
    }
  }
});