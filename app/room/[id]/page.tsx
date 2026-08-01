'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import WatchRoomLayout from '@/components/WatchRoomLayout';
import ChatSidebar from '@/components/ChatSidebar';
import UniversalPlayer from '@/components/UniversalPlayer';
import StreamResolver from '@/components/StreamResolver';
import RoomInfoPanel from '@/components/RoomInfoPanel';
import { useRoomStore } from '@/store/useRoomStore';

const SIGNALING_SERVER = process.env.NEXT_PUBLIC_SIGNALING_SERVER || 'http://localhost:3001';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  const { username, role, title, clearRoom, setMediaUrl, mediaUrl, setRoom } = useRoomStore();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<string>('Connecting...');
  const [memberCount, setMemberCount] = useState(1);

  // ─── Username guard: if arrived without username (e.g. direct URL), ask ─────
  const [pendingUsername, setPendingUsername] = useState('');
  const [showUsernameGate, setShowUsernameGate] = useState(false);

  useEffect(() => {
    if (!username || !role) {
      setShowUsernameGate(true);
    }
  }, [username, role]);

  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = pendingUsername.trim() || `User_${Math.floor(Math.random() * 9999)}`;
    // Join as guest by default when arriving via direct URL
    setRoom(roomId, name, 'guest', 'Watch Party');
    setShowUsernameGate(false);
  };

  // ─── Socket connection ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!username || !role) return;

    const newSocket = io(SIGNALING_SERVER);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setStatus('Connected');
      newSocket.emit('join_room', {
        roomId,
        user: { userId: `${role}-${Math.random().toString(36).substring(2, 9)}`, username }
      });
    });

    newSocket.on('error_occurred', (err) => {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    });

    newSocket.on('room_joined', (payload: { roomId: string; role: string; currentMedia?: string | null }) => {
      console.log('[Room] Joined room:', payload);
      if (payload.currentMedia && role === 'guest') {
        setMediaUrl(payload.currentMedia);
      }
    });

    // Track members
    newSocket.on('user_joined', () => setMemberCount((n) => n + 1));
    newSocket.on('user_left', () => setMemberCount((n) => Math.max(1, n - 1)));

    // Listen to source sync from host
    newSocket.on('sync_source', (payload: { url: string | null; mediaType?: string; title?: string | null }) => {
      console.log('[Room] Received sync_source from host:', payload);
      if (role === 'guest') {
        if (!payload.url) {
          // Host cleared source — UniversalPlayer handles IS_WAITING_FOR_HOST_SOURCE
          setMediaUrl('');
        } else {
          setMediaUrl(payload.url);
        }
      }
    });

    // Handle room closures
    newSocket.on('room_closed', () => {
      alert('The host has closed the room.');
      clearRoom();
      router.push('/');
    });

    return () => {
      newSocket.disconnect();
    };
  }, [roomId, username, role, setMediaUrl, clearRoom, router]);

  // ─── Username Gate Overlay ────────────────────────────────────────────────────
  if (showUsernameGate) {
    return (
      <div className="fixed inset-0 bg-zinc-950 flex items-center justify-center p-4 z-50">
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-white text-xl font-bold mb-1">پیوستن به اتاق</h2>
            <p className="text-zinc-400 text-sm">یک نام برای خودت انتخاب کن</p>
          </div>
          <form onSubmit={handleUsernameSubmit} className="space-y-3">
            <input
              autoFocus
              type="text"
              value={pendingUsername}
              onChange={(e) => setPendingUsername(e.target.value)}
              placeholder="نام کاربری..."
              className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold py-3 rounded-lg transition-all"
            >
              ورود به اتاق →
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Host: change source ──────────────────────────────────────────────────────
  const handleChangeSource = () => {
    // Notify guests that host is choosing a new source
    if (socket) {
      socket.emit('sync_source', { url: null, mediaType: null, title: null });
    }
    setMediaUrl('');
  };

  if (!username || !role) return null;

  return (
    <WatchRoomLayout
      chatSidebar={
        <ChatSidebar
          roomId={roomId}
          username={username}
          socket={socket}
        />
      }
    >
      <div className="group relative w-full h-full bg-black flex flex-col">

        {/* Top Info Bar — fades in on hover while media plays */}
        <div
          className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 to-transparent z-20 flex justify-between items-center transition-opacity duration-300 ${
            mediaUrl ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
          }`}
        >
          {/* Left: back + room info + share */}
          <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
            <button
              onClick={() => { clearRoom(); router.push('/'); }}
              title="بازگشت به خانه"
              className="flex items-center gap-2 bg-black/50 hover:bg-white/10 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-all backdrop-blur-sm border border-white/10 hover:border-white/30"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">بازگشت</span>
            </button>
            <div className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider backdrop-blur-sm text-white ${role === 'host' ? 'bg-purple-600/80' : 'bg-blue-600/80'}`}>
              {role === 'host' ? 'Host' : 'Guest'}
            </div>
            <RoomInfoPanel roomId={roomId} role={role} memberCount={memberCount} />
          </div>

          {/* Right: status + change source (host) + leave */}
          <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
            <span className="text-xs text-white/40 hidden sm:block">{status}</span>

            {/* Change Source — host only, shown while media is playing */}
            {role === 'host' && mediaUrl && (
              <button
                onClick={handleChangeSource}
                title="تغییر سورس / فیلم بعدی"
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all backdrop-blur-sm border border-white/10 hover:border-white/30"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="hidden sm:inline">تغییر سورس</span>
              </button>
            )}

            <button
              onClick={() => { clearRoom(); router.push('/'); }}
              className="bg-red-500/80 hover:bg-red-500 text-white px-3 sm:px-4 py-1.5 rounded-md text-sm font-medium transition-colors backdrop-blur-sm"
            >
              Leave
            </button>
          </div>
        </div>

        {/* Stream Resolver Overlay (Host only, shown if no media is playing) */}
        {!mediaUrl && role === 'host' && <StreamResolver socket={socket} />}

        {/* The Universal Player */}
        <UniversalPlayer socket={socket} />
      </div>
    </WatchRoomLayout>
  );
}
