import { create } from 'zustand';

interface RoomState {
  roomId: string | null;
  username: string | null;
  role: 'host' | 'guest' | null;
  mediaUrl: string | null;
  selectedSubtitle: string | null;
  title: string | null;
  tmdbId: number | null;
  setRoom: (roomId: string, username: string, role: 'host' | 'guest', title?: string, tmdbId?: number) => void;
  setMediaUrl: (url: string) => void;
  setSelectedSubtitle: (url: string | null) => void;
  clearRoom: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  roomId: null,
  username: null,
  role: null,
  mediaUrl: null,
  selectedSubtitle: null,
  title: null,
  tmdbId: null,
  setRoom: (roomId, username, role, title, tmdbId) => set({ roomId, username, role, title: title || 'Watch Party', tmdbId: tmdbId ?? null }),
  setMediaUrl: (url) => set({ mediaUrl: url }),
  setSelectedSubtitle: (url) => set({ selectedSubtitle: url }),
  clearRoom: () => set({ roomId: null, username: null, role: null, mediaUrl: null, selectedSubtitle: null, title: null, tmdbId: null }),
}));