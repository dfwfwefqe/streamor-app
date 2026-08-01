'use client';

import React, { useState, useEffect } from 'react';
import { useUiStore } from '../store/uiStore';

interface ActiveRoom {
  roomId: string;
  hostUsername: string;
  title: string;
  tmdbId?: number | null;
  userCount: number;
  isPlaying: boolean;
}

const getSignalingServer = () => {
  if (process.env.NEXT_PUBLIC_SIGNALING_SERVER) {
    return process.env.NEXT_PUBLIC_SIGNALING_SERVER;
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return window.location.origin;
    }
  }
  return 'http://localhost:3001';
};

export default function ActiveRoomsModal() {
  const { isActiveRoomsModalOpen, closeActiveRoomsModal } = useUiStore();
  const [activeTab, setActiveTab] = useState<'public_rooms' | 'direct_code'>('public_rooms');
  const [rooms, setRooms] = useState<ActiveRoom[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [directRoomId, setDirectRoomId] = useState('');
  const [username, setUsername] = useState('');

  useEffect(() => {
    if (isActiveRoomsModalOpen) {
      setUsername(`User_${Math.floor(Math.random() * 9000 + 1000)}`);
      fetchRooms();
      const interval = setInterval(fetchRooms, 4000);
      return () => clearInterval(interval);
    }
  }, [isActiveRoomsModalOpen]);

  const fetchRooms = async () => {
    try {
      setIsLoading(true);
      const serverUrl = getSignalingServer();
      const res = await fetch(`${serverUrl}/api/rooms`);
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms || []);
      }
    } catch (err) {
      console.log('Failed to fetch active rooms:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isActiveRoomsModalOpen) return null;

  const handleJoinRoom = (targetRoomId: string, roomTitle?: string, tmdbId?: number | null) => {
    if (!username.trim() || !targetRoomId.trim()) return;

    const event = new CustomEvent('join_room_request', {
      detail: {
        roomId: targetRoomId.toUpperCase(),
        username,
        title: roomTitle || 'Watch Party',
        role: 'guest',
        tmdbId: tmdbId ?? null
      }
    });
    window.dispatchEvent(event);
    closeActiveRoomsModal();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-zinc-900/90 sticky top-0 z-20">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <h2 className="text-xl font-bold text-white">اتاق‌های زنده واچ پارتی (Active Rooms)</h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1">اتاق مورد نظر خود را انتخاب کنید یا با کد وارد شوید</p>
          </div>

          <button
            onClick={closeActiveRoomsModal}
            className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Username Input Bar */}
        <div className="p-4 bg-zinc-800/40 border-b border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-xs text-zinc-400 whitespace-nowrap">نام مستعار شما:</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 w-full sm:w-48"
              placeholder="نام مستعار..."
            />
          </div>

          {/* Tabs */}
          <div className="flex bg-black/40 p-1 rounded-lg border border-white/5 text-xs w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('public_rooms')}
              className={`px-4 py-1.5 rounded-md font-medium transition-all ${activeTab === 'public_rooms' ? 'bg-purple-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'}`}
            >
              اتاق‌های فعال ({rooms.length})
            </button>
            <button
              onClick={() => setActiveTab('direct_code')}
              className={`px-4 py-1.5 rounded-md font-medium transition-all ${activeTab === 'direct_code' ? 'bg-purple-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'}`}
            >
              ورود با کد اتاق
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {activeTab === 'public_rooms' ? (
            <div>
              {rooms.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-16 h-16 bg-purple-900/20 text-purple-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-purple-500/20">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </div>
                  <p className="text-zinc-300 font-semibold text-lg">هم‌اکنون هیچ اتاق عمومی فعالی وجود ندارد</p>
                  <p className="text-xs text-zinc-500 mt-2 max-w-sm mx-auto">
                    برای شروع، از لیست فیلم‌های صفحه اصلی یکی را انتخاب کرده و دکمه <b>Create New Room</b> را بزنید تا اتاق شما اینجا ظاهر شود!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {rooms.map((r) => (
                    <div
                      key={r.roomId}
                      className="bg-black/50 border border-white/10 hover:border-purple-500/50 rounded-xl p-5 transition-all group hover:scale-[1.01] flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="bg-purple-600/20 text-purple-400 border border-purple-500/20 text-xs font-mono font-bold px-2.5 py-1 rounded-md">
                            کد: {r.roomId}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            👥 {r.userCount} نفر آنلاین
                          </span>
                        </div>

                        <h3 className="text-white font-bold text-base line-clamp-1 group-hover:text-purple-300 transition-colors">
                          {r.title}
                        </h3>

                        <p className="text-xs text-zinc-400 mt-1">
                          میزبان (Host): <span className="text-zinc-200 font-medium">{r.hostUsername}</span>
                        </p>
                      </div>

                      <div className="mt-5 pt-3 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[11px] text-zinc-500">
                          {r.isPlaying ? '▶ در حال پخش' : '⏸ آماده پخش'}
                        </span>

                        <button
                          onClick={() => handleJoinRoom(r.roomId, r.title, r.tmdbId)}
                          className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-lg shadow-purple-500/20 transition-all hover:scale-105"
                        >
                          ورود به اتاق ←
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-md mx-auto py-8">
              <div className="text-center mb-6">
                <h3 className="text-lg font-bold text-white">ورود مستقیم با کد اتاق</h3>
                <p className="text-xs text-zinc-400 mt-1">کد ۶ رقمی اتاق دوستتان را وارد کنید</p>
              </div>

              <div className="space-y-4">
                <input
                  type="text"
                  value={directRoomId}
                  onChange={(e) => setDirectRoomId(e.target.value.toUpperCase())}
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-center text-white text-lg font-mono font-bold placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500 uppercase tracking-widest"
                  placeholder="مثال: KAKA1"
                />

                <button
                  onClick={() => handleJoinRoom(directRoomId)}
                  disabled={!directRoomId.trim()}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  پیوستن به اتاق
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
