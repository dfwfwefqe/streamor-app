// @ts-ignore
import WebTorrent from 'webtorrent';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';

// High-speed UDP & HTTP public trackers
export const NATIVE_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://explodie.org:6969/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://p4p.arenabg.com:1337/announce',
  'udp://tracker.birkenwald.de:6969/announce',
  'udp://tracker.theoks.net:6969/announce',
  'udp://movies.zsw.ca:6969/announce',
  'https://tracker.tamersrealm.org:443/announce',
  'http://tracker.opentrackr.org:1337/announce',
  'https://tracker.gbitt.info:443/announce',
  'https://tracker.lilithraws.org:443/announce',
];

// WSS trackers for WebRTC peers fallback
export const WSS_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7072/announce',
  'wss://tracker.webtorrent.dev',
];

export const BEST_PUBLIC_TRACKERS = [...NATIVE_TRACKERS, ...WSS_TRACKERS];

export const DHT_BOOTSTRAP_NODES = [
  'router.bittorrent.com:6881',
  'router.utorrent.com:6881',
  'dht.transmissionbt.com:6881',
  'dht.aelitis.com:6881',
  'router.silotis.us:6881',
  'dht.libtorrent.org:25401',
  'dht.anacrolix.link:42069',
  'router.bittorrent.cloud:6881',
];

const TORRENT_DOWNLOAD_PATH = path.join(os.tmpdir(), 'streamor-torrents');

function guessVideoContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mkv':
      return 'video/x-matroska';
    case 'avi':
      return 'video/x-msvideo';
    case 'mov':
      return 'video/quicktime';
    case 'ts':
    case 'mts':
      return 'video/mp2t';
    case 'ogv':
    case 'ogg':
      return 'video/ogg';
    case 'wmv':
      return 'video/x-ms-wmv';
    case 'flv':
      return 'video/x-flv';
    default:
      return 'video/mp4';
  }
}

/** Prioritize first ~12MB and last ~6MB of a file for instant header/footer/moov probing */
function prioritizeCriticalPieces(torrent: any, file: any) {
  try {
    const pieceLength = torrent.pieceLength || (1024 * 1024);
    if (!pieceLength || typeof file._startPiece !== 'number') return;

    const startPiece = file._startPiece;
    const endPiece = file._endPiece;
    const headPieces = Math.max(8, Math.ceil((12 * 1024 * 1024) / pieceLength));
    const tailPieces = Math.max(6, Math.ceil((6 * 1024 * 1024) / pieceLength));

    for (let i = startPiece; i <= Math.min(endPiece, startPiece + headPieces - 1); i++) {
      if (typeof torrent.critical === 'function') torrent.critical(i);
    }
    for (let i = Math.max(startPiece, endPiece - tailPieces + 1); i <= endPiece; i++) {
      if (typeof torrent.critical === 'function') torrent.critical(i);
    }
  } catch (_) {}
}

