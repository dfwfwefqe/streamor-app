'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Socket } from 'socket.io-client';
import { useRoomStore } from '../store/useRoomStore';
import AiSubtitleModal from '@/components/AiSubtitleModal';
import SubtitleDisplayBox from '@/components/SubtitleDisplayBox';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  // Public TURN relay fallback for hosts/guests behind symmetric NATs
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelay', credential: 'openrelay' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelay', credential: 'openrelay' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelay', credential: 'openrelay' },
];

// ─── Subtitle utilities ───────────────────────────────────────────────────────

// Bulletproof SRT -> WebVTT converter.
function srtToWebVtt(srt: string): string {
  let input = srt.replace(/^﻿/, '').replace(/\r\n|\r/g, '\n');
  const lines: string[] = ['WEBVTT', ''];
  
  // Split blocks by double newlines or any number of blank lines
  const blocks = input.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const blockLines = block.split('\n').map(l => l.trim());
    const timeIdx = blockLines.findIndex((l) => l.includes('-->'));
    if (timeIdx === -1) continue;

    const timing = blockLines[timeIdx].replace(/(\d+),(\d+)/g, '$1.$2');
    const text = blockLines.slice(timeIdx + 1).filter((l) => l !== '');

    lines.push(timing);
    lines.push(...text);
    lines.push('');
  }

  return lines.join('\n');
}

// Ensure arbitrary subtitle text is valid WebVTT
function ensureWebVtt(text: string): string {
  if (/^\s*WEBVTT/i.test(text)) return text;
  return srtToWebVtt(text);
}

// Adjust WebVTT timestamp cues by offsetSeconds
function adjustVttTiming(vtt: string, offsetSeconds: number): string {
  if (offsetSeconds === 0) return vtt;

  const parseSeconds = (t: string): number => {
    const parts = t.trim().split(':');
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(t) || 0;
  };

  const formatTime = (totalSec: number): string => {
    const s = Math.max(0, totalSec);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = (s % 60).toFixed(3);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const [intSec, ms] = secs.split('.');
    return `${pad(hrs)}:${pad(mins)}:${pad(parseInt(intSec, 10))}.${ms || '000'}`;
  };

  return vtt.replace(/(\d+:\d+:\d+[.,]\d+|\d+:\d+[.,]\d+)\s*-->\s*(\d+:\d+:\d+[.,]\d+|\d+:\d+[.,]\d+)/g, (_, start, end) => {
    const newStart = formatTime(parseSeconds(start.replace(',', '.')) + offsetSeconds);
    const newEnd = formatTime(parseSeconds(end.replace(',', '.')) + offsetSeconds);
    return `${newStart} --> ${newEnd}`;
  });
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

// Robust VTT / SRT parser for instant on-screen real-time rendering
function parseVttCues(vttText: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  if (!vttText) return cues;

  const normalized = vttText.replace(/\r\n|\r/g, '\n');

  const parseSeconds = (t: string): number => {
    const cleanTime = t.trim().split(/\s+/)[0]; 
    const parts = cleanTime.split(':');
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2].replace(',', '.'));
    } else if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1].replace(',', '.'));
    }
    return parseFloat(cleanTime.replace(',', '.')) || 0;
  };

  // Find all matches of timing lines and their text
  const regex = /(\d+:\d+:\d+[.,]\d+|\d+:\d+[.,]\d+)\s*-->\s*(\d+:\d+:\d+[.,]\d+|\d+:\d+[.,]\d+)[^\n]*\n([\s\S]*?)(?=\n\s*\n(\d+)?\s*\n?\d+:\d+|$)/g;
  
  let match;
  while ((match = regex.exec(normalized)) !== null) {
    const startStr = match[1];
    const endStr = match[2];
    const textBlock = match[3];

    const start = parseSeconds(startStr);
    const end = parseSeconds(endStr);
    const text = textBlock.split('\n').map(l => l.trim()).filter(Boolean).join('\n');

    if (text && !isNaN(start) && !isNaN(end) && end > start) {
      cues.push({ start, end, text });
    }
  }

  // Fallback: If regex failed to capture anything due to weird formatting, try standard block split
  if (cues.length === 0) {
    const blocks = normalized.trim().split(/\n\s*\n/);
    for (const block of blocks) {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      const timeIdx = lines.findIndex((l) => l.includes('-->'));
      if (timeIdx === -1) continue;

      const [sStr, eStr] = lines[timeIdx].split('-->');
      if (sStr && eStr) {
        const start = parseSeconds(sStr);
        const end = parseSeconds(eStr);
        const textLines = lines.slice(timeIdx + 1);
        const text = textLines.join('\n');

        if (text && !isNaN(start) && !isNaN(end) && end > start) {
          cues.push({ start, end, text });
        }
      }
    }
  }

  return cues;
}

interface UniversalPlayerProps {
  socket: Socket | null;
}

interface OnlineSubtitle {
  id: string;
  lang: string;
  label: string;
  url: string;
}

interface SavedSubtitle {
  id: string;
  name: string;
  content: string;
  date: string;
}

