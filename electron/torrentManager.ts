import * as http from 'http';
import * as net from 'net';

// @ts-ignore
import WebTorrent from 'webtorrent';
// @ts-ignore
import MemoryChunkStore from 'memory-chunk-store';

const MAGNET_REGEX = /^magnet:\?xt=urn:[a-z0-9]+:[a-z0-9]{32,40}/i;

// UDP trackers/DHT are commonly blocked by ISPs. These trackers run over
// WSS/HTTPS (i.e. over TCP/TLS on standard web ports), so they survive
// UDP-level filtering. We inject them into every magnet - including test
// magnets that ship with no trackers at all - to give WebTorrent a much
// better chance of discovering peers even under aggressive network censorship.
const SECURE_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.openbittorrent.com:80/announce',
  'udp://tracker.coppersurfer.tk:6969/announce',
  'udp://glotorrents.pw:6969/announce',
  'udp://tracker.leechers-paradise.org:6969/announce',
  'udp://p4p.arenabg.com:1337/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.webtorrent.dev'
];

export interface TorrentProgress {
  downloadSpeed: number;
  uploadSpeed: number;
  peers: number;
  bufferPercent: number;
  timeRemaining: number | null;
}

export interface TorrentError {
  code: 'NO_PEERS' | 'DHT_TIMEOUT' | 'INVALID_MAGNET' | 'STREAM_ERROR';
  message: string;
}

type TorrentReadyCallback = (streamUrl: string, infoHash: string) => void;
type TorrentProgressCallback = (progress: TorrentProgress) => void;
type TorrentErrorCallback = (error: TorrentError) => void;

export class TorrentManager {
  private client: any = null;
  private server: http.Server | null = null;
  private activeTorrent: any = null;

  private onReady: TorrentReadyCallback;
  private onProgress: TorrentProgressCallback;
  private onError: TorrentErrorCallback;

  private progressInterval: NodeJS.Timeout | null = null;
  private noPeersTimeout: NodeJS.Timeout | null = null;

  constructor(
    onReady: TorrentReadyCallback,
    onProgress: TorrentProgressCallback,
    onError: TorrentErrorCallback
  ) {
    this.onReady = onReady;
    this.onProgress = onProgress;
    this.onError = onError;
  }