export class TorrentManager {
  private client: WebTorrent.Client | null = null;
  private activeTorrent: any = null;
  private server: http.Server | null = null;
  private serverPort: number = 0;
  private progressInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initClient();
  }

  private initClient() {
    if (this.client) return;

    this.client = new WebTorrent({
      dht: {
        bootstrap: DHT_BOOTSTRAP_NODES,
        concurrency: 32,
      },
      lsd: true,
      utPex: true,
      webSeeds: true,
      maxConns: 120,
      tracker: {
        announce: BEST_PUBLIC_TRACKERS,
        getAnnounceOpts: () => ({ numwant: 100 }),
      },
    } as any);

    this.client.on('error', (err: any) => {
      const msg = err?.message || String(err);
      if (/Cannot add duplicate torrent/i.test(msg)) return;
      console.error('[WebTorrent Client Error]:', err);
    });
  }

  public getClient(): WebTorrent.Client {
    if (!this.client) this.initClient();
    return this.client!;
  }

  private getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on('error', reject);
      server.listen(0, () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        server.close(() => resolve(port));
      });
    });
  }

  /**
   * Stop previous torrent and HTTP server cleanly before starting a new one
   */
  public async cleanup(): Promise<void> {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }

    if (this.server) {
      try {
        this.server.close();
      } catch (_) {}
      this.server = null;
    }

    if (this.activeTorrent) {
      try {
        const t = this.activeTorrent;
        this.activeTorrent = null;
        if (typeof t.destroy === 'function') {
          t.destroy();
        }
      } catch (_) {}
    }
  }

  public async startTorrent(
    magnet: string,
    timeoutMs = 60_000,
    onProgress?: (payload: {
      downloadSpeed: number;
      uploadSpeed: number;
      peers: number;
      bufferPercent: number;
      timeRemaining: number | null;
    }) => void
  ): Promise<{ streamUrl: string; infoHash: string }> {
    const client = this.getClient();

    // Check if this magnet is already active and ready
    let existing: any = null;
    try {
      existing = await client.get(magnet);
    } catch (_) {}

    if (existing && existing === this.activeTorrent && existing.ready && this.server && this.serverPort > 0) {
      const videoFile = existing.files.reduce(
        (prev: any, curr: any) => (curr.length > prev.length ? curr : prev),
        existing.files[0]
      );
      const fileIndex = existing.files.indexOf(videoFile);
      const streamUrl = `http://127.0.0.1:${this.serverPort}/${fileIndex}`;
      return { streamUrl, infoHash: existing.infoHash };
    }

    // Clean up previous torrent so bandwidth is 100% dedicated to the new stream
    await this.cleanup();

    return new Promise((resolve, reject) => {
      let timeoutTimer: NodeJS.Timeout | null = null;
      let settled = false;

      const clearAllTimers = () => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        if (this.progressInterval) {
          clearInterval(this.progressInterval);
          this.progressInterval = null;
        }
      };

      const settleResolve = (val: { streamUrl: string; infoHash: string }) => {
        if (settled) return;
        settled = true;
        clearAllTimers();
        resolve(val);
      };

      const settleReject = (err: Error) => {
        if (settled) return;
        settled = true;
        clearAllTimers();
        reject(err);
      };

      const onReady = async (torrent: any) => {
        if (settled) return;
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }

        try {
          if (!torrent.files || torrent.files.length === 0) {
            throw new Error('فایلی در این تورنت یافت نشد.');
          }

          // Pick the largest file (the main movie file)
          const file = torrent.files.reduce(
            (prev: any, curr: any) => (curr.length > prev.length ? curr : prev),
            torrent.files[0]
          );

          if (!file) throw new Error('فایل ویدیویی یافت نشد.');

          // Deselect extra files and prioritize movie file
          torrent.files.forEach((f: any) => {
            try {
              f.deselect();
            } catch (_) {}
          });
          file.select();
          prioritizeCriticalPieces(torrent, file);

          const port = await this.getFreePort();
          const contentType = guessVideoContentType(file.name);
          const fileIndex = torrent.files.indexOf(file);

          const server = http.createServer((req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
            res.setHeader('Accept-Ranges', 'bytes');

            if (req.method === 'OPTIONS') {
              res.writeHead(204);
              res.end();
              return;
            }

            if (req.method !== 'GET' && req.method !== 'HEAD') {
              res.writeHead(405, { 'Content-Type': 'text/plain' });
              res.end('Method Not Allowed');
              return;
            }

            const total = file.length;
            const rangeHeader = req.headers.range;

            if (rangeHeader) {
              const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
              if (!match) {
                res.writeHead(416, {
                  'Content-Range': `bytes */${total}`,
                  'Content-Type': contentType,
                });
                res.end();
                return;
              }

              let start = match[1] ? parseInt(match[1], 10) : 0;
              let end = match[2] ? parseInt(match[2], 10) : total - 1;

              if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end >= total || start > end) {
                res.writeHead(416, {
                  'Content-Range': `bytes */${total}`,
                  'Content-Type': contentType,
                });
                res.end();
                return;
              }

              const chunkSize = end - start + 1;
              res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${total}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': contentType,
              });

              if (req.method === 'HEAD') {
                res.end();
                return;
              }

              const stream = file.createReadStream({ start, end });

              const cleanupStream = () => {
                try {
                  if (!stream.destroyed) stream.destroy();
                } catch (_) {}
              };

              req.on('close', cleanupStream);
              res.on('close', cleanupStream);

              stream.on('error', (err: any) => {
                const isAbort =
                  err?.code === 'PREMATURE_CLOSE' ||
                  err?.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
                  err?.message?.includes('Writable stream closed') ||
                  err?.message?.includes('stream was destroyed');
                if (isAbort) return;

                console.error('[WebTorrent] Stream error:', err);
                if (!res.headersSent) {
                  try {
                    res.writeHead(500);
                    res.end();
                  } catch (_) {}
                }
              });

              stream.pipe(res);
              return;
            }

            res.writeHead(200, {
              'Content-Length': total,
              'Content-Type': contentType,
              'Accept-Ranges': 'bytes',
            });

            if (req.method === 'HEAD') {
              res.end();
              return;
            }

            const stream = file.createReadStream();

            const cleanupStream = () => {
              try {
                if (!stream.destroyed) stream.destroy();
              } catch (_) {}
            };

            req.on('close', cleanupStream);
            res.on('close', cleanupStream);

            stream.on('error', (err: any) => {
              const isAbort =
                err?.code === 'PREMATURE_CLOSE' ||
                err?.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
                err?.message?.includes('Writable stream closed') ||
                err?.message?.includes('stream was destroyed');
              if (isAbort) return;

              console.error('[WebTorrent] Stream error:', err);
              if (!res.headersSent) {
                try {
                  res.writeHead(500);
                  res.end();
                } catch (_) {}
              }
            });

            stream.pipe(res);
          });

          await new Promise<void>((res, rej) => {
            server.listen(port, '127.0.0.1', () => res());
            server.on('error', rej);
          });

          this.server = server;
          this.serverPort = port;
          const streamUrl = `http://127.0.0.1:${port}/${fileIndex}`;
          console.log(`[WebTorrent] Ready to stream: ${streamUrl}`);
          settleResolve({ streamUrl, infoHash: torrent.infoHash });
        } catch (err) {
          settleReject(err instanceof Error ? err : new Error(String(err)));
        }
      };

      let torrent: any = null;
      try {
        torrent = client.add(magnet, {
          announce: NATIVE_TRACKERS,
          path: TORRENT_DOWNLOAD_PATH,
          destroyStoreOnDestroy: true,
        } as any);
      } catch (err: any) {
        const msg = err?.message || String(err);
        settleReject(err instanceof Error ? err : new Error(msg));
        return;
      }

      this.activeTorrent = torrent;

      // Start 1-second interval for real-time progress update
      this.progressInterval = setInterval(() => {
        if (!torrent || settled) return;
        const peers = torrent.numPeers ?? 0;
        const prog = (torrent.progress ?? 0) * 100;

        if (onProgress) {
          onProgress({
            downloadSpeed: torrent.downloadSpeed || 0,
            uploadSpeed: torrent.uploadSpeed || 0,
            peers: peers,
            bufferPercent: prog,
            timeRemaining: Number.isFinite(torrent.timeRemaining) ? torrent.timeRemaining : null,
          });
        }
      }, 1000);

      if (torrent.ready) {
        onReady(torrent);
      } else {
        torrent.once('ready', () => onReady(torrent));
      }

      torrent.on('error', (err: any) => {
        const msg = err?.message || String(err);
        settleReject(err instanceof Error ? err : new Error(msg));
      });

      timeoutTimer = setTimeout(() => {
        if (settled || (torrent && torrent.ready)) return;
        const peers = torrent?.numPeers ?? 0;
        if (peers === 0) {
          settleReject(new Error('NO_PEERS: سیدری برای این فایل در شبکه پیدا نشد. لطفاً کیفیت یا سرور دیگری انتخاب کنید.'));
        } else {
          settleReject(new Error('METADATA_TIMEOUT: ارتباط برقرار شد اما دریافت اطلاعات فیلم زمان‌بر شد.'));
        }
      }, timeoutMs);
    });
  }

  public async destroy(): Promise<void> {
    await this.cleanup();
    if (this.client) {
      this.client.destroy(() => {
        this.client = null;
      });
    }
  }
}

export const torrentManager = new TorrentManager();
export default torrentManager;
