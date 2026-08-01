'use client';

import { useUiStore } from '../store/uiStore';
import Image from 'next/image';
import { useState, useEffect } from 'react';

export default function RoomModal() {
  const { isRoomModalOpen, selectedMedia, closeRoomModal } = useUiStore();
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isRoomModalOpen) {
      setIsAnimating(true);
      // Generate a random fun username default
      setUsername(`User_${Math.floor(Math.random() * 9999)}`);
    } else {
      setTimeout(() => setIsAnimating(false), 300);
    }
  }, [isRoomModalOpen]);

  if (!isRoomModalOpen && !isAnimating) return null;

  const title = selectedMedia?.title || selectedMedia?.name || 'Media';
  const backdropUrl = selectedMedia?.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${selectedMedia.backdrop_path}`
    : null;

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !roomId.trim()) return;

    // Dispatch event to page.tsx to switch view to GuestPlayer
    const event = new CustomEvent('join_room_request', {
        detail: { roomId, username, title, role: 'guest', tmdbId: selectedMedia?.id }
    });
    window.dispatchEvent(event);

    closeRoomModal();
  };

  const handleCreate = () => {
    if (!username.trim()) return;
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    console.log(`Creating room ${newRoomId} as Host (${username}) for ${title}`);

    // Dispatch event to page.tsx to switch view as HOST
    const event = new CustomEvent('join_room_request', {
        detail: { roomId: newRoomId, username, title, role: 'host', tmdbId: selectedMedia?.id }
    });
    window.dispatchEvent(event);

    closeRoomModal();
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${isRoomModalOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={closeRoomModal}
      />

      {/* Modal Content */}
      <div className={`relative w-full max-w-3xl bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col md:flex-row transform transition-all duration-300 ${isRoomModalOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}>

        {/* Left: Media Info */}
        <div className="relative w-full md:w-1/2 min-h-[250px] md:min-h-full bg-gray-800">
          {backdropUrl ? (
            <Image
              src={backdropUrl}
              alt={title}
              fill
              className="object-cover opacity-60 mix-blend-overlay"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/50 to-blue-900/50" />
          )}

          <div className="absolute inset-0 p-6 flex flex-col justify-end bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent">
            <h2 className="text-2xl font-bold text-white mb-2 leading-tight">{title}</h2>
            <p className="text-gray-300 text-sm line-clamp-3">{selectedMedia?.overview || 'No overview available.'}</p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="w-full md:w-1/2 p-8 flex flex-col justify-center bg-gray-900/90 backdrop-blur-md relative">
          <button
            onClick={closeRoomModal}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>

          <h3 className="text-xl font-semibold text-white mb-6">Join Watch Party</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Your Nickname</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Enter nickname..."
              />
            </div>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink-0 mx-4 text-xs text-gray-500 uppercase tracking-wider">Host</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            <button
              onClick={handleCreate}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-medium py-3 rounded-lg shadow-lg shadow-purple-500/20 transition-all transform hover:-translate-y-0.5"
            >
              Create New Room
            </button>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink-0 mx-4 text-xs text-gray-500 uppercase tracking-wider">Or Join</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            <form onSubmit={handleJoin} className="space-y-3">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase text-center font-mono tracking-widest"
                placeholder="ROOM ID"
              />
              <button
                type="submit"
                disabled={!roomId.trim()}
                className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/5 font-medium py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Join Existing Room
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