  async start(magnet: string): Promise<void> {
    console.log('[TM] start() initiated');
    if (!MAGNET_REGEX.test(magnet)) {
      this.onError({ code: 'INVALID_MAGNET', message: 'مگنت نامعتبر است. لطفاً لینک را بررسی کنید.' });
      return;
    }

    await this.cleanup();

    console.log('[TM] Creating new WebTorrent client');
    try {
      this.client = new WebTorrent({ tracker: true, dht: true });

      this.client.on('error', (err: any) => {
        const message = err?.message || String(err) || 'خطای ناشناخته کلاینت';
        console.error('[TM] Client error:', message);
        this.onError({ code: 'STREAM_ERROR', message: `WebTorrent error: ${message}` });
      });

      console.log('[TM] Adding magnet to client...');

      // Inject secure (WSS/HTTPS) trackers into the magnet itself, and also
      // pass them via the `announce` option as a belt-and-suspenders measure,
      // so peer discovery doesn't depend solely on UDP trackers/DHT, which
      // are frequently blocked by ISPs/firewalls.
      let injectedMagnet = magnet;
      SECURE_TRACKERS.forEach((tr) => {
        if (!injectedMagnet.includes(encodeURIComponent(tr))) {
          injectedMagnet += `&tr=${encodeURIComponent(tr)}`;
        }
      });
      console.log('[TM] Injected secure WSS/HTTPS trackers into magnet for UDP/DHT bypass.');

      // IMPORTANT: client.add() returns the torrent object synchronously as an
      // EventEmitter, even though metadata has not downloaded yet. The optional
      // callback form (client.add(magnet, opts, cb)) only fires once metadata is
      // ready - if there are no peers/seeders, it never fires, `activeTorrent`
      // stays null forever, and the UI gets stuck on "Connecting..." while the
      // NO_PEERS timer silently no-ops because it reads `this.activeTorrent`.
      // Fix: assign `activeTorrent` immediately and drive all logic off events.
      const torrent = this.client.add(injectedMagnet, {
        store: MemoryChunkStore,
        announce: SECURE_TRACKERS
      });
      this.activeTorrent = torrent;

      // NOTE: webtorrent's internal `_onTorrentId` is async (it awaits parseTorrent()),
      // so `torrent.infoHash` is briefly undefined right after add() returns even for
      // magnet links. It's populated by the time 'metadata'/'ready' fire, so we log it
      // there instead of here to avoid a misleading "InfoHash: undefined" log line.
      console.log('[TM] Torrent added synchronously. Waiting for infoHash/metadata...');

      torrent.on('metadata', () => {
        console.log(`[TM] Event: metadata downloaded. InfoHash: ${torrent.infoHash}`);
      });

      torrent.on('ready', () => {
         console.log('[TM] Event: ready. Finding largest file...');

         // Clear NO_PEERS timeout immediately - torrent is ready and streaming!
         if (this.noPeersTimeout) {
           clearTimeout(this.noPeersTimeout);
           this.noPeersTimeout = null;
         }

         if (!torrent.files || torrent.files.length === 0) {
           this.onError({ code: 'STREAM_ERROR', message: 'هیچ فایلی در این تورنت یافت نشد.' });
           return;
         }

         const videoFile = torrent.files.find((file: any) => file.name.endsWith('.mp4') || file.name.endsWith('.mkv') || file.name.endsWith('.webm') || file.name.endsWith('.iso'));
         const file = videoFile || (torrent.files.length > 0 ? torrent.files.reduce((a: any, b: any) => (a.length > b.length ? a : b)) : null);

         if (!file) {
           this.onError({ code: 'STREAM_ERROR', message: 'فایل مدیا در این تورنت یافت نشد.' });
           return;
         }

         torrent.files.forEach((f: any) => f.deselect());
         file.select();

         this.startHttpServer(file, torrent.infoHash);

         // Start progress reporting
         this.startProgressReporting(torrent);
      });

      torrent.on('error', (err: any) => {
         const message = err?.message || String(err) || 'خطای ناشناخته تورنت';
         console.error('[TM] Torrent specific error:', message);
         this.onError({ code: 'STREAM_ERROR', message: `خطای تورنت: ${message}` });
      });

      // Force torrent to emit events if it gets stuck (Self-healing hack for WebTorrent bug).
      // NOTE: `torrent.discover()` is not part of the webtorrent API (it would throw
      // "torrent.discover is not a function" and crash the main process). Discovery
      // (DHT/tracker/LSD) is started automatically by webtorrent internally via the
      // private `_startDiscovery()`; calling it again here is a safe no-op if it's
      // already running, so we use it defensively instead of the non-existent method.
      setTimeout(() => {
        if (this.activeTorrent === torrent && !torrent.ready) {
           console.log('[TM] Forcing discovery...');
           torrent.resume();
           if (typeof torrent._startDiscovery === 'function') {
             torrent._startDiscovery();
           }
        }
      }, 5000);

      // Start NO_PEERS timer immediately - completely independent of the add()
      // callback/events above, so it fires reliably even if metadata never loads.
      this.noPeersTimeout = setTimeout(() => {
        const currentTorrent = this.activeTorrent;
        const peers = currentTorrent ? currentTorrent.numPeers : 0;
        console.log(`[TM] 30s timeout reached. Peers: ${peers}, ready: ${currentTorrent?.ready}`);

        if (!currentTorrent || !currentTorrent.ready || peers === 0) {
          this.onError({ code: 'NO_PEERS', message: 'Seeder پیدا نشد. چند دقیقه صبر کنید یا مگنت دیگری امتحان کنید.' });
          this.cleanup();
        }
      }, 30000);

      console.log('[TM] Magnet added. Waiting for events...');

    } catch (err: any) {
      const message = err?.message || String(err) || 'خطای ناشناخته';
      console.error('[TM] Failed to add torrent:', message);
      this.onError({ code: 'STREAM_ERROR', message: `Failed to start torrent: ${message}` });
    }
  }

