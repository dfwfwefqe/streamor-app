import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  windowControls: (action: 'minimize' | 'maximize' | 'close') => {
    ipcRenderer.send('window:controls', action);
  },
  resolveStream: async (rawUrl: string): Promise<{ success: boolean; directUrl?: string; error?: string }> => {
    return await ipcRenderer.invoke('stream:resolve', rawUrl);
  },

  // Torrent API
  searchStreams: (tmdbIdOrTitle: string | number, titleHint?: string, options?: { season?: number; episode?: number }) => {
    ipcRenderer.send('stream:search', { tmdbId: tmdbIdOrTitle, title: titleHint, season: options?.season, episode: options?.episode });
  },
  onStreamResults: (callback: (results: Array<{ title: string; quality: string; size: string; magnet: string; }>) => void) => {
    const handler = (_: any, payload: any) => callback(payload);
    ipcRenderer.on('stream:results', handler);
    return () => ipcRenderer.removeListener('stream:results', handler);
  },
  startTorrent: (magnet: string) => {
    ipcRenderer.send('torrent:start', magnet);
  },
  onTorrentReady: (callback: (payload: { streamUrl: string; infoHash: string }) => void) => {
    const handler = (_: any, payload: any) => callback(payload);
    ipcRenderer.on('torrent:ready', handler);
    return () => ipcRenderer.removeListener('torrent:ready', handler);
  },
  onTorrentProgress: (callback: (payload: { downloadSpeed: number; uploadSpeed: number; peers: number; bufferPercent: number; timeRemaining: number | null }) => void) => {
    const handler = (_: any, payload: any) => callback(payload);
    ipcRenderer.on('torrent:progress', handler);
    return () => ipcRenderer.removeListener('torrent:progress', handler);
  },
  onTorrentError: (callback: (payload: { code: string; message: string }) => void) => {
    const handler = (_: any, payload: any) => callback(payload);
    ipcRenderer.on('torrent:error', handler);
    return () => ipcRenderer.removeListener('torrent:error', handler);
  },
});

