export interface ElectronAPI {
  windowControls: (action: 'minimize' | 'maximize' | 'close') => void;
  resolveStream: (rawUrl: string) => Promise<{ success: boolean; directUrl?: string; error?: string }>;

  // Torrent API
  searchStreams: (tmdbIdOrTitle: string | number, titleHint?: string, options?: { season?: number; episode?: number }) => void;
  onStreamResults: (callback: (results: Array<{ title: string; quality: string; size: string; magnet: string; }>) => void) => () => void;
  startTorrent: (magnet: string) => void;
  onTorrentReady: (callback: (payload: { streamUrl: string; infoHash: string }) => void) => () => void;
  onTorrentProgress: (callback: (payload: { downloadSpeed: number; uploadSpeed: number; peers: number; bufferPercent: number; timeRemaining: number | null }) => void) => () => void;
  onTorrentError: (callback: (payload: { code: string; message: string }) => void) => () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}