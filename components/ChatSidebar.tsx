'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { useChatStore } from '../store/chatStore';

interface ChatSidebarProps {
  roomId: string;
  socket: Socket | null;
  username: string;
}

export default function ChatSidebar({ roomId, socket, username }: ChatSidebarProps) {
  const { messages, addMessage, isChatOpen, setChatOpen } = useChatStore();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle incoming messages
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (payload: any) => {
      addMessage({
        id: Math.random().toString(36).substring(2, 9),
        userId: payload.userId,
        username: payload.username,
        text: payload.message,
        timestamp: payload.timestamp,
        isSelf: false,
      });
    };

    socket.on('chat_message', handleNewMessage);

    return () => {
      socket.off('chat_message', handleNewMessage);
    };
  }, [socket, addMessage]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || !socket) return;

    // Optimistic UI update
    const newMsg = {
      id: Math.random().toString(36).substring(2, 9),
      userId: 'self', // Placeholder for local ID
      username: username,
      text: trimmed,
      timestamp: Date.now(),
      isSelf: true,
    };
    addMessage(newMsg);

    // Emit to server
    socket.emit('chat_message', { message: trimmed });
    setInputText('');
  };

  // Close chat on mobile by default, open on desktop
  useEffect(() => {
    const checkMobile = () => {
        if (window.innerWidth < 768) {
            setChatOpen(false);
        } else {
            setChatOpen(true);
        }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [setChatOpen]);

  if (!isChatOpen) return null;

  return (
    <div className="flex flex-col h-full bg-black/40 backdrop-blur-xl border-l border-white/10 w-full sm:w-[320px] md:w-[380px] shrink-0 shadow-2xl transition-all">
      {/* Header */}
      <div className="h-14 px-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/5">
        <h3 className="font-semibold text-white tracking-wide flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            Room Chat
        </h3>
        <button
          onClick={() => setChatOpen(false)}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors md:hidden"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-3">
             <svg className="w-12 h-12 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" /></svg>
             <p className="text-sm">Say hello to the room!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.isSelf ? 'items-end' : 'items-start'} max-w-full animate-in fade-in slide-in-from-bottom-2`}>
              {!msg.isSelf && (
                  <span className="text-[10px] text-gray-400 mb-1 ml-1 font-medium tracking-wide uppercase">{msg.username}</span>
              )}
              <div
                className={`px-4 py-2.5 rounded-2xl max-w-[85%] break-words text-sm shadow-md
                  ${msg.isSelf
                    ? 'bg-purple-600 text-white rounded-tr-sm shadow-purple-900/20'
                    : 'bg-gray-800 text-gray-100 rounded-tl-sm border border-white/5 shadow-black/40'
                  }`}
              >
                {msg.text}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-black/20 shrink-0 border-t border-white/5">
        <form onSubmit={handleSend} className="relative flex items-center">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            maxLength={1000}
            className="w-full bg-gray-900/80 border border-white/10 rounded-full py-3 pl-4 pr-12 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500/50 transition-all shadow-inner"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="absolute right-2 p-2 rounded-full text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </form>
      </div>
    </div>
  );
}
