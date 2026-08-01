'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Socket } from 'socket.io-client';
import { useRoomStore } from '../store/useRoomStore';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

interface UniversalPlayerProps {
  socket: Socket | null;
}

export default function UniversalPlayer({ socket }: UniversalPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const { role, mediaUrl, selectedSubtitle, setSelectedSubtitle } = useRoomStore();

  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState('Network Error');
  const [isTorrentLoading, setIsTorrentLoading] = useState(false);
  const [torrentStatus, setTorrentStatus] = useState('');
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);
  const [isWebRTCStream, setIsWebRTCStream] = useState(false);
  const [isWaitingForNewSource, setIsWaitingForNewSource] = useState(false);

  const isHost = role === 'host';

  const isElectron = () => {
    if (typeof window !== 'undefined' && typeof window.electron !== 'undefined') return true;
    if (typeof navigator !== 'undefined' && navigator.userAgent?.toLowerCase().indexOf(' electron/') > -1) return true;
    return false;
  };

  // ─── Cleanup WebRTC ────────────────────────────────────────────────────────
  const cleanupWebRTC = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
  }, []);

  // ─── HOST: Capture video element stream and create WebRTC offer ─────────────
  const startWebRTCBroadcast = useCallback(async (guestSocketId: string) => {
    if (!videoRef.current || !socket) return;

    try {
      // Capture the video element as a MediaStream
      const stream = (videoRef.current as any).captureStream
        ? (videoRef.current as any).captureStream()
        : (videoRef.current as any).mozCaptureStream
        ? (videoRef.current as any).mozCaptureStream()
        : null;

      if (!stream) {
        console.warn('[WebRTC] captureStream not supported in this Electron build');
        return;
      }

      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionRef.current = pc;

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

      console.log('[WebRTC] Sent offer to guest:', guestSocketId);
    } catch (e: any) {
      console.warn('[WebRTC] Host offer failed:', e?.message || e);
    }
  }, [socket]);

  // ─── GUEST: Handle incoming WebRTC offer from Host ──────────────────────────
  const handleWebRTCOffer = useCallback(async (senderId: string, offer: RTCSessionDescriptionInit) => {
    if (!socket) return;

    cleanupWebRTC();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnectionRef.current = pc;

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
  const handleWebRTCAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('[WebRTC] Host received answer, connection established');
    } catch (e: any) {
      console.warn('[WebRTC] Host setRemoteDescription failed:', e?.message || e);
    }
  }, []);

  // ─── Handle ICE Candidate ───────────────────────────────────────────────────
  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionRef.current;
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
      // Host: when a new guest joins, broadcast stream to them
      const handleUserJoined = (payload: { userId: string; socketId?: string }) => {
        console.log('[WebRTC] New guest joined, starting broadcast...');
        // We get guestSocketId from server via user_joined event
        // The socketId may not be exposed — use the socket.id sent via join
        // For now we rely on webrtc_request from guest
      };

      const handleWebRTCRequest = (payload: { senderId: string }) => {
        console.log('[WebRTC] Host received stream request from guest:', payload.senderId);
        startWebRTCBroadcast(payload.senderId);
      };

      socket.on('user_joined', handleUserJoined);
      socket.on('webrtc_stream_request', handleWebRTCRequest);
      socket.on('webrtc_answer', ({ answer }: { answer: RTCSessionDescriptionInit }) => {
        handleWebRTCAnswer(answer);
      });
      socket.on('webrtc_ice_candidate', ({ candidate }: { candidate: RTCIceCandidateInit }) => {
        handleIceCandidate(candidate);
      });

      return () => {
        socket.off('user_joined', handleUserJoined);
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
      const handleIceCandidateMsg = ({ candidate }: { candidate: RTCIceCandidateInit }) => {
        handleIceCandidate(candidate);
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
  // Guests always receive stream via WebRTC, so they skip this entirely.
  useEffect(() => {
    if (!mediaUrl || !videoRef.current) return;
    if (!isHost) return; // Guests get stream via WebRTC captureStream relay

    if (mediaUrl.startsWith('magnet:?')) {
      // Host: trigger Electron torrent
      if (isElectron() && (window as any).electron) {
        setIsTorrentLoading(true);
        setTorrentStatus('Connecting to peers...');
        (window as any).electron.startTorrent(mediaUrl);
      }
      return;
    }

    const video = videoRef.current;
    setError(null);
    setIsWebRTCStream(false);

    let hls: Hls | null = null;

    if (mediaUrl.includes('.m3u8')) {
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
        hls.loadSource(mediaUrl);
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
        video.src = mediaUrl;
        video.play().catch(() => setNeedsUserInteraction(true));
      } else {
        setError('مرورگر شما از پخش HLS پشتیبانی نمی‌کند.');
      }
    } else {
      video.src = mediaUrl;
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
      cleanupError();
    };
  }, [isHost]);

  // ─── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanupWebRTC();
    };
  }, [cleanupWebRTC]);

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
      socket.emit('sync_seek', { timestamp: videoRef.current.currentTime });
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
    const handleSubtitle = (payload: { url: string; lang: string }) => {
      setSelectedSubtitle(payload.url || null);
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
    console.error('Video Error:', e);
    setError('خطا در پخش ویدیو. لطفاً اتصال اینترنت خود را بررسی کنید یا لینک دیگری وارد کنید.');
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
    <div className="relative w-full h-full bg-black flex items-center justify-center">

      {/* Torrent / WebRTC Loading Overlay */}
      {isTorrentLoading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-14 h-14 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4"></div>
          <p className="text-white font-semibold text-lg mb-1">
            {isWebRTCStream ? 'در حال برقراری اتصال WebRTC...' : 'Loading Stream'}
          </p>
          <p className="text-zinc-400 text-sm">{torrentStatus}</p>
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
                className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"
              >
                Try Another Link
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
        onSeeked={onSeeked}
        onError={handleNativeError}
        playsInline
      >
        {selectedSubtitle && !isWebRTCStream && (
          <track
            kind="subtitles"
            src={selectedSubtitle}
            srcLang="en"
            label="English"
            default
          />
        )}
      </video>

      {/* Host Subtitle Selection */}
      {isHost && mediaUrl && (
        <div className="absolute top-4 right-4 z-50">
          <select
            className="bg-black/60 backdrop-blur-md text-white text-sm rounded-lg px-3 py-2 border border-white/10 hover:border-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all cursor-pointer"
            value={selectedSubtitle || ''}
            onChange={(e) => {
              const url = e.target.value || null;
              setSelectedSubtitle(url);
              if (socket) socket.emit('sync_subtitle', { url: url || '', lang: 'en' });
            }}
          >
            <option value="">No Subtitles</option>
            <option value="https://raw.githubusercontent.com/andreyvit/subtitle-tools/master/sample.srt">
              English (Test Subtitle)
            </option>
          </select>
        </div>
      )}
    </div>
  );
}
