'use client';

import React, { useState } from 'react';

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

interface SubtitleDisplayBoxProps {
  currentCueText: string | null;
  subtitleName: string | null;
  subtitleDelay: number;
  onDelayShift: (delta: number) => void;
  onDelayReset: () => void;
  onOpenAiModal: () => void;
  onUploadClick: () => void;
  isHost: boolean;
  activeSubtitleKey: string;
}

export default function SubtitleDisplayBox({
  currentCueText,
  subtitleName,
  subtitleDelay,
  onDelayShift,
  onDelayReset,
  onOpenAiModal,
  onUploadClick,
  isHost,
  activeSubtitleKey
}: SubtitleDisplayBoxProps) {
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('lg');
  const [textColor, setTextColor] = useState<'white' | 'yellow' | 'cyan'>('white');
  const [showSettings, setShowSettings] = useState(false);

  const fontClasses = {
    sm: 'text-sm sm:text-base leading-snug',
    md: 'text-base sm:text-lg md:text-xl leading-snug',
    lg: 'text-lg sm:text-xl md:text-2xl font-bold leading-normal',
    xl: 'text-xl sm:text-2xl md:text-3xl font-extrabold leading-normal'
  }[fontSize];

  const colorStyles = {
    white: { color: '#ffffff', textShadow: '0 2px 5px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)' },
    yellow: { color: '#fde047', textShadow: '0 2px 5px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)' },
    cyan: { color: '#67e8f9', textShadow: '0 2px 5px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)' }
  }[textColor];

  const hasActiveSubtitle = activeSubtitleKey !== 'none' && Boolean(subtitleName);

  return (
    <div className="relative w-full pointer-events-none flex flex-col items-center select-none">
      
      {/* ── 1. Minimal Live Dialogue Subtitle (Centered & Transparent) ───────── */}
      <div className="w-full flex items-center justify-center min-h-[44px] pb-1 px-4 text-center">
        {currentCueText ? (
          <div className="inline-block bg-black/60 px-3.5 py-1 rounded-lg backdrop-blur-[2px] transition-all animate-in fade-in zoom-in-95 duration-100 max-w-[90%]">
            <p
              className={`${fontClasses} font-sans tracking-wide whitespace-pre-line text-center`}
              dir="auto"
              style={colorStyles}
            >
              {currentCueText}
            </p>
          </div>
        ) : null}
      </div>

      {/* ── 2. Sleek Side Controls (Docked Floating Controls) ─────────────────── */}
      <div className="absolute -bottom-1 right-2 pointer-events-auto flex items-center gap-1.5 opacity-40 hover:opacity-100 transition-opacity">
        
        {/* Expanded Settings Pill (Slide/Fade) */}
        {showSettings && (
          <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md border border-white/15 px-2.5 py-1 rounded-xl shadow-2xl text-xs animate-in slide-in-from-right-2 duration-150" dir="rtl">
            
            {/* Active Subtitle Name */}
            {hasActiveSubtitle && (
              <span className="text-[10px] text-zinc-300 max-w-[110px] truncate" title={subtitleName || ''}>
                📁 {subtitleName}
              </span>
            )}

            {/* Font Size */}
            <div className="flex items-center bg-white/10 rounded-md p-0.5">
              {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => setFontSize(size)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                    fontSize === size ? 'bg-purple-600 text-white font-bold' : 'text-zinc-400 hover:text-white'
                  }`}
                  title={`سایز متن: ${size}`}
                >
                  {size === 'sm' ? 'A' : size === 'md' ? 'A+' : size === 'lg' ? 'A++' : 'A+++'}
                </button>
              ))}
            </div>

            {/* Subtitle Color */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTextColor('white')}
                className={`w-3.5 h-3.5 rounded-full bg-white transition-all cursor-pointer ${textColor === 'white' ? 'ring-2 ring-purple-500 scale-110' : 'opacity-60'}`}
                title="سفید"
              />
              <button
                onClick={() => setTextColor('yellow')}
                className={`w-3.5 h-3.5 rounded-full bg-yellow-300 transition-all cursor-pointer ${textColor === 'yellow' ? 'ring-2 ring-purple-500 scale-110' : 'opacity-60'}`}
                title="زرد"
              />
              <button
                onClick={() => setTextColor('cyan')}
                className={`w-3.5 h-3.5 rounded-full bg-cyan-300 transition-all cursor-pointer ${textColor === 'cyan' ? 'ring-2 ring-purple-500 scale-110' : 'opacity-60'}`}
                title="فیروزه‌ای"
              />
            </div>

            {/* Delay Adjuster */}
            {isHost && hasActiveSubtitle && (
              <div className="flex items-center gap-1 text-[10px]">
                <button
                  onClick={() => onDelayShift(-0.5)}
                  className="px-1 py-0.5 bg-white/10 hover:bg-white/20 text-white rounded font-mono cursor-pointer"
                  title="عقب (-0.5s)"
                >
                  -0.5
                </button>
                <button
                  onClick={onDelayReset}
                  className="text-purple-300 hover:text-white font-mono cursor-pointer"
                  title="ریست تاخیر"
                >
                  {subtitleDelay > 0 ? `+${subtitleDelay}s` : `${subtitleDelay}s`}
                </button>
                <button
                  onClick={() => onDelayShift(0.5)}
                  className="px-1 py-0.5 bg-white/10 hover:bg-white/20 text-white rounded font-mono cursor-pointer"
                  title="جلو (+0.5s)"
                >
                  +0.5
                </button>
              </div>
            )}

            {/* Quick AI & Upload Buttons (if no sub) */}
            {!hasActiveSubtitle && isHost && (
              <div className="flex items-center gap-1">
                <button
                  onClick={onOpenAiModal}
                  className="bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer"
                >
                  ✨ AI
                </button>
                <button
                  onClick={onUploadClick}
                  className="bg-white/10 hover:bg-white/20 text-white text-[10px] px-2 py-0.5 rounded cursor-pointer"
                >
                  📁 آپلود
                </button>
              </div>
            )}
          </div>
        )}

        {/* Toggle Settings Gear Button */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="w-6 h-6 rounded-full bg-black/60 hover:bg-purple-600 text-zinc-300 hover:text-white flex items-center justify-center border border-white/15 backdrop-blur-sm transition-all cursor-pointer text-xs"
          title="تنظیمات اندازه و رنگ زیرنویس"
        >
          ⚙️
        </button>
      </div>

    </div>
  );
}
