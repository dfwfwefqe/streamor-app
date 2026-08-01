import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
  isSelf: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  isChatOpen: boolean;
  addMessage: (msg: ChatMessage) => void;
  toggleChat: () => void;
  setChatOpen: (isOpen: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isChatOpen: true, // Open by default on desktop
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),
  setChatOpen: (isOpen) => set({ isChatOpen: isOpen }),
  clearMessages: () => set({ messages: [] }),
}));