export default function UniversalPlayer({ socket }: UniversalPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeBlobUrlRef = useRef<string | null>(null);

  const { role, mediaUrl, selectedSubtitle, setSelectedSubtitle, tmdbId, title } = useRoomStore();

  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState('Network Error');
  const [isTorrentLoading, setIsTorrentLoading] = useState(false);
  const [torrentStatus, setTorrentStatus] = useState('');
  const [isVideoBuffering, setIsVideoBuffering] = useState(false);
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);
  const [isWebRTCStream, setIsWebRTCStream] = useState(false);
  const [isWaitingForNewSource, setIsWaitingForNewSource] = useState(false);

  const [uploadedSubtitleName, setUploadedSubtitleName] = useState<string | null>(null);
  const [customSubtitleUrl, setCustomSubtitleUrl] = useState<string | null>(null);
  const [customSubtitleContent, setCustomSubtitleContent] = useState<string | null>(null);
  const [baseVttContent, setBaseVttContent] = useState<string | null>(null);
  const [parsedCues, setParsedCues] = useState<SubtitleCue[]>([]);
  const [currentCueText, setCurrentCueText] = useState<string | null>(null);
  const [savedSubtitles, setSavedSubtitles] = useState<SavedSubtitle[]>([]);
  const [subtitleDelay, setSubtitleDelay] = useState<number>(0);
  const [activeSubtitleKey, setActiveSubtitleKey] = useState<string>('none');
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);

  const [onlineSubtitles, setOnlineSubtitles] = useState<OnlineSubtitle[]>([]);
  const [isFetchingSubs, setIsFetchingSubs] = useState(false);

  const pendingWebRTCRequestsRef = useRef<Set<string>>(new Set());

  const isHost = String(role || '').toLowerCase() === 'host';

  // ─── Archive Management (LocalStorage) ──────────────────────────────────────
  const archiveStorageKey = `streamor_subs_${tmdbId || title || 'default'}`;

  const loadSavedSubtitles = useCallback(() => {
    try {
      const stored = localStorage.getItem(archiveStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setSavedSubtitles(parsed);
        }
      }
    } catch (_) {}
  }, [archiveStorageKey]);

  useEffect(() => {
    loadSavedSubtitles();
  }, [loadSavedSubtitles]);

  const saveToArchive = useCallback((name: string, content: string) => {
    try {
      const stored = localStorage.getItem(archiveStorageKey);
      let list: SavedSubtitle[] = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(list)) list = [];

      // Avoid duplicates
      const filtered = list.filter((s) => s.name !== name && s.content !== content);
      const newEntry: SavedSubtitle = {
        id: 'sub_' + Date.now(),
        name,
        content,
        date: new Date().toLocaleDateString('fa-IR')
      };
      const updated = [newEntry, ...filtered].slice(0, 15);
      localStorage.setItem(archiveStorageKey, JSON.stringify(updated));
      setSavedSubtitles(updated);
    } catch (e) {
      console.warn('[Archive] Save error:', e);
    }
  }, [archiveStorageKey]);

  const fetchOnlineSubtitles = useCallback(async () => {
    if (!mediaUrl || (!tmdbId && !title)) {
      setOnlineSubtitles([]);
      return;
    }

    setIsFetchingSubs(true);

    try {
      const res = await fetch(`/api/subtitles/search?tmdbId=${tmdbId ?? ''}&query=${encodeURIComponent(title ?? '')}`);
      const data = await res.json();
      setOnlineSubtitles(data.subtitles || []);
    } catch (err) {
      console.error('Failed to fetch online subtitles:', err);
      setOnlineSubtitles([]);
    } finally {
      setIsFetchingSubs(false);
    }
  }, [mediaUrl, tmdbId, title]);

  // Fetch online subtitles when mediaUrl, tmdbId, or title change
  useEffect(() => {
    fetchOnlineSubtitles();
  }, [fetchOnlineSubtitles]);

  const revokeOldBlobUrl = useCallback(() => {
    if (activeBlobUrlRef.current && activeBlobUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
  }, []);

  const updateActiveSubtitleCue = useCallback((currentTime: number) => {
    if (!parsedCues || parsedCues.length === 0) {
      if (currentCueText) setCurrentCueText(null);
      return;
    }
    const match = parsedCues.find((c) => currentTime >= c.start && currentTime <= c.end);
    const newText = match ? match.text : null;
    if (newText !== currentCueText) {
      setCurrentCueText(newText);
    }
  }, [parsedCues, currentCueText]);

  const applySubtitleTiming = (baseText: string, delaySec: number, name?: string) => {
    const adjustedVtt = adjustVttTiming(baseText, delaySec);
    const cues = parseVttCues(adjustedVtt);
    setParsedCues(cues);

    const subName = name || uploadedSubtitleName || 'زیرنویس';
    saveToArchive(subName, baseText);

    const blob = new Blob([adjustedVtt], { type: 'text/vtt' });
    const blobUrl = URL.createObjectURL(blob);

    revokeOldBlobUrl();
    activeBlobUrlRef.current = blobUrl;
    setSelectedSubtitle(blobUrl);

    // Ensure native textTracks are in showing mode
    setTimeout(() => {
      if (videoRef.current?.textTracks) {
        for (let i = 0; i < videoRef.current.textTracks.length; i++) {
          videoRef.current.textTracks[i].mode = 'showing';
        }
      }
    }, 100);

    if (socket && isHost) {
      socket.emit('sync_subtitle', {
        content: adjustedVtt,
        url: blobUrl,
        name: subName,
        lang: 'fa',
        delay: delaySec
      });
    }
  };

  const handleDelayShift = (delta: number) => {
    if (!baseVttContent) return;
    const newDelay = parseFloat((subtitleDelay + delta).toFixed(1));
    setSubtitleDelay(newDelay);
    applySubtitleTiming(baseVttContent, newDelay);
  };

  const handleDelayReset = () => {
    if (!baseVttContent) return;
    setSubtitleDelay(0);
    applySubtitleTiming(baseVttContent, 0);
  };

  const handleOnlineSubtitleSelect = async (url: string) => {
    if (!url) return;

    try {
      const res = await fetch(`/api/subtitles/download?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.success && data.text) {
        const vttText = ensureWebVtt(data.text);
        setBaseVttContent(vttText);
        setSubtitleDelay(0);
        setActiveSubtitleKey(url);
        applySubtitleTiming(vttText, 0, 'Online Subtitle');
      }
    } catch (err) {
      console.error('Error downloading online subtitle:', err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      try {
        const vttText = ensureWebVtt(text);
        setUploadedSubtitleName(file.name);
        setCustomSubtitleUrl(null);
        setCustomSubtitleContent(vttText);
        setBaseVttContent(vttText);
        setSubtitleDelay(0);
        setActiveSubtitleKey('uploaded');

        applySubtitleTiming(vttText, 0, file.name);
      } catch (err) {
        console.error('Failed to parse subtitle file:', err);
      }
    };

    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleSubtitleDropdownChange = (val: string) => {
    if (!val || val === 'none') {
      setActiveSubtitleKey('none');
      revokeOldBlobUrl();
      setSelectedSubtitle(null);
      setBaseVttContent(null);
      setParsedCues([]);
      setCurrentCueText(null);
      setSubtitleDelay(0);
      if (socket && isHost) socket.emit('sync_subtitle', { url: '', lang: 'fa' });
      return;
    }

    if (val.startsWith('saved:')) {
      const id = val.replace('saved:', '');
      const item = savedSubtitles.find((s) => s.id === id);
      if (item) {
        setActiveSubtitleKey(val);
        setUploadedSubtitleName(item.name);
        setCustomSubtitleContent(item.content);
        setBaseVttContent(item.content);
        applySubtitleTiming(item.content, subtitleDelay, item.name);
      }
      return;
    }

    if (val === 'uploaded' && customSubtitleContent) {
      setActiveSubtitleKey('uploaded');
      setBaseVttContent(customSubtitleContent);
      applySubtitleTiming(customSubtitleContent, subtitleDelay, uploadedSubtitleName || 'Uploaded Subtitle');
      return;
    }

    handleOnlineSubtitleSelect(val);
  };

  const [isTranslatingWithAi, setIsTranslatingWithAi] = useState(false);

  const handleAiTranslate = async () => {
    if (!baseVttContent) return;
    setIsTranslatingWithAi(true);

    try {
      const res = await fetch('/api/subtitles/ai-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vttText: baseVttContent })
      });

      const data = await res.json();
      if (data.success && data.translatedVtt) {
        const translatedText = ensureWebVtt(data.translatedVtt);
        const name = '🇮🇷 فارسی (ترجمه AI)';
        setUploadedSubtitleName(name);
        setCustomSubtitleContent(translatedText);
        setBaseVttContent(translatedText);
        setActiveSubtitleKey('uploaded');
        applySubtitleTiming(translatedText, subtitleDelay, name);
      } else {
        alert('خطا در ترجمه با هوش مصنوعی: ' + (data.error || 'لطفاً مجدداً امتحان کنید'));
      }
    } catch (err: any) {
      console.error('AI Translation error:', err);
      alert('خطا در اتصال به سرویس هوش مصنوعی');
    } finally {
      setIsTranslatingWithAi(false);
    }
  };

  const [isDraggingSub, setIsDraggingSub] = useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isHost && mediaUrl) {
      setIsDraggingSub(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingSub(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingSub(false);
    if (!isHost || !mediaUrl) return;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'srt' && ext !== 'vtt' && ext !== 'txt') return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      try {
        const vttText = ensureWebVtt(text);
        setUploadedSubtitleName(file.name);
        setCustomSubtitleUrl(null);
        setCustomSubtitleContent(vttText);
        setBaseVttContent(vttText);
        setSubtitleDelay(0);
        setActiveSubtitleKey('uploaded');

        applySubtitleTiming(vttText, 0, file.name);
      } catch (err) {
        console.error('Failed to parse dropped subtitle file:', err);
      }
    };

    reader.readAsText(file, 'utf-8');
  };

  const isElectron = () => {
    if (typeof window !== 'undefined' && typeof window.electron !== 'undefined') return true;
    if (typeof navigator !== 'undefined' && navigator.userAgent?.toLowerCase().indexOf(' electron/') > -1) return true;
    return false;
  };

  // ─── Cleanup WebRTC ────────────────────────────────────────────────────────
  const cleanupWebRTC = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
  }, []);

  // ─── HOST: Capture video element stream and create WebRTC offer per guest ───
  const startWebRTCBroadcast = useCallback(async (guestSocketId: string) => {
    if (!videoRef.current || !socket) return;

    // If a connection with this guest already exists, we previously made an offer
    // (e.g. from `user_joined`). If that offer never completed — the guest joined
    // late and its `webrtc_offer` handler wasn't ready when the offer was sent —
    // silently returning here would swallow the guest's `webrtc_stream_request`
    // and leave it stuck on the loading overlay forever. Re-send the pending offer
    // as a retry, but never disturb a live session.
    const existing = peerConnectionsRef.current.get(guestSocketId);
    if (existing) {
      const state = existing.connectionState;
      if (
        state !== 'connected' &&
        existing.localDescription && existing.localDescription.type === 'offer'
      ) {
        socket.emit('webrtc_offer', {
          targetId: guestSocketId,
          offer: existing.localDescription
        });
        console.log('[WebRTC] Re-sent pending offer to guest:', guestSocketId);
      }
      return;
    }

    try {
      // Capture the video element as a MediaStream
      const stream = (videoRef.current as any).captureStream
        ? (videoRef.current as any).captureStream()
        : (videoRef.current as any).mozCaptureStream
        ? (videoRef.current as any).mozCaptureStream()
        : null;

      if (!stream) {
        console.warn('[WebRTC] captureStream not supported in this environment');
        return;
      }

      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionsRef.current.set(guestSocketId, pc);

      stream.getTracks().forEach((track: MediaStreamTrack) => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc_ice_candidate', {
            targetId: guestSocketId,
            candidate: event.candidate.toJSON()
          });
        }
      };

      const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
      await pc.setLocalDescription(offer);

      socket.emit('webrtc_offer', {
        targetId: guestSocketId,
        offer: pc.localDescription
      });

      console.log('[WebRTC] Host sent offer to guest:', guestSocketId);
    } catch (e: any) {
      console.warn('[WebRTC] Host offer failed:', e?.message || e);
    }
  }, [socket]);

  // ─── GUEST: Handle incoming WebRTC offer from Host ──────────────────────────
  const handleWebRTCOffer = useCallback(async (senderId: string, offer: RTCSessionDescriptionInit) => {
    if (!socket) return;

    cleanupWebRTC();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnectionsRef.current.set(senderId, pc);

    pc.ontrack = (event) => {
      console.log('[WebRTC] Guest received remote track');
      if (event.streams && event.streams[0] && videoRef.current) {
        setIsWebRTCStream(true);
        setIsTorrentLoading(false);
        setTorrentStatus('');
        setError(null);
        videoRef.current.srcObject = event.streams[0];
        // Autoplay with muted first (Chrome policy), then prompt user
        videoRef.current.muted = false;
        videoRef.current.play().catch(() => {
          // Autoplay was blocked — show overlay to get user interaction
          setNeedsUserInteraction(true);
        });
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc_ice_candidate', {
          targetId: senderId,
          candidate: event.candidate.toJSON()
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Guest connection state:', pc.connectionState);
      if (pc.connectionState === 'failed') {
        setError('اتصال WebRTC قطع شد. لطفاً صفحه را رفرش کنید.');
        setErrorTitle('WebRTC Error');
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('webrtc_answer', {
      targetId: senderId,
      answer: pc.localDescription
    });

    console.log('[WebRTC] Guest sent answer to host:', senderId);
  }, [socket, cleanupWebRTC]);

  // ─── HOST: Handle WebRTC answer from Guest ──────────────────────────────────
  const handleWebRTCAnswer = useCallback(async (senderId: string, answer: RTCSessionDescriptionInit) => {
    const pc = peerConnectionsRef.current.get(senderId);
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('[WebRTC] Host received answer from', senderId, 'connection established');
    } catch (e: any) {
      console.warn('[WebRTC] Host setRemoteDescription failed:', e?.message || e);
    }
  }, []);

  // ─── Handle ICE Candidate (Host & Guest) ────────────────────────────────────
  const handleIceCandidate = useCallback(async (senderId: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionsRef.current.get(senderId);
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e: any) {
      console.warn('[WebRTC] addIceCandidate failed:', e?.message || e);
    }
  }, []);

  // ─── Socket: WebRTC Signaling Events ────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    if (isHost) {
      const handleUserJoined = (payload: { userId: string; socketId?: string }) => {
        if (payload?.socketId) {
          console.log('[WebRTC] Guest joined room with socketId:', payload.socketId);
          startWebRTCBroadcast(payload.socketId);
        }
      };

      const handleUserLeft = (payload: { socketId?: string }) => {
        if (payload?.socketId) {
          console.log('[WebRTC] Guest left, closing connection:', payload.socketId);
          const pc = peerConnectionsRef.current.get(payload.socketId);
          if (pc) {
            pc.close();
            peerConnectionsRef.current.delete(payload.socketId);
          }
        }
      };

      const handleWebRTCRequest = (payload: { senderId: string }) => {
        console.log('[WebRTC] Host received stream request from guest:', payload.senderId);
        const video = videoRef.current;
        if (video && video.readyState >= 3) { // HAVE_FUTURE_DATA
          startWebRTCBroadcast(payload.senderId);
        } else {
          console.log('[WebRTC] Video not ready yet. Queuing guest:', payload.senderId);
          pendingWebRTCRequestsRef.current.add(payload.senderId);
        }
      };

      socket.on('user_joined', handleUserJoined);
      socket.on('user_left', handleUserLeft);
      socket.on('webrtc_stream_request', handleWebRTCRequest);
      socket.on('webrtc_answer', ({ senderId, answer }: { senderId: string; answer: RTCSessionDescriptionInit }) => {
        handleWebRTCAnswer(senderId, answer);
      });
      socket.on('webrtc_ice_candidate', ({ senderId, candidate }: { senderId: string; candidate: RTCIceCandidateInit }) => {
        handleIceCandidate(senderId, candidate);
      });

      return () => {
        socket.off('user_joined', handleUserJoined);
        socket.off('user_left', handleUserLeft);
        socket.off('webrtc_stream_request', handleWebRTCRequest);
        socket.off('webrtc_answer');
        socket.off('webrtc_ice_candidate');
      };
    } else {
      // Guest: listen for WebRTC offer from host
      const handleOffer = ({ senderId, offer }: { senderId: string; offer: RTCSessionDescriptionInit }) => {
        console.log('[WebRTC] Guest received offer from host:', senderId);
        handleWebRTCOffer(senderId, offer);
      };
      const handleIceCandidateMsg = ({ senderId, candidate }: { senderId: string; candidate: RTCIceCandidateInit }) => {
        handleIceCandidate(senderId, candidate);
      };

      socket.on('webrtc_offer', handleOffer);
      socket.on('webrtc_ice_candidate', handleIceCandidateMsg);

      return () => {
        socket.off('webrtc_offer', handleOffer);
        socket.off('webrtc_ice_candidate', handleIceCandidateMsg);
      };
    }
  }, [socket, isHost, startWebRTCBroadcast, handleWebRTCOffer, handleWebRTCAnswer, handleIceCandidate]);

  // ─── Guest: For ALL source types, request WebRTC stream from host ────────────
  // (Avoids CORS for direct URLs and localhost issues for magnets)
  useEffect(() => {
    if (!socket || isHost || !mediaUrl) return;

    setIsTorrentLoading(true);
    setTorrentStatus('در حال برقراری اتصال با میزبان (Host)...');
    setIsWebRTCStream(false);

    socket.emit('webrtc_stream_request', {});
    console.log('[WebRTC] Guest requested stream from host for:', mediaUrl.startsWith('magnet:?') ? 'magnet' : 'direct');
  }, [mediaUrl, socket, isHost]);

  // ─── Guest: watch for mediaUrl cleared by host (IS_WAITING_FOR_HOST_SOURCE) ──
  useEffect(() => {
    if (isHost) return;
    if (!mediaUrl || mediaUrl === '') {
      setIsWaitingForNewSource(true);
      setIsTorrentLoading(false);
      setIsWebRTCStream(false);
      setNeedsUserInteraction(false);
      cleanupWebRTC();
      if (videoRef.current) {
        videoRef.current.pause();
        try { (videoRef.current as any).srcObject = null; } catch (_) {}
        videoRef.current.src = '';
        videoRef.current.load();
      }
    } else {
      setIsWaitingForNewSource(false);
    }
  }, [mediaUrl, isHost, cleanupWebRTC]);

  // ─── mediaUrl effect: HOST only — load direct/HLS/magnet ─────────────────────
  // ─── Play mediaUrl on HOST ──────────────────────────────────────────────────
  // Guests always receive stream via WebRTC, so they skip this entirely.
  useEffect(() => {
    if (!mediaUrl || !videoRef.current) return;
    if (!isHost) return; // Guests get stream via WebRTC captureStream relay

    const trimmed = mediaUrl.trim();
    if (trimmed.toLowerCase().startsWith('magnet:')) {
      // Host: trigger Electron torrent
      if (isElectron() && (window as any).electron) {
        setIsTorrentLoading(true);
        setTorrentStatus('Connecting to peers...');
        (window as any).electron.startTorrent(trimmed);
      }
      return;
    }

    const video = videoRef.current;
    setError(null);
    setIsWebRTCStream(false);

    let hls: Hls | null = null;

    if (trimmed.includes('.m3u8')) {
      if (Hls.isSupported()) {
        hls = new Hls({
          // More lenient settings for unreliable streams
          manifestLoadingTimeOut: 15000,
          manifestLoadingMaxRetry: 3,
          levelLoadingTimeOut: 15000,
          levelLoadingMaxRetry: 3,
          fragLoadingTimeOut: 20000,
          fragLoadingMaxRetry: 3,
        });
        hls.loadSource(trimmed);
        hls.attachMedia(video);

        hls.on(Hls.Events.ERROR, function (_event, data) {
          console.warn('[HLS] Error:', data.type, data.details, 'fatal:', data.fatal);

          if (!data.fatal) {
            // Non-fatal: HLS.js recovers automatically, just log
            return;
          }

          // Fatal error — try to recover based on type
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            console.warn('[HLS] Network error, trying to recover...');
            hls?.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            console.warn('[HLS] Media error, trying to recover...');
            hls?.recoverMediaError();
          } else {
            // Unrecoverable
            const detail = data.details || 'unknown';
            setErrorTitle('HLS Stream Error');
            setError(`خطا در بارگذاری استریم HLS (${detail}). لینک را بررسی کنید یا یک لینک MP4 مستقیم امتحان کنید.`);
          }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('[HLS] Manifest parsed, starting playback');
          video.play().catch(() => setNeedsUserInteraction(true));
        });

      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        video.src = trimmed;
        video.play().catch(() => setNeedsUserInteraction(true));
      } else {
        setError('مرورگر شما از پخش HLS پشتیبانی نمی‌کند.');
      }
    } else {
      video.src = trimmed;
      video.load();
      video.play().catch(() => setNeedsUserInteraction(true));
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [mediaUrl, isHost]);

  // ─── Electron Torrent IPC ────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).electron) return;

    const electron = (window as any).electron;

    const cleanupReady = electron.onTorrentReady(({ streamUrl }: { streamUrl: string }) => {
      console.log('[UniversalPlayer] Torrent stream ready:', streamUrl);
      if (videoRef.current) {
        videoRef.current.src = streamUrl;
        videoRef.current.load();
      }
      setIsTorrentLoading(false);
      setTorrentStatus('');
      setError(null);

      if (videoRef.current && isHost) {
        videoRef.current.play().catch(e => console.warn('Autoplay prevented:', e));
      }
    });

    const cleanupProgress = electron.onTorrentProgress?.((p: { downloadSpeed: number; uploadSpeed: number; peers: number; bufferPercent: number; timeRemaining: number | null }) => {
      if (p && typeof p.peers === 'number') {
        const speedMb = (p.downloadSpeed / (1024 * 1024)).toFixed(2);
        setTorrentStatus(`متصل به ${p.peers} همتا (Peer) | سرعت: ${speedMb} MB/s | پیشرفت: ${p.bufferPercent.toFixed(1)}%`);
      }
    });

    const cleanupError = electron.onTorrentError((errorObj: { code?: string; message?: string } | undefined) => {
      const code = errorObj?.code || 'UNKNOWN';
      const message = errorObj?.message || 'خطای ناشناخته‌ای در ارتباط با تورنت رخ داد.';
      const KNOWN_CODES = ['NO_PEERS', 'INVALID_MAGNET', 'STREAM_ERROR'];
      const logFn = KNOWN_CODES.includes(code) ? console.warn : console.error;
      logFn(`[UniversalPlayer] Torrent error [${code}]:`, message);
      setErrorTitle(code === 'NO_PEERS' ? 'Seeder یافت نشد' : code === 'INVALID_MAGNET' ? 'مگنت نامعتبر' : 'Network Error');
      setError(`خطای تورنت: ${message}`);
      setIsTorrentLoading(false);
      setTorrentStatus('');
    });

    return () => {
      cleanupReady();
      if (cleanupProgress) cleanupProgress();
      cleanupError();
    };
  }, [isHost]);

  // ─── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanupWebRTC();
      revokeOldBlobUrl();
    };
  }, [cleanupWebRTC, revokeOldBlobUrl]);

  // ─── Host Sync Events ────────────────────────────────────────────────────────
  const onPlay = () => {
    if (isHost && socket && videoRef.current) {
      socket.emit('sync_play', { timestamp: videoRef.current.currentTime });
    }
  };
  const onPause = () => {
    if (isHost && socket && videoRef.current) {
      socket.emit('sync_pause', { timestamp: videoRef.current.currentTime });
    }
  };
  const onSeeked = () => {
    if (isHost && socket && videoRef.current) {
    if (isHost && socket && videoRef.current) {
      socket.emit('sync_seek', { timestamp: videoRef.current.currentTime });
    }
  };

  const handlePlaying = () => {
    if (isHost && pendingWebRTCRequestsRef.current.size > 0) {
      console.log('[WebRTC] Video playing. Broadcasting to queued guests:', pendingWebRTCRequestsRef.current.size);
      pendingWebRTCRequestsRef.current.forEach((guestId) => {
        startWebRTCBroadcast(guestId);
      });
      pendingWebRTCRequestsRef.current.clear();
    }
  };

  // ─── Guest Sync Events ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || isHost) return;

    const handlePlay = (payload: { timestamp: number }) => {
      if (!videoRef.current) return;
      if (Math.abs(videoRef.current.currentTime - payload.timestamp) > 0.5) {
        videoRef.current.currentTime = payload.timestamp;
      }
      videoRef.current.play().catch(() => setNeedsUserInteraction(true));
    };
    const handlePause = (payload: { timestamp: number }) => {
      if (!videoRef.current) return;
      videoRef.current.currentTime = payload.timestamp;
      videoRef.current.pause();
    };
    const handleSeek = (payload: { timestamp: number }) => {
      if (!videoRef.current) return;
      videoRef.current.currentTime = payload.timestamp;
    };
    const handleSubtitle = (payload: { url?: string; content?: string; lang?: string; name?: string }) => {
      revokeOldBlobUrl();

      if (payload?.content) {
        try {
          const vttText = ensureWebVtt(payload.content);
          const blob = new Blob([vttText], { type: 'text/vtt' });
          const blobUrl = URL.createObjectURL(blob);
          activeBlobUrlRef.current = blobUrl;

          if (payload.name) {
            setUploadedSubtitleName(payload.name);
            setCustomSubtitleUrl(blobUrl);
            setCustomSubtitleContent(vttText);
          }
          setSelectedSubtitle(blobUrl);
        } catch (err) {
          console.error('Failed to parse synced subtitle content:', err);
        }
      } else if (payload?.url) {
        setSelectedSubtitle(payload.url);
      } else {
        setSelectedSubtitle(null);
      }
    };

    socket.on('sync_play', handlePlay);
    socket.on('sync_pause', handlePause);
    socket.on('sync_seek', handleSeek);
    socket.on('sync_subtitle', handleSubtitle);

    return () => {
      socket.off('sync_play', handlePlay);
      socket.off('sync_pause', handlePause);
      socket.off('sync_seek', handleSeek);
      socket.off('sync_subtitle', handleSubtitle);
    };
  }, [socket, isHost, setSelectedSubtitle]);

  const handleNativeError = (e: any) => {
    // Guests always use WebRTC relay — never try direct src, so no CORS errors
    if (!isHost) return;
    if (isTorrentLoading || isWebRTCStream) return;

    const video = videoRef.current;
    if (!video || !video.src || video.src === window.location.href || video.src === 'about:blank') return;
    if (video.error && video.error.code === 1) return; // MEDIA_ERR_ABORTED
    if (!video.error) return;

    console.warn(`[UniversalPlayer] Native video error [code ${video.error.code}]:`, video.error.message);
    setError('خطا در پخش ویدیو. لطفاً اتصال اینترنت خود را بررسی کنید یا کیفیت دیگری انتخاب کنید.');
  };

  // ─── User Interaction Handler (Autoplay Policy Fix) ─────────────────────────
  const handleUserPlayClick = () => {
    setNeedsUserInteraction(false);
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play().catch(e => console.warn('Play after click failed:', e));
    }
  };

  return (
    <div
      className="relative w-full h-full bg-black flex items-center justify-center"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Subtitle Drag & Drop Visual Overlay */}
      {isDraggingSub && (
        <div className="absolute inset-0 z-50 bg-purple-950/85 backdrop-blur-md border-4 border-dashed border-purple-400 flex flex-col items-center justify-center pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          <div className="w-20 h-20 rounded-full bg-purple-600/30 flex items-center justify-center mb-4 text-purple-300 shadow-xl animate-bounce">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">فایل زیرنویس را اینجا رها کنید</h3>
          <p className="text-purple-200 text-sm">پشتیبانی از .srt و .vtt با اعمال آنی و سینک در اتاق</p>
        </div>
      )}

      {/* Torrent / WebRTC Loading Overlay */}
      {isTorrentLoading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-6 text-center">
          <div className="w-16 h-16 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mb-5 shadow-lg shadow-purple-500/30"></div>
          <p className="text-white font-bold text-lg mb-2">
            {isWebRTCStream ? 'در حال برقراری اتصال WebRTC...' : 'در حال بارگذاری استریم فیلم...'}
          </p>
          <p className="text-purple-300 text-xs sm:text-sm font-mono max-w-md bg-purple-950/40 px-4 py-2 rounded-xl border border-purple-500/20">
            {torrentStatus || 'در حال جستجو و اتصال به سیدرهای شبکه...'}
          </p>
          {isHost && (
            <button
              onClick={() => {
                setIsTorrentLoading(false);
                useRoomStore.getState().setMediaUrl('');
              }}
              className="mt-6 text-xs text-zinc-400 hover:text-white underline cursor-pointer"
            >
              لغو و انتخاب کیفیت دیگر
            </button>
          )}
        </div>
      )}

      {/* Autoplay Interaction Overlay (Autoplay Policy Fix) */}
      {needsUserInteraction && !isTorrentLoading && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/75 backdrop-blur-md">
          <div className="text-center px-8">
            <div className="w-20 h-20 bg-purple-600/20 border border-purple-500/40 rounded-full flex items-center justify-center mx-auto mb-5 animate-pulse">
              <svg className="w-10 h-10 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            <h2 className="text-white text-2xl font-bold mb-2">پیوستن به تماشای دسته‌جمعی</h2>
            <p className="text-zinc-400 text-sm mb-6">برای شروع پخش فیلم با دوستانتان، روی دکمه زیر کلیک کنید</p>
            <button
              onClick={handleUserPlayClick}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold px-8 py-4 rounded-xl text-lg shadow-2xl shadow-purple-500/30 transition-all hover:scale-105 flex items-center gap-3 mx-auto"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              شروع تماشا
            </button>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <div className="bg-red-950/80 border border-red-500/30 p-6 rounded-xl max-w-lg text-center shadow-2xl">
            <svg className="w-10 h-10 text-red-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h4 className="text-white font-bold mb-2">{errorTitle}</h4>
            <p className="text-red-200 text-sm leading-relaxed">{error}</p>
            {isHost && (
              <button
                onClick={() => { setError(null); setErrorTitle('Network Error'); useRoomStore.getState().setMediaUrl(''); }}
                className="mt-4 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-purple-600/30 cursor-pointer"
              >
                🔄 انتخاب کیفیت یا سورس دیگر
              </button>
            )}
          </div>
        </div>
      )}

      {/* IS_WAITING_FOR_HOST_SOURCE — host is switching to new source */}
      {isWaitingForNewSource && !isHost && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/95 backdrop-blur-sm">
          <div className="text-center px-8">
            <div className="w-14 h-14 border-4 border-zinc-700 border-t-amber-400 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white font-semibold text-lg mb-1">هاست در حال انتخاب سورس جدید است...</p>
            <p className="text-zinc-500 text-sm">لطفاً صبر کنید، فیلم به زودی شروع می‌شود</p>
          </div>
        </div>
      )}

      {/* Waiting for Host (initial — no media at all) */}
      {!mediaUrl && !isHost && !isWaitingForNewSource && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950">
          <div className="w-12 h-12 border-4 border-zinc-700 border-t-purple-500 rounded-full animate-spin mb-4"></div>
          <p className="text-zinc-400 font-medium tracking-wide animate-pulse">Waiting for host to start media...</p>
        </div>
      )}

      {/* Main Video Element */}
      <video
        ref={videoRef}
        controls={isHost}
        crossOrigin="anonymous"
        className={`w-full h-full object-contain ${!isHost ? 'pointer-events-none' : ''}`}
        onPlay={onPlay}
        onPause={onPause}
        onPlaying={handlePlaying}
        onSeeked={onSeeked}
        onWaiting={() => setIsVideoBuffering(true)}
        onStalled={() => setIsVideoBuffering(true)}
          setIsTorrentLoading(false);
        }}
        onCanPlay={() => {
          setIsVideoBuffering(false);
          setIsTorrentLoading(false);
        }}
        onLoadedData={() => {
          setIsVideoBuffering(false);
          setIsTorrentLoading(false);
        }}
        onError={handleNativeError}
        onTimeUpdate={(e) => updateActiveSubtitleCue(e.currentTarget.currentTime)}
        playsInline
      >
        {selectedSubtitle && (
          <track
            key={selectedSubtitle}
            kind="subtitles"
            src={selectedSubtitle}
            srcLang="fa"
            label="فارسی / Subtitle"
            default
          />
        )}
      </video>

      {/* Live Stream / Buffer Progress Indicator */}
      {(isVideoBuffering || (isTorrentLoading && !error)) && isHost && (
        <div className="absolute bottom-16 left-4 z-20 bg-zinc-950/85 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10 text-xs text-white flex items-center gap-2.5 shadow-2xl animate-in fade-in duration-200">
          <div className="w-3.5 h-3.5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin flex-shrink-0"></div>
          <span className="font-medium text-zinc-200">{torrentStatus || 'در حال دریافت و بافرینگ قطعات ویدیو...'}</span>
        </div>
      )}

      {/* Host Subtitle Selection & Upload Toolbar (Positioned below top info bar) */}
      {isHost && mediaUrl && (
        <div className="absolute top-16 right-4 z-20 flex flex-wrap items-center gap-2 bg-zinc-950/80 p-1.5 rounded-xl border border-white/10 backdrop-blur-md shadow-2xl opacity-90 hover:opacity-100 transition-all">
          <input
            type="file"
            ref={fileInputRef}
            accept=".srt,.vtt"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            title="آپلود زیرنویس محلی (.srt یا .vtt)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>آپلود زیرنویس</span>
          </button>

          {/* Always Visible AI Subtitle Button */}
          {isHost && (
            <button
              type="button"
              onClick={() => setIsAiModalOpen(true)}
              className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg shadow-purple-500/30 hover:scale-105 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap border border-purple-400/30"
              title="مرکز هوش مصنوعی: ساخت و ترجمه زیرنویس فارسی با AI"
            >
              <span>✨ هوش مصنوعی (AI)</span>
            </button>
          )}

          {/* Unified Subtitle Selection Dropdown */}
          <select
            className="bg-black/70 text-white text-xs rounded-lg px-3 py-1.5 border border-white/20 hover:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all cursor-pointer min-w-[190px] max-w-[250px] truncate font-medium"
            value={activeSubtitleKey}
            onChange={(e) => handleSubtitleDropdownChange(e.target.value)}
          >
            <option value="none">🚫 بدون زیرنویس (خاموش)</option>

            {uploadedSubtitleName && (
              <option value="uploaded">
                📁 {uploadedSubtitleName}
              </option>
            )}

            {savedSubtitles.length > 0 && (
              <optgroup label="💾 آرشیو زیرنویس‌های این فیلم (ذخیره‌شده)">
                {savedSubtitles.map((sub) => (
                  <option key={sub.id} value={`saved:${sub.id}`}>
                    💾 {sub.name}
                  </option>
                ))}
              </optgroup>
            )}

            {onlineSubtitles.length > 0 && (
              <optgroup label="🌐 زیرنویس‌های آنلاین (فارسی / انگلیسی)">
                {onlineSubtitles.map((sub) => (
                  <option key={sub.id} value={sub.url}>
                    {sub.lang === 'fa' ? '🇮🇷' : '🇬🇧'} {sub.label}
                  </option>
                ))}
              </optgroup>
            )}

            {isFetchingSubs ? (
              <option value="" disabled>
                ⏳ در حال جستجوی زیرنویس‌های وب...
              </option>
            ) : onlineSubtitles.length === 0 ? (
              <option value="" disabled>
                (زیرنویس وب یافت نشد - فایل آپلود کنید)
              </option>
            ) : null}
          </select>

          {/* Refresh Online Subtitles Button */}
          <button
            type="button"
            onClick={fetchOnlineSubtitles}
            disabled={isFetchingSubs}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white p-1.5 rounded-lg border border-white/10 transition-colors disabled:opacity-50 cursor-pointer"
            title="جستجوی مجدد زیرنویس‌های آنلاین"
          >
            <svg className={`w-3.5 h-3.5 ${isFetchingSubs ? 'animate-spin text-purple-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {/* Subtitle Delay Adjuster (when subtitle is active) */}
          {selectedSubtitle && (
            <div className="flex items-center gap-1 bg-black/60 px-2 py-1 rounded-lg border border-white/15 text-xs">
              <span className="text-zinc-400 text-[11px]">تاخیر:</span>
              <button
                type="button"
                onClick={() => handleDelayShift(-0.5)}
                className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 text-white rounded text-[11px] font-mono cursor-pointer transition-colors"
                title="کاهش ۰.۵ ثانیه (عقب بردن زیرنویس)"
              >
                -0.5s
              </button>
              <span className="font-mono text-purple-400 text-xs min-w-[38px] text-center font-bold">
                {subtitleDelay > 0 ? `+${subtitleDelay.toFixed(1)}s` : `${subtitleDelay.toFixed(1)}s`}
              </span>
              <button
                type="button"
                onClick={() => handleDelayShift(0.5)}
                className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 text-white rounded text-[11px] font-mono cursor-pointer transition-colors"
                title="افزایش ۰.۵ ثانیه (جلو بردن زیرنویس)"
              >
                +0.5s
              </button>
              {subtitleDelay !== 0 && (
                <button
                  type="button"
                  onClick={handleDelayReset}
                  className="text-[10px] text-zinc-400 hover:text-white px-1 underline cursor-pointer"
                  title="تنظیم مجدد تاخیر به ۰"
                >
                  ریست
                </button>
              )}
            </div>
          )}

          {/* AI Subtitle Translate Button (Quick Action when subtitle is loaded) */}
          {selectedSubtitle && baseVttContent && isHost && (
            <button
              type="button"
              onClick={handleAiTranslate}
              disabled={isTranslatingWithAi}
              className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg shadow-purple-500/25 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap animate-in fade-in"
              title="ترجمه سریع و روان زیرنویس فعال به فارسی با استفاده از هوش مصنوعی"
            >
              {isTranslatingWithAi ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>در حال ترجمه با AI...</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>ترجمه به فارسی با AI</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* ── Dedicated Cinematic Subtitle Box (Below Video Frame) ──────────── */}
      {mediaUrl && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 z-20 pointer-events-auto">
          <SubtitleDisplayBox
            currentCueText={currentCueText}
            subtitleName={uploadedSubtitleName}
            subtitleDelay={subtitleDelay}
            onDelayShift={handleDelayShift}
            onDelayReset={handleDelayReset}
            onOpenAiModal={() => setIsAiModalOpen(true)}
            onUploadClick={() => fileInputRef.current?.click()}
            isHost={isHost}
            activeSubtitleKey={activeSubtitleKey}
          />
        </div>
      )}

      {/* AI Subtitle Center Modal */}
      <AiSubtitleModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        title={title}
        baseSubtitleContent={baseVttContent}
        onApplySubtitle={(translatedVtt, name) => {
          const vttText = ensureWebVtt(translatedVtt);
          setUploadedSubtitleName(name);
          setCustomSubtitleContent(vttText);
          setBaseVttContent(vttText);
          setActiveSubtitleKey('uploaded');
          applySubtitleTiming(vttText, subtitleDelay, name);
        }}
      />
    </div>
  );
}
