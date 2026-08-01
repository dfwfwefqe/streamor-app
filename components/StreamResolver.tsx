'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Socket } from 'socket.io-client';
import { useRoomStore } from '../store/useRoomStore';
import MediaSourceInput from './MediaSourceInput';

interface StreamResult {
  title: string;
  quality: string;
  size: string;
  seeders?: number;
  magnet: string;
}

interface StreamResolverProps {
  socket: Socket | null;
}

export default function StreamResolver({ socket }: StreamResolverProps) {
  const router = useRouter();
  const { setMediaUrl, title, tmdbId, clearRoom } = useRoomStore();
  const [results, setResults] = useState<StreamResult[]>([]);
  const [isSearching, setIsSearching] = useState(true);
  const [showManualInput, setShowManualInput] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchDispatchedRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const isElectron = typeof window !== 'undefined' && (window as any).electron && (window as any).electron.searchStreams;
    if (!isElectron) {
      setIsSearching(false);
      setShowManualInput(true);
      return;
    }

    const searchQuery = String((tmdbId ?? title) || '').trim();
    if (!searchQuery) {
      return;
    }

    setIsSearching(true);
    setError(null);

    // 1. ALWAYS register event listener so IPC results are captured
    const removeListener = (window as any).electron.onStreamResults((streamResults: StreamResult[]) => {
      console.log('[StreamResolver] Received stream results:', streamResults?.length);
      if (isMounted) {
        setResults(streamResults || []);
        setIsSearching(false);
      }
    });

    // 2. Dispatch IPC search request if not already dispatched for this query
    if (searchDispatchedRef.current !== searchQuery) {
      searchDispatchedRef.current = searchQuery;
      console.log('[StreamResolver] Dispatching stream search for:', searchQuery);
      (window as any).electron.searchStreams(searchQuery);
    }

    return () => {
      isMounted = false;
      if (removeListener) {
        removeListener();
      }
    };
  }, [title, tmdbId]);

  const handleSelectStream = (magnet: string) => {
    setMediaUrl(magnet);
    if (socket) {
      console.log('[StreamResolver] Emitting sync_source to socket:', magnet);
      socket.emit('sync_source', { url: magnet, mediaType: 'magnet', title: title || null });
    }
  };

  const handleRetrySearch = () => {
    searchDispatchedRef.current = null;
    setIsSearching(true);
    setError(null);
    setResults([]);

    if (typeof window !== 'undefined' && (window as any).electron?.searchStreams) {
      const query = String((tmdbId ?? title) || '').trim();
      console.log('[StreamResolver] Manual Retry for:', query);
      (window as any).electron.searchStreams(query);
    }
  };

  // ── Blank-room mode: no movie selected, show a clean paste-link panel ──────
  const isBlankRoom = !tmdbId && !title;
  if (isBlankRoom || showManualInput) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center z-30 p-4 bg-black/60 backdrop-blur-md">
        <div className="bg-zinc-900/95 border border-white/10 p-6 sm:p-8 rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 relative">

          {/* Header */}
          <div className="text-center mb-5">
            <div className="w-12 h-12 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-1">اتاق آماده است 🎉</h3>
            <p className="text-zinc-400 text-xs sm:text-sm">سورس فیلم را وارد کنید یا یکی از ویدیوهای تست را بزنید</p>
          </div>

          <MediaSourceInput socket={socket} />

          <div className="mt-4 pt-3 border-t border-white/10 flex flex-col gap-2">
            {!isBlankRoom && (
              <button
                onClick={() => setShowManualInput(false)}
                className="w-full text-center text-xs text-purple-400 hover:text-purple-300 font-medium py-1.5 transition-colors"
              >
                ← برگشت به لیست کیفیت‌های فیلم
              </button>
            )}

            <button
              onClick={() => { clearRoom(); router.push('/'); }}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/10 text-xs font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <span>🏠</span>
              <span>انتخاب فیلم از داشبورد (صفحه اصلی)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isSearching && results.length === 0) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center z-30 p-4">
        <div className="bg-zinc-900/90 border border-white/10 p-6 rounded-2xl shadow-xl w-full max-w-md text-center">
           <p className="text-zinc-300 mb-4 text-lg">منبعی برای این فیلم پیدا نشد.</p>
           <div className="flex gap-2 justify-center flex-wrap">
             <button
                onClick={handleRetrySearch}
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
             >
                تلاش مجدد 🔄
             </button>
             <button
                onClick={() => { clearRoom(); router.push('/'); }}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-white/10"
             >
                برگشت به داشبورد
             </button>
             <button
                onClick={() => setShowManualInput(true)}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
             >
                ورود دستی لینک
             </button>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 p-4">
      <div className="bg-zinc-900/90 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl w-full max-w-2xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
            <div className="flex items-center gap-4">
                <button
                  onClick={() => { clearRoom(); router.push('/'); }}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/10 transition-colors"
                >
                  ← برگشت به داشبورد
                </button>
                <div>
                    <h3 className="text-xl font-bold text-white">انتخاب کیفیت پخش</h3>
                    <p className="text-sm text-zinc-400 mt-1">{title || 'در حال بارگذاری...'}</p>
                </div>
            </div>
            <button
              onClick={() => setShowManualInput(true)}
              className="text-xs bg-white/5 hover:bg-white/10 text-white/70 py-1.5 px-3 rounded-md transition-colors"
            >
              ورود لینک دستی
            </button>
        </div>

        {isSearching ? (
          <div className="flex flex-col items-center justify-center py-12">
             <div className="w-10 h-10 border-4 border-zinc-700 border-t-purple-500 rounded-full animate-spin mb-4"></div>
             <p className="text-zinc-300 font-medium animate-pulse">در حال جستجو برای بهترین کیفیت‌ها...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
             <p className="text-red-400 mb-4">{error}</p>
             <button
                onClick={() => setShowManualInput(true)}
                className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-lg text-sm transition-colors"
             >
                ورود دستی لینک
             </button>
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {results.map((res, idx) => (
              <div key={idx} className="bg-black/40 border border-white/5 hover:border-purple-500/50 rounded-xl p-4 flex items-center justify-between transition-all group">
                 <div className="flex-1 pr-4 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                       <span className="bg-purple-600/20 text-purple-400 text-xs font-bold px-2 py-0.5 rounded border border-purple-500/20">{res.quality}</span>
                       {typeof res.seeders === 'number' && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                            res.seeders === 0
                              ? 'bg-red-500/20 text-red-400 border-red-500/20'
                              : res.seeders <= 5
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/20'
                              : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                          }`}>
                            {res.seeders === 0 ? '⚠️ 0 Seeders (خاموش)' : res.seeders <= 5 ? `⚠️ ${res.seeders} Seeders (ضعیف)` : `🌱 ${res.seeders} Seeders`}
                          </span>
                        )}
                       <span className="text-xs text-zinc-400">{res.size}</span>
                    </div>
                    <p className="text-xs text-zinc-400 truncate" title={res.title}>{res.title}</p>
                 </div>
                 <button
                    onClick={() => handleSelectStream(res.magnet)}
                    className="bg-white/10 group-hover:bg-purple-600 text-white p-3 rounded-lg transition-colors flex-shrink-0"
                    title="پخش این نسخه"
                 >
                    <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                 </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}