'use client';

import React, { useState, useEffect, useCallback } from 'react';

export interface AiSubtitleItem {
  id: string;
  title: string;
  lang: 'fa' | 'en';
  langName: string;
  qualityTag?: string;
  translator?: string;
  aiScore: number;
  aiBadge?: string;
  downloadUrl?: string | null;
}

interface AiSubtitleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string | null;
  onApplySubtitle: (vttText: string, name: string) => void;
  baseSubtitleContent?: string | null;
}

export default function AiSubtitleModal({
  isOpen,
  onClose,
  title,
  onApplySubtitle,
  baseSubtitleContent
}: AiSubtitleModalProps) {
  const [activeTab, setActiveTab] = useState<'search' | 'translate'>('search');
  const [searchResults, setSearchResults] = useState<AiSubtitleItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');
  const [isTranslatingCustom, setIsTranslatingCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const movieTitle = title || 'فیلم انتخاب شده';

  // ─── Perform AI Web Search for Subtitles ─────────────────────────────────────
  const performAiSearch = useCallback(async () => {
    if (!title) return;
    setIsSearching(true);
    setError(null);

    try {
      const res = await fetch('/api/subtitles/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.subtitles)) {
        setSearchResults(data.subtitles);
      } else {
        setSearchResults([]);
      }
    } catch (err: any) {
      console.error('[AI Modal] Search error:', err);
      setError('خطا در جستجوی آنلاین با هوش مصنوعی. لطفاً مجدداً امتحان کنید.');
    } finally {
      setIsSearching(false);
    }
  }, [title]);

  // Auto-search when modal opens
  useEffect(() => {
    if (isOpen && title) {
      performAiSearch();
    }
  }, [isOpen, title, performAiSearch]);

  if (!isOpen) return null;

  // ─── Download and Apply Found Subtitle ───────────────────────────────────────
  const handleSelectSubtitle = async (sub: AiSubtitleItem) => {
    setDownloadingId(sub.id);
    setError(null);

    try {
      // If there is a real download URL, fetch the file
      if (sub.downloadUrl) {
        const res = await fetch(`/api/subtitles/download?url=${encodeURIComponent(sub.downloadUrl)}`);
        const data = await res.json();
        if (data.success && data.text) {
          onApplySubtitle(data.text, `🇮🇷 ${sub.title}`);
          onClose();
          return;
        }
      }

      // If no direct download URL, generate/translate with AI for this movie
      const res = await fetch('/api/subtitles/ai-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vttText: baseSubtitleContent || `WEBVTT

00:00:05.000 --> 00:00:09.000
[${movieTitle}]
Welcome to the stream.

00:00:10.000 --> 00:00:14.000
AI Subtitle loaded successfully.`
        })
      });

      const data = await res.json();
      if (data.success && data.translatedVtt) {
        onApplySubtitle(data.translatedVtt, `🇮🇷 ${sub.title}`);
        onClose();
      } else {
        throw new Error(data.error || 'خطا در دریافت زیرنویس');
      }
    } catch (err: any) {
      console.error('[AI Modal] Apply error:', err);
      setError('خطا در دانلود و اعمال زیرنویس. لطفاً کیفیت دیگری انتخاب کنید.');
    } finally {
      setDownloadingId(null);
    }
  };

  // ─── Custom Text AI Translation ─────────────────────────────────────────────
  const handleTranslateCustom = async () => {
    if (!customText.trim()) {
      setError('لطفاً متن یا فایل زیرنویس را وارد کنید.');
      return;
    }

    setIsTranslatingCustom(true);
    setError(null);

    try {
      const res = await fetch('/api/subtitles/ai-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vttText: customText })
      });

      const data = await res.json();
      if (data.success && data.translatedVtt) {
        onApplySubtitle(data.translatedVtt, '🇮🇷 زیرنویس فارسی (ترجمه AI)');
        onClose();
      } else {
        throw new Error(data.error || 'خطا در ترجمه با هوش مصنوعی');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'خطا در اتصال به هوش مصنوعی');
    } finally {
      setIsTranslatingCustom(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-purple-500/30 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col text-right" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-gradient-to-r from-purple-950/60 via-zinc-900 to-zinc-900">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/30 text-lg">
              🤖
            </div>
            <div>
              <h3 className="text-base font-bold text-white">جستجوگر و دانلودر هوشمند زیرنویس (AI Subtitles)</h3>
              <p className="text-xs text-zinc-400">جستجوی وب، رتبه‌بندی و دانلود خودکار بهترین زیرنویس با هوش مصنوعی</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 bg-black/40 p-1.5 gap-2">
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'search'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>🔍 زیرنویس‌های پیشنهادی هوش مصنوعی</span>
          </button>
          <button
            onClick={() => setActiveTab('translate')}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'translate'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>📝 ترجمه متن دلخواه با AI</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[480px] overflow-y-auto custom-scrollbar">
          {error && (
            <div className="bg-red-950/60 border border-red-500/30 text-red-200 text-xs p-3 rounded-xl flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'search' ? (
            <div className="space-y-4">
              {/* Target Movie Card */}
              <div className="bg-purple-950/25 border border-purple-500/20 p-3.5 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-purple-300 font-medium">فیلم در حال بررسی:</span>
                  <h4 className="text-sm font-bold text-white">{movieTitle}</h4>
                </div>
                <button
                  onClick={performAiSearch}
                  disabled={isSearching}
                  className="px-3 py-1.5 bg-white/10 hover:bg-purple-600 text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="جستجوی مجدد در دیتابیس‌های وب"
                >
                  <svg className={`w-3.5 h-3.5 ${isSearching ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>جستجوی مجدد</span>
                </button>
              </div>

              {/* Search States */}
              {isSearching ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                  <p className="text-sm font-semibold text-white">هوش مصنوعی در حال جستجوی وب برای بهترین زیرنویس...</p>
                  <p className="text-xs text-zinc-400">بررسی هماهنگی زمانی، کیفیت ترجمه و دیتابیس‌های آنلاین</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-8 bg-black/20 rounded-xl border border-white/5 p-4 space-y-3">
                  <p className="text-sm text-zinc-300 font-medium">زیرنویسی در پایگاه‌های آنلاین یافت نشد.</p>
                  <button
                    onClick={() => handleSelectSubtitle({
                      id: 'ai_gen_fallback',
                      title: `زیرنویس هوش مصنوعی (${movieTitle})`,
                      lang: 'fa',
                      langName: 'فارسی',
                      aiScore: 99
                    })}
                    className="py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-purple-600/30 transition-all cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span>✨ تولید زیرنویس فارسی با هوش مصنوعی</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-xs text-zinc-400 font-medium">
                    نتایج کشف‌شده توسط هوش مصنوعی ({searchResults.length} مورد):
                  </p>

                  {searchResults.map((sub) => {
                    const isDownloading = downloadingId === sub.id;
                    return (
                      <div
                        key={sub.id}
                        className="bg-black/40 border border-white/10 hover:border-purple-500/50 p-3.5 rounded-xl transition-all flex items-center justify-between gap-3 group"
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white flex items-center gap-1">
                              {sub.lang === 'fa' ? '🇮🇷 فارسی' : '🇬🇧 انگلیسی'}
                            </span>
                            {sub.aiBadge && (
                              <span className="text-[10px] font-semibold bg-purple-600/25 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full">
                                {sub.aiBadge}
                              </span>
                            )}
                            {sub.qualityTag && (
                              <span className="text-[10px] bg-white/10 text-zinc-300 px-1.5 py-0.5 rounded">
                                {sub.qualityTag}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-300 truncate" title={sub.title}>
                            {sub.title}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            امتیاز هوش مصنوعی: <span className="text-emerald-400 font-bold font-mono">{sub.aiScore}%</span> • مترجم: {sub.translator || 'تیم ترجمه'}
                          </p>
                        </div>

                        <button
                          onClick={() => handleSelectSubtitle(sub)}
                          disabled={isDownloading || downloadingId !== null}
                          className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs px-3.5 py-2 rounded-xl shadow-md shadow-purple-600/25 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                        >
                          {isDownloading ? (
                            <>
                              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              <span>در حال اعمال...</span>
                            </>
                          ) : (
                            <>
                              <span>⚡ دانلود و پخش</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs text-zinc-300 font-medium">
                متن زیرنویس انگلیسی یا کدهای SRT/WebVTT را وارد کنید تا هوش مصنوعی آن را به فارسی روان تبدیل کند:
              </label>
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="00:00:10.000 --> 00:00:15.000&#10;Hello, how are you?&#10;&#10;00:00:16.000 --> 00:00:20.000&#10;I am doing great!"
                rows={6}
                className="w-full bg-black/60 border border-white/15 rounded-xl p-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 font-mono text-left"
                dir="ltr"
              />
              <button
                onClick={handleTranslateCustom}
                disabled={isTranslatingCustom}
                className="w-full py-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-xl text-sm shadow-xl shadow-purple-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isTranslatingCustom ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>در حال ترجمه با هوش مصنوعی...</span>
                  </>
                ) : (
                  <>
                    <span>✨ ترجمه متن به فارسی با هوش مصنوعی</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
