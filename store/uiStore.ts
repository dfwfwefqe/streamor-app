import { create } from 'zustand';

interface Media {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  media_type?: string;
}

interface UiState {
  isRoomModalOpen: boolean;
  isActiveRoomsModalOpen: boolean;
  selectedMedia: Media | null;
  openRoomModal: (media?: Media | null) => void;
  closeRoomModal: () => void;
  openActiveRoomsModal: () => void;
  closeActiveRoomsModal: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  isRoomModalOpen: false,
  isActiveRoomsModalOpen: false,
  selectedMedia: null,
  openRoomModal: (media) => set({ isRoomModalOpen: true, isActiveRoomsModalOpen: false, selectedMedia: media || null }),
  closeRoomModal: () => set({ isRoomModalOpen: false, selectedMedia: null }),
  openActiveRoomsModal: () => set({ isActiveRoomsModalOpen: true, isRoomModalOpen: false }),
  closeActiveRoomsModal: () => set({ isActiveRoomsModalOpen: false }),
}));
