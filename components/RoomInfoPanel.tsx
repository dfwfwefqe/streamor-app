'use client';

import { useState } from 'react';

interface RoomInfoPanelProps {
  roomId: string;
  role: string;
  memberCount?: number;
}

export default function RoomInfoPanel({ roomId, role, memberCount = 1 }: RoomInfoPanelProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<'id' | 'link' | null>(null);

  const roomUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/room/${roomId}`
    : `/room/${roomId}`;

  const copy = async (text: string, type: 'id' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // fallback for older browsers
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="اطلاعات اتاق و دعوت"
        className="flex items-center gap-2 bg-black/50 hover:bg-white/10 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-all backdrop-blur-sm border border-white/10 hover:border-white/30"
      >
        <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        <span className="hidden sm:inline font-mono tracking-widest text-xs text-white/80">{roomId}</span>
        {memberCount > 1 && (
          <span className="bg-purple-600/40 text-purple-300 text-xs px-1.5 py-0.5 rounded-full font-medium">
            {memberCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="absolute top-full left-0 mt-2 w-80 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">

            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-b border-white/10 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center text-white font-bold text-xs">WP</div>
                  <div>
                    <p className="text-white font-semibold text-sm">Watch Party Room</p>
                    <p className="text-zinc-400 text-xs flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                      {memberCount} نفر در اتاق
                    </p>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">

              {/* Room ID */}
              <div>
                <p className="text-zinc-400 text-xs font-medium mb-2 uppercase tracking-wider">کد اتاق</p>
                <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-4 py-3">
                  <span className="text-white font-mono text-xl font-bold tracking-[0.3em] flex-1">{roomId}</span>
                  <button
                    onClick={() => copy(roomId, 'id')}
                    className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                      copied === 'id'
                        ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/30'
                        : 'bg-white/10 hover:bg-white/20 text-white/70 border border-white/10'
                    }`}
                  >
                    {copied === 'id' ? (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        کپی شد!
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        کپی
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Room Link */}
              <div>
                <p className="text-zinc-400 text-xs font-medium mb-2 uppercase tracking-wider">لینک دعوت</p>
                <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5">
                  <span className="text-zinc-300 text-xs flex-1 truncate font-mono">{roomUrl}</span>
                  <button
                    onClick={() => copy(roomUrl, 'link')}
                    className={`flex-shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                      copied === 'link'
                        ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/30'
                        : 'bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/30'
                    }`}
                  >
                    {copied === 'link' ? (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        کپی شد!
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                        کپی لینک
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* How to join */}
              <div className="bg-blue-950/30 border border-blue-500/20 rounded-xl p-4">
                <p className="text-blue-300 text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  نحوه دعوت دوستان
                </p>
                <ol className="text-zinc-400 text-xs space-y-1 list-decimal list-inside">
                  <li>لینک دعوت را کپی کن و برای دوستانت بفرست</li>
                  <li>دوستانت لینک را در مرورگر باز می‌کنند</li>
                  <li>یک نام انتخاب می‌کنند و وارد اتاق می‌شوند</li>
                </ol>
              </div>

              {/* Role badge */}
              <div className="flex items-center justify-between pt-1 border-t border-white/5">
                <span className="text-zinc-500 text-xs">نقش شما</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${role === 'host' ? 'bg-purple-600/30 text-purple-300 border border-purple-500/30' : 'bg-blue-600/30 text-blue-300 border border-blue-500/30'}`}>
                  {role === 'host' ? '👑 Host' : '👤 Guest'}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
