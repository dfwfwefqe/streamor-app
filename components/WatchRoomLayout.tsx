'use client';

import React from 'react';
import { useChatStore } from '../store/chatStore';

interface WatchRoomLayoutProps {
  children: React.ReactNode;
  chatSidebar: React.ReactNode;
}

export default function WatchRoomLayout({ children, chatSidebar }: WatchRoomLayoutProps) {
  const { isChatOpen, toggleChat } = useChatStore();

  return (
    // We use dynamic viewport height (100dvh) to fix mobile browser bar jumping issues
    <div className="flex w-full h-[100dvh] bg-[#050505] overflow-hidden relative">

      {/* Main Video Area */}
      <div className={`flex-1 flex flex-col relative transition-all duration-300 ease-in-out`}>
        {/* Mobile Chat Toggle Floating Button */}
        {!isChatOpen && (
           <button
             onClick={toggleChat}
             className="absolute top-4 right-4 z-40 p-3 bg-black/60 backdrop-blur-md border border-white/10 rounded-full shadow-2xl text-white hover:bg-white/10 transition-all md:hidden group animate-in fade-in zoom-in"
           >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              {/* Notification dot placeholder */}
              <span className="absolute top-0 right-0 w-3 h-3 bg-purple-500 border-2 border-black rounded-full hidden group-hover:block"></span>
           </button>
        )}

        {/* Desktop Toggle (Optional, can be integrated into player controls) */}
        {!isChatOpen && (
           <button
             onClick={toggleChat}
             className="absolute top-6 right-6 z-40 px-4 py-2 bg-black/50 backdrop-blur-md border border-white/10 rounded-lg shadow-xl text-white text-sm font-medium hover:bg-white/10 transition-all hidden md:flex items-center gap-2"
           >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              Show Chat
           </button>
        )}

        {/* Video Player Container */}
        <div className="flex-1 w-full h-full relative">
          {children}
        </div>
      </div>

      {/* Chat Sidebar Area */}
      {/* On mobile: fixed and floating over the video. On desktop: standard flex column */}
      <div
        className={`
          absolute inset-y-0 right-0 z-50 transform transition-transform duration-300 ease-in-out
          md:relative md:transform-none md:flex
          ${isChatOpen ? 'translate-x-0' : 'translate-x-full md:hidden'}
        `}
      >
        {chatSidebar}
      </div>

      {/* Mobile Chat Overlay Backdrop */}
      <div
        className={`
          md:hidden absolute inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300
          ${isChatOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onClick={() => toggleChat()}
      />

    </div>
  );
}
