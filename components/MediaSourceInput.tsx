'use client';

import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import { useRoomStore } from '../store/useRoomStore';

interface MediaSourceInputProps {
  socket: Socket | null;
}

export default function MediaSourceInput({ socket }: MediaSourceInputProps) {
  const { setMediaUrl, role } = useRoomStore();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Set up listeners for torrent progress / error to clear loading state
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.electron) {
      const cleanupReady = window.electron.onTorrentReady(() => {
        setIsLoading(false);
      });
      const cleanupError = window.electron.onTorrentError(() => {
        setIsLoading(false);
      });
      return () => {
        cleanupReady();
        cleanupError();
      };
    }
  }, []);

  const isHost = String(role || '').toLowerCase() === 'host';
  if (!isHost) return null;

  const isElectron = () => {
    if (typeof window !== 'undefined' && typeof window.electron !== 'undefined') {
      return true;
    }
    if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().indexOf(' electron/') > -1) {
      return true;
    }
    return false;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();

    if (!trimmed) return;

    if (trimmed.startsWith('magnet:?')) {
        if (!isElectron()) {
            setError('پخش مستقیم مگنت فقط در کلاینت دسکتاپ (Electron) امکان‌پذیر است.');
            return;
        }
        if (typeof window !== 'undefined' && window.electron) {
            setIsLoading(true);
        }
    } else if (!trimmed.startsWith('http')) {
        setError('URL must start with http://, https://, or magnet:?');
        return;
    }

    setError(null);
    setMediaUrl(trimmed);

    // Sync with guests — enriched payload
    if (socket) {
        const mediaType: 'magnet' | 'direct' = trimmed.startsWith('magnet:?') ? 'magnet' : 'direct';
        const { title } = useRoomStore.getState();
        socket.emit('sync_source', { url: trimmed, mediaType, title: title || null });
    }
  };

  return (
    <div className="w-full space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center text-purple-400 flex-shrink-0 border border-purple-500/30">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">ورود سورس فیلم یا لینک مستقیم</h3>
          <p className="text-xs text-zinc-400">آدرس مستقیم ویدیو (.mp4, .m3u8) یا لینک مگنت را وارد کنید</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="text"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(null); }}
            placeholder="https://example.com/video.mp4 یا magnet:?xt=..."
            className="w-full bg-zinc-950/70 border border-white/10 rounded-xl px-4 py-3 text-slate-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
          />
        </div>

        {error && (
          <div className="bg-red-950/60 border border-red-500/30 p-3 rounded-lg flex items-center gap-2 text-red-300 text-xs">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-purple-500/20 text-sm flex items-center justify-center gap-2 ${
            isLoading ? 'bg-purple-600/50 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 hover:scale-[1.01]'
          }`}
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>در حال بارگذاری سورس...</span>
            </>
          ) : (
            <span>شروع پخش و همگام‌سازی ویدیو 🚀</span>
          )}
        </button>
      </form>

      {/* Quick Test Links & Navigation */}
      <div className="pt-2 border-t border-white/10 space-y-2">
        <p className="text-xs font-medium text-zinc-400 text-center mb-2">لینک‌های تست فوری (بدون نیاز به دانلود):</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              const testUrl = 'https://vjs.zencdn.net/v/oceans.mp4';
              setUrl(testUrl);
              setError(null);
              setMediaUrl(testUrl);
              if (socket) {
                const { title } = useRoomStore.getState();
                socket.emit('sync_source', { url: testUrl, mediaType: 'direct', title: title || 'Oceans MP4' });
              }
            }}
            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-xs py-2.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            <span>🎬</span>
            <span>ویدیو تست Oceans (MP4)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const testUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
              setUrl(testUrl);
              setError(null);
              setMediaUrl(testUrl);
              if (socket) {
                const { title } = useRoomStore.getState();
                socket.emit('sync_source', { url: testUrl, mediaType: 'direct', title: title || 'Big Buck Bunny HLS' });
              }
            }}
            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-xs py-2.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            <span>📡</span>
            <span>استریم Big Buck Bunny (HLS)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
