'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import MediaGrid from '@/components/MediaGrid';
import RoomModal from '@/components/RoomModal';
import ActiveRoomsModal from '@/components/ActiveRoomsModal';
import { useUiStore } from '@/store/uiStore';
import { useRoomStore } from '@/store/useRoomStore';

export default function Home() {
  const router = useRouter();
  const setRoom = useRoomStore((state: any) => state.setRoom);
  const openRoomModal = useUiStore((state) => state.openRoomModal);

  const [trending, setTrending] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [category, setCategory] = useState<'all' | 'movie' | 'tv'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTrending(category);

    // Listen for room join requests from RoomModal / ActiveRoomsModal
    const handleJoinEvent = (e: any) => {
        const { roomId, username, title, role, tmdbId } = e.detail;
        setRoom(roomId, username, role, title, tmdbId);
        router.push(`/room/${roomId}`);
    };
    window.addEventListener('join_room_request', handleJoinEvent);
    return () => window.removeEventListener('join_room_request', handleJoinEvent);
  }, [router, setRoom, category]);

  const fetchTrending = async (cat = 'all') => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/tmdb/trending?category=${cat}`);
      const data = await res.json();

      if (!res.ok) {
         if (!data.results) throw new Error(data.error || 'Failed to load trending content');
      }

      setTrending(data.results || []);
    } catch (err: any) {
      console.error(err);
      setError('امکان اتصال به پایگاه فیلم‌ها وجود ندارد.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (!query) {
      setIsSearching(false);
      return;
    }

    try {
      setLoading(true);
      setIsSearching(true);
      setError(null);
      const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (!res.ok) {
         if (!data.results) throw new Error(data.error || 'Search failed');
      }

      const filtered = (data.results || []).filter((item: any) => item.media_type !== 'person');
      setSearchResults(filtered);
    } catch (err: any) {
      console.error(err);
      setError('جستجو با خطا مواجه شد.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white selection:bg-purple-500/30">
      <div className="max-w-7xl mx-auto w-full">
        <Navbar onSearch={handleSearch} />

        {/* Toast Error Banner */}
        {error && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-red-900/80 border border-red-500/50 backdrop-blur-md text-red-100 px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span className="text-sm font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-2 opacity-70 hover:opacity-100">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* Hero Section (only show when not searching) */}
        {!isSearching && trending.length > 0 && (
          <div className="relative w-full h-[50vh] md:h-[60vh] max-h-[600px] overflow-hidden rounded-b-3xl shadow-2xl">
            <div className="absolute inset-0">
               <img
                 src={trending[0]?.backdrop_path ? `https://image.tmdb.org/t/p/original${trending[0]?.backdrop_path}` : 'https://placehold.co/1280x720/18181b/a1a1aa?text=Hero+Image'}
                 alt="Hero"
                 className="w-full h-full object-cover opacity-40"
               />
               <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent" />
               <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] to-transparent" />
            </div>
            <div className="absolute bottom-0 left-0 p-8 md:p-16 max-w-3xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-purple-600/80 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider backdrop-blur-md">
                  {trending[0]?.media_type === 'tv' ? '📺 سریال ویژه' : '🎬 فیلم منتخب'}
                </span>
                {trending[0]?.vote_average && (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
                    ★ {trending[0].vote_average.toFixed(1)}
                  </span>
                )}
              </div>
              <h2 className="text-4xl md:text-6xl font-bold mb-4 drop-shadow-lg text-white">
                {trending[0]?.title || trending[0]?.name}
              </h2>
              <p className="text-lg text-gray-300 line-clamp-3 mb-6 drop-shadow-md">
                {trending[0]?.overview}
              </p>
              <button
                onClick={() => openRoomModal(trending[0])}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold px-8 py-3.5 rounded-full transition-all flex items-center gap-2 shadow-lg shadow-purple-500/20 hover:scale-105"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4l12 6-12 6z" /></svg>
                شروع واچ‌پارتی
              </button>
            </div>
          </div>
        )}

        {/* Dashboard Categories Filter */}
        {!isSearching && (
          <div className="flex items-center justify-between px-6 pt-8 pb-2 flex-wrap gap-4">
            <div className="flex items-center gap-2 bg-zinc-900/90 border border-white/10 p-1.5 rounded-2xl backdrop-blur-md">
              <button
                onClick={() => setCategory('all')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  category === 'all'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                🔥 برترین‌های هفته
              </button>
              <button
                onClick={() => setCategory('movie')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  category === 'movie'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                🎬 محبوب‌ترین فیلم‌ها
              </button>
              <button
                onClick={() => setCategory('tv')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  category === 'tv'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                📺 سریال‌های ترند
              </button>
            </div>
          </div>
        )}

        <div className="w-full pb-20">
          <MediaGrid
            title={
              isSearching
                ? 'نتایج جستجو'
                : category === 'movie'
                ? 'محبوب‌ترین فیلم‌های سینمایی'
                : category === 'tv'
                ? 'سریال‌های پرطرفدار'
                : 'عناوین پرطرفدار و آماده تماشا'
            }
            items={isSearching ? searchResults : trending.slice(1)}
            loading={loading}
          />
        </div>

        <RoomModal />
        <ActiveRoomsModal />
      </div>
    </main>
  );
}