  private startProgressReporting(torrent: any) {
    if (this.progressInterval) clearInterval(this.progressInterval);

    this.progressInterval = setInterval(() => {
      if (!this.activeTorrent) return;

      const timeRemaining = torrent.timeRemaining;
      const safeTimeRemaining = (timeRemaining === Infinity || isNaN(timeRemaining)) ? null : timeRemaining;

      this.onProgress({
        downloadSpeed: torrent.downloadSpeed ?? 0,
        uploadSpeed: torrent.uploadSpeed ?? 0,
        peers: torrent.numPeers ?? 0,
        bufferPercent: torrent.progress ? Math.round(torrent.progress * 100) : 0,
        timeRemaining: safeTimeRemaining,
      });
    }, 1000);
  }

  private startHttpServer(file: any, infoHash: string): void {
    // ... existing code ...
    this.server = http.createServer((req, res) => {
      const fileSize = file.length;
      const rangeHeader = req.headers['range'];

      res.setHeader('Accept-Ranges', 'bytes');

      // Determine content type based on file extension
      let contentType = 'video/mp4';
      if (file.name.endsWith('.webm')) contentType = 'video/webm';
      else if (file.name.endsWith('.mkv')) contentType = 'video/x-matroska';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize) {
          res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
          res.end();
          return;
        }

        const chunkSize = end - start + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': chunkSize,
        });

        const stream = file.createReadStream({ start, end });
        stream.on('error', (err: Error) => {
          console.error('[TorrentManager] Stream error:', err.message);
          res.destroy();
        });
        stream.pipe(res);
      } else {
        res.writeHead(200, { 'Content-Length': fileSize });
        const stream = file.createReadStream();
        stream.on('error', (err: Error) => {
          console.error('[TorrentManager] Stream error:', err.message);
          res.destroy();
        });
        stream.pipe(res);
      }
    });

    this.server.listen(0, '127.0.0.1', () => {
      const address = this.server?.address() as net.AddressInfo;
      const streamUrl = `http://127.0.0.1:${address.port}`;
      console.log(`[TorrentManager] HTTP stream server ready at ${streamUrl}`);
      console.log('[TorrentManager] Torrent ready, sending torrent:ready to Renderer');
      this.onReady(streamUrl, infoHash);
    });

    this.server.on('error', (err: any) => {
      const message = err?.message || String(err) || 'خطای ناشناخته سرور';
      console.error('[TorrentManager] HTTP server error:', message);
      this.onError({ code: 'STREAM_ERROR', message: `Stream server error: ${message}` });
    });
  }

  async cleanup(): Promise<void> {
    console.log('[TM] cleanup called');
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    if (this.noPeersTimeout) {
      clearTimeout(this.noPeersTimeout);
      this.noPeersTimeout = null;
    }

    if (this.server) {
      this.server.close();
      this.server = null;
    }

    this.activeTorrent = null;

    if (this.client) {
      console.log('[TM] Destroying old client...');
      try {
        this.client.removeAllListeners('error');
        this.client.destroy();
      } catch (e) {
        console.log('[TM] Destroy error', e);
      }
      this.client = null;
    }
    console.log('[TM] cleanup finished');
  }

  async destroy(): Promise<void> {
    await this.cleanup();
    if (this.client) {
      this.client.destroy(() => {
        console.log('[TorrentManager] WebTorrent client destroyed.');
        this.client = null;
      });
    }
  }
}
