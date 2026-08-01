'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUiStore } from '../store/uiStore';
import { useRoomStore } from '../store/useRoomStore';

export default function Navbar({ onSearch }: { onSearch: (q: string) => void }) {
  const [query, setQuery] = useState('');
  const [showUsernamePopup, setShowUsernamePopup] = useState(false);
  const [quickUsername, setQuickUsername] = useState('');
  const openActiveRoomsModal = useUiStore((state) => state.openActiveRoomsModal);
  const setRoom = useRoomStore((state) => state.setRoom);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      onSearch(query.trim());
    }
  };

  const handleCreateRoom = () => {
    // Auto-generate username if not provided
    const name = quickUsername.trim() || `User_${Math.floor(Math.random() * 9999)}`;
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoom(newRoomId, name, 'host', 'Watch Party');
    router.push(`/room/${newRoomId}`);
    setShowUsernamePopup(false);
    setQuickUsername('');
  };

  return (
    <nav className="sticky top-0 z-40 w-full bg-zinc-900/50 backdrop-blur-md border-b border-white/10 p-4 flex items-center justify-between transition-all duration-300">
      {/* Logo */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <span className="text-white font-bold text-sm tracking-tighter">WP</span>
        </div>
        <h1 className="text-white font-bold text-xl tracking-wide hidden sm:block drop-shadow-md">WatchParty</h1>
      </div>

      {/* Search */}
      <form onSubmit={handleSubmit} className="flex-1 max-w-lg mx-4 sm:mx-6">
        <div className="relative group">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies & shows..."
            className="w-full bg-zinc-800/80 border border-white/10 rounded-full py-2.5 pl-12 pr-4 text-sm text-slate-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/60 focus:bg-zinc-800 transition-all shadow-inner"
          />
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 group-focus-within:text-purple-400 transition-colors"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </form>

      {/* Actions */}
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 relative">

        {/* Active Rooms */}
        <button
          onClick={() => openActiveRoomsModal()}
          className="bg-zinc-800/80 hover:bg-zinc-700 text-white/80 hover:text-white text-xs sm:text-sm font-medium px-3 sm:px-4 py-2 rounded-full border border-white/10 hover:border-white/20 transition-all flex items-center gap-2"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="hidden sm:inline">اتاق‌های فعال</span>
          <span className="sm:hidden">Rooms</span>
        </button>

        {/* Create Room — Quick */}
        <div className="relative">
          <button
            onClick={() => setShowUsernamePopup((v) => !v)}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 rounded-full shadow-lg shadow-purple-500/20 transition-all flex items-center gap-1.5 hover:scale-105"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>ساخت اتاق</span>
          </button>

          {/* Username Popup */}
          {showUsernamePopup && (
            <div className="absolute top-full right-0 mt-2 w-72 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2">
              <p className="text-white text-sm font-semibold mb-3">نام کاربری شما</p>
              <input
                autoFocus
                type="text"
                value={quickUsername}
                onChange={(e) => setQuickUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                placeholder={`User_${Math.floor(Math.random() * 9999)}`}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 mb-3"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateRoom}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-sm font-medium py-2 rounded-lg transition-all"
                >
                  ساخت اتاق ↗
                </button>
                <button
                  onClick={() => { setShowUsernamePopup(false); setQuickUsername(''); }}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white/60 rounded-lg transition-colors"
                >
                  ✕
                </button>
              </div>
              <p className="text-zinc-500 text-xs mt-2">اگر نام وارد نکنی، یه اسم تصادفی انتخاب می‌شه</p>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
