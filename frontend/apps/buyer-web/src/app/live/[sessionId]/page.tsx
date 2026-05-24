'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { BuyerApiClientError } from '@/lib/api/client';
import { buildLiveWebSocketUrl, getLiveSession, listLiveMessages, listLiveProducts, trackLiveMediaMetric, trackLiveProductClick } from '@/lib/api/live';
import { loadRecommendedProductItems } from '@/lib/api/recommendation-products';
import type { LiveMessage, LiveProduct, LiveSession, LiveSessionDetail, ProductItem } from '@/lib/api/types';
import { validateChatText } from '@/lib/chat-safety';
import { formatPrice } from '@/lib/price';
import { useAuth, useLanguage } from '@/providers/AppProvider';

type LiveDetailStatus = 'loading' | 'error' | 'success';
type SocketStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';
const BUYER_PROFILES_STORAGE_KEY = 'buyer_profiles';

interface LiveDetailPageProps {
  params: {
    sessionId: string;
  };
}

export default function LiveDetailPage({ params }: LiveDetailPageProps) {
  const router = useRouter();
  const { text } = useLanguage();
  const { user, accessToken } = useAuth();
  const sessionId = useMemo(() => safeDecode(params.sessionId), [params.sessionId]);
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const mediaPlaybackPeerRef = useRef<RTCPeerConnection | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const playbackStartedAtRef = useRef(0);
  const firstFrameTrackedRef = useRef(false);
  const bufferingCountRef = useRef(0);
  const clientIdRef = useRef(createClientMessageId());
  const broadcasterClientIdRef = useRef('');
  const negotiationIdRef = useRef('');
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const realtimeRetryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaPlaybackRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaPlaybackDisconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<LiveDetailStatus>('loading');
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('idle');
  const [realtimeStatus, setRealtimeStatus] = useState<'waiting' | 'connecting' | 'connected' | 'fallback' | 'error'>('fallback');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [detail, setDetail] = useState<LiveSessionDetail | null>(null);
  const [products, setProducts] = useState<LiveProduct[]>([]);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [chatError, setChatError] = useState('');
  const [error, setError] = useState('');
  const [playbackReloadKey, setPlaybackReloadKey] = useState(0);
  const [recommendedProducts, setRecommendedProducts] = useState<ProductItem[]>([]);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [chatNameMap, setChatNameMap] = useState<Record<string, string>>({});

  const loadDetail = useCallback(async () => {
    if (!sessionId) {
      setStatus('error');
      setError('Session id không hợp lệ.');
      return;
    }

    setStatus('loading');
    setError('');
    try {
      const data = await getLiveSession(sessionId, accessToken);
      setDetail(data);
      setProducts((data.pinnedProducts ?? []).filter((product) => product.pinStatus === 'PINNED'));
      playbackStartedAtRef.current = performance.now();
      firstFrameTrackedRef.current = false;
      setStatus('success');
    } catch (loadError) {
      setError(loadError instanceof BuyerApiClientError ? loadError.message : text.home.loadError);
      setStatus('error');
    }
  }, [accessToken, sessionId, text.home.loadError]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const loadMessageHistory = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    try {
      const history = await listLiveMessages(sessionId, { page: 1, pageSize: 50 }, accessToken);
      setMessages(history.items ?? []);
    } catch {
      setMessages([]);
    }
  }, [accessToken, sessionId]);

  useEffect(() => {
    void loadMessageHistory();
  }, [loadMessageHistory]);

  useEffect(() => {
    setChatNameMap(() => {
      const names = readBuyerProfileNames();
      if (user?.id && user.name.trim()) {
        names[user.id] = user.name.trim();
      }
      return names;
    });
  }, [user?.id, user?.name]);

  useEffect(() => {
    const productIds = products.map((product) => product.productId);
    if (productIds.length === 0) {
      setRecommendedProducts([]);
      return;
    }

    let cancelled = false;
    async function loadRecommendations() {
      setRecommendationLoading(true);
      try {
        const items = await loadRecommendedProductItems(productIds, 4);
        if (!cancelled) {
          setRecommendedProducts(items);
        }
      } catch {
        if (!cancelled) {
          setRecommendedProducts([]);
        }
      } finally {
        if (!cancelled) {
          setRecommendationLoading(false);
        }
      }
    }

    void loadRecommendations();
    return () => {
      cancelled = true;
    };
  }, [products]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      if (remoteStream) {
        void remoteVideoRef.current.play().catch(() => undefined);
      }
    }
  }, [remoteStream]);

  const appendUniqueMessage = useCallback((message: LiveMessage) => {
    setMessages((current) => {
      if (current.some((item) => item.messageId === message.messageId)) {
        return current;
      }
      return [message, ...current].slice(0, 100);
    });
  }, []);

  const emitMediaMetric = useCallback(
    (payload: { metricType: string; valueMs?: number; count?: number; errorCode?: string; playbackProtocol?: string; metadata?: Record<string, unknown> }) => {
      if (!sessionId) {
        return;
      }
      void trackLiveMediaMetric(
        sessionId,
        {
          ...payload,
          clientEventId: createClientMessageId()
        },
        accessToken
      ).catch(() => undefined);
    },
    [accessToken, sessionId]
  );

  const sendSignal = useCallback((payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(JSON.stringify({ ...payload, clientId: clientIdRef.current }));
    return true;
  }, []);

  const clearRealtimeRetryTimer = useCallback(() => {
    if (realtimeRetryTimerRef.current) {
      clearInterval(realtimeRetryTimerRef.current);
      realtimeRetryTimerRef.current = null;
    }
  }, []);

  const clearMediaPlaybackRetryTimer = useCallback(() => {
    if (mediaPlaybackRetryTimerRef.current) {
      clearTimeout(mediaPlaybackRetryTimerRef.current);
      mediaPlaybackRetryTimerRef.current = null;
    }
  }, []);

  const clearMediaPlaybackDisconnectTimer = useCallback(() => {
    if (mediaPlaybackDisconnectTimerRef.current) {
      clearTimeout(mediaPlaybackDisconnectTimerRef.current);
      mediaPlaybackDisconnectTimerRef.current = null;
    }
  }, []);

  const requestRealtimeStream = useCallback(
    (targetClientId = broadcasterClientIdRef.current) => {
      if (!sendSignal({ type: 'live:webrtc:viewer-ready', targetClientId })) {
        setRealtimeStatus('fallback');
        return;
      }
      setRealtimeStatus('waiting');
    },
    [sendSignal]
  );

  const createBuyerPeerConnection = useCallback(() => {
    peerRef.current?.close();
    remoteStreamRef.current = null;
    pendingIceCandidatesRef.current = [];
    setRemoteStream(null);
    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

    peer.ontrack = (event) => {
      const currentStream = remoteStreamRef.current ?? new MediaStream();
      if (!currentStream.getTracks().some((track) => track.id === event.track.id)) {
        currentStream.addTrack(event.track);
      }
      remoteStreamRef.current = currentStream;
      setRemoteStream(new MediaStream(currentStream.getTracks()));
      if (event.track.kind === 'video' || currentStream.getVideoTracks().length > 0) {
        setRealtimeStatus('connected');
      }
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({
          type: 'live:webrtc:ice-candidate',
          targetClientId: broadcasterClientIdRef.current,
          negotiationId: negotiationIdRef.current,
          candidate: event.candidate.toJSON()
        });
      }
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') {
        setRealtimeStatus('fallback');
      }
    };

    peerRef.current = peer;
    return peer;
  }, [sendSignal]);

  const session = detail?.session ?? null;
  const mediaPlayback = session?.media?.playback;
  const usesMediaEnginePlayback = mediaPlayback?.protocol === 'WEBRTC' && Boolean(mediaPlayback.url);
  const chatSafety = useMemo(() => validateChatText(chatInput), [chatInput]);

  useEffect(() => {
    if (!sessionId || (detail?.session.status !== 'LIVE' && detail?.session.status !== 'PAUSED')) {
      setSocketStatus('idle');
      return;
    }

    setSocketStatus('connecting');
    const protocols = accessToken ? ['live.v1', `access-token.${accessToken}`] : ['live.v1'];
    const socket = new WebSocket(buildLiveWebSocketUrl(sessionId), protocols);
    socketRef.current = socket;

    socket.onopen = () => {
      setSocketStatus('connected');
      sendSignal({ type: 'live:join' });
      if (detail?.session.status === 'LIVE' && !usesMediaEnginePlayback) {
        requestRealtimeStream();
      }
    };

    socket.onmessage = (event) => {
      const payload = safeParseSocketPayload(event.data);
      if (!payload) {
        return;
      }

      if (payload.type === 'live:viewer:count' && typeof payload.count === 'number') {
        setViewerCount(payload.count);
        return;
      }

      if (payload.type === 'error') {
        const message = typeof payload.message === 'string' ? payload.message : '';
        setChatError(message || 'Không thể gửi tin nhắn.');
        return;
      }

      const nextMessage = payload.message;
      if ((payload.type === 'live:message:new' || payload.type === 'ack') && isLiveMessage(nextMessage)) {
        appendUniqueMessage(nextMessage);
        setChatError('');
        return;
      }

      const nextProduct = payload.product;
      if (payload.type === 'live:product:pinned' && isLiveProduct(nextProduct)) {
        setProducts((current) => [nextProduct, ...current.filter((product) => product.productId !== nextProduct.productId)]);
        return;
      }

      if (payload.type === 'live:product:unpinned' && typeof payload.productId === 'string') {
        setProducts((current) => current.filter((product) => product.productId !== payload.productId));
        return;
      }

      if (payload.type === 'live:session:status' && typeof payload.status === 'string') {
        setDetail((current) =>
          current ? { ...current, session: { ...current.session, status: payload.status as LiveSession['status'] } } : current
        );
        return;
      }

      if (payload.fromClientId === clientIdRef.current) {
        return;
      }

      if (payload.type === 'live:webrtc:broadcaster-ready') {
        const broadcasterClientId = typeof payload.fromClientId === 'string' ? payload.fromClientId : '';
        broadcasterClientIdRef.current = broadcasterClientId;
        requestRealtimeStream(broadcasterClientId);
        return;
      }

      if (payload.type === 'live:webrtc:offer' && payload.sdp) {
        if (typeof payload.targetClientId === 'string' && payload.targetClientId !== clientIdRef.current) {
          return;
        }
        const broadcasterClientId = typeof payload.fromClientId === 'string' ? payload.fromClientId : '';
        broadcasterClientIdRef.current = broadcasterClientId;
        const negotiationId = typeof payload.negotiationId === 'string' ? payload.negotiationId : createClientMessageId();
        negotiationIdRef.current = negotiationId;
        const peer = createBuyerPeerConnection();
        setRealtimeStatus('connecting');
        void peer
          .setRemoteDescription(new RTCSessionDescription(payload.sdp as RTCSessionDescriptionInit))
          .then(() => Promise.all(pendingIceCandidatesRef.current.splice(0).map((candidate) => peer.addIceCandidate(new RTCIceCandidate(candidate)))))
          .then(() => peer.createAnswer())
          .then((answer) => peer.setLocalDescription(answer).then(() => answer))
          .then((answer) => {
            sendSignal({
              type: 'live:webrtc:answer',
              targetClientId: broadcasterClientId,
              negotiationId,
              sdp: { type: answer.type, sdp: answer.sdp }
            });
          })
          .catch(() => {
            setRealtimeStatus('error');
          });
        return;
      }

      if (payload.type === 'live:webrtc:ice-candidate' && payload.candidate) {
        if (typeof payload.targetClientId === 'string' && payload.targetClientId !== clientIdRef.current) {
          return;
        }
        if (typeof payload.fromClientId === 'string' && payload.fromClientId !== broadcasterClientIdRef.current) {
          return;
        }
        if (typeof payload.negotiationId === 'string' && payload.negotiationId !== negotiationIdRef.current) {
          return;
        }
        const candidate = payload.candidate as RTCIceCandidateInit;
        const peer = peerRef.current;
        if (!peer?.remoteDescription) {
          pendingIceCandidatesRef.current.push(candidate);
          return;
        }
        void peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
      }
    };

    socket.onerror = () => {
      setSocketStatus('error');
    };

    socket.onclose = () => {
      setSocketStatus((current) => (current === 'error' ? 'error' : 'closed'));
    };

    return () => {
      socketRef.current = null;
      clearRealtimeRetryTimer();
      peerRef.current?.close();
      peerRef.current = null;
      broadcasterClientIdRef.current = '';
      negotiationIdRef.current = '';
      pendingIceCandidatesRef.current = [];
      remoteStreamRef.current = null;
      setRemoteStream(null);
      socket.close();
    };
  }, [
    accessToken,
    appendUniqueMessage,
    clearRealtimeRetryTimer,
    createBuyerPeerConnection,
    detail?.session.status,
    requestRealtimeStream,
    sendSignal,
    sessionId,
    usesMediaEnginePlayback
  ]);

  useEffect(() => {
    if (!usesMediaEnginePlayback || detail?.session.status !== 'LIVE' || !mediaPlayback?.url) {
      clearMediaPlaybackRetryTimer();
      return;
    }

    let cancelled = false;
    const scheduleMediaPlaybackReconnect = () => {
      if (cancelled || mediaPlaybackRetryTimerRef.current) {
        return;
      }
      mediaPlaybackRetryTimerRef.current = setTimeout(() => {
        mediaPlaybackRetryTimerRef.current = null;
        if (!cancelled) {
          setPlaybackReloadKey((current) => current + 1);
        }
      }, 3000);
    };
    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    clearMediaPlaybackRetryTimer();
    clearMediaPlaybackDisconnectTimer();
    mediaPlaybackPeerRef.current?.close();
    mediaPlaybackPeerRef.current = peer;
    remoteStreamRef.current = null;
    setRemoteStream(null);
    setRealtimeStatus('connecting');
    firstFrameTrackedRef.current = false;
    bufferingCountRef.current = 0;
    playbackStartedAtRef.current = performance.now();

    peer.addTransceiver('video', { direction: 'recvonly' });
    peer.addTransceiver('audio', { direction: 'recvonly' });
    peer.ontrack = (event) => {
      const currentStream = remoteStreamRef.current ?? new MediaStream();
      if (!currentStream.getTracks().some((track) => track.id === event.track.id)) {
        currentStream.addTrack(event.track);
      }
      remoteStreamRef.current = currentStream;
      setRemoteStream(new MediaStream(currentStream.getTracks()));
      setRealtimeStatus('connected');
      clearMediaPlaybackRetryTimer();
      clearMediaPlaybackDisconnectTimer();
      if (!firstFrameTrackedRef.current) {
        firstFrameTrackedRef.current = true;
        emitMediaMetric({
          metricType: 'first_frame',
          playbackProtocol: mediaPlayback.protocol,
          valueMs: Math.round(performance.now() - playbackStartedAtRef.current)
        });
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        clearMediaPlaybackDisconnectTimer();
      }
      if (peer.connectionState === 'failed') {
        setRealtimeStatus('error');
        scheduleMediaPlaybackReconnect();
        emitMediaMetric({
          metricType: 'playback_error',
          playbackProtocol: mediaPlayback.protocol,
          errorCode: peer.connectionState
        });
      }
      if (peer.connectionState === 'disconnected' && !mediaPlaybackDisconnectTimerRef.current) {
        mediaPlaybackDisconnectTimerRef.current = setTimeout(() => {
          mediaPlaybackDisconnectTimerRef.current = null;
          if (peer.connectionState !== 'disconnected') {
            return;
          }
          setRealtimeStatus('error');
          scheduleMediaPlaybackReconnect();
          emitMediaMetric({
            metricType: 'playback_error',
            playbackProtocol: mediaPlayback.protocol,
            errorCode: 'disconnected'
          });
        }, 5000);
      }
    };

    void publishWHEPOffer(peer, mediaPlayback.url)
      .then(() => {
        if (!cancelled && !remoteStreamRef.current) {
          setRealtimeStatus('connecting');
        }
      })
      .catch((playbackError) => {
        if (cancelled) {
          return;
        }
        setRealtimeStatus('error');
        scheduleMediaPlaybackReconnect();
        emitMediaMetric({
          metricType: 'playback_error',
          playbackProtocol: mediaPlayback.protocol,
          errorCode: playbackError instanceof Error ? playbackError.message.slice(0, 120) : 'whep_failed'
        });
      });

    return () => {
      cancelled = true;
      clearMediaPlaybackRetryTimer();
      clearMediaPlaybackDisconnectTimer();
      if (mediaPlaybackPeerRef.current === peer) {
        mediaPlaybackPeerRef.current = null;
      }
      peer.close();
    };
  }, [
    clearMediaPlaybackRetryTimer,
    clearMediaPlaybackDisconnectTimer,
    detail?.session.status,
    emitMediaMetric,
    mediaPlayback?.protocol,
    mediaPlayback?.url,
    playbackReloadKey,
    usesMediaEnginePlayback
  ]);

  useEffect(() => {
    if (usesMediaEnginePlayback || detail?.session.status !== 'LIVE' || socketStatus !== 'connected' || realtimeStatus === 'connected') {
      clearRealtimeRetryTimer();
      return;
    }

    if (realtimeRetryTimerRef.current) {
      return;
    }

    realtimeRetryTimerRef.current = setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        requestRealtimeStream();
      }
    }, 3000);

    return () => {
      clearRealtimeRetryTimer();
    };
  }, [clearRealtimeRetryTimer, detail?.session.status, realtimeStatus, requestRealtimeStream, socketStatus, usesMediaEnginePlayback]);

  const handleSendMessage = useCallback(() => {
    const textValue = chatInput.trim();
    if (!textValue || socketRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }
    if (!chatSafety.allowed) {
      setChatError(chatSafety.message ?? 'Tin nhắn không phù hợp.');
      return;
    }

    socketRef.current.send(
      JSON.stringify({
        type: 'live:message:create',
        text: textValue,
        clientMessageId: createClientMessageId(),
        language: 'vi'
      })
    );
    setChatInput('');
    setChatError('');
  }, [chatInput, chatSafety.allowed, chatSafety.message]);

  const handleOpenProduct = useCallback(
    (productId: string) => {
      if (sessionId) {
        void trackLiveProductClick(sessionId, productId, accessToken).catch(() => undefined);
      }
      router.push(`/products/${encodeURIComponent(productId)}`);
    },
    [accessToken, router, sessionId]
  );

  const keywords = useMemo(() => products.map((product) => product.nameSnapshot).slice(0, 6), [products]);
  const streamStatusLabel = formatViewerStreamStatus(realtimeStatus, socketStatus);
  const isSessionLive = session?.status === 'LIVE';
  const fallbackPlaybackUrl = mediaPlayback?.protocol === 'WEBRTC' ? session?.playbackUrl : mediaPlayback?.url || session?.playbackUrl;
  const chatEmojis = ['🔥', '❤️', '👍', '😍'];

  return (
    <div className="min-h-screen bg-[#f5f2ec] text-[#171717]">
      <Header keywords={keywords.length > 0 ? keywords : ['livestream', 'live sale', 'deal hot']} />

      <main className="mx-auto w-full max-w-[1360px] px-4 py-6 md:px-6 md:py-8">
        {status === 'loading' ? <p className="py-16 text-center text-sm font-medium text-slate-500">{text.home.loading}</p> : null}

        {status === 'error' ? (
          <section className="mx-auto mt-8 max-w-xl rounded-2xl border border-red-100 bg-white p-6 text-center text-slate-900 shadow-sm">
            <p className="text-sm text-red-600">{error || text.home.loadError}</p>
            <Link href="/live" className="mt-4 inline-flex rounded-lg bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#db4729]">
              Về danh sách live
            </Link>
          </section>
        ) : null}

        {status === 'success' && session ? (
          <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,900px)_380px] xl:justify-center">
            <article className="space-y-4">
              <div className="rounded-3xl border border-[#ead8ca] bg-white p-5 shadow-[0_16px_45px_rgba(38,31,26,0.08)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold text-white shadow-sm ${isSessionLive ? 'bg-[#E84C3D]' : 'bg-slate-500'}`}>
                        {formatSessionStatus(session.status)}
                      </span>
                      <span className="rounded-full border border-[#f2c7b8] bg-[#fff4ea] px-3 py-1 text-xs font-bold text-[#9a3412]">
                        {viewerCount.toLocaleString('vi-VN')} đang xem
                      </span>
                      <span className="rounded-full border border-[#f4c7b8] bg-[#fff7ed] px-3 py-1 text-xs font-bold text-[#9a3412]">{streamStatusLabel}</span>
                    </div>
                    <h1 className="mt-3 text-2xl font-bold leading-tight text-[#111827] md:text-3xl">{session.title}</h1>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-[#667085]">{session.description || 'Shop đang phát trực tiếp.'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshProducts(session.sessionId)}
                    className="rounded-xl border border-[#e2d8cd] bg-white px-4 py-2 text-sm font-bold text-[#9a3412] transition hover:border-[#ee4d2d] hover:bg-[#fff8f3]"
                  >
                    Làm mới sản phẩm
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-3xl border border-[#ead8ca] bg-white shadow-[0_18px_60px_rgba(38,31,26,0.10)]">
                <div className="relative bg-[#090b10]">
                  {!isSessionLive ? (
                    <div className="flex aspect-video items-center justify-center px-6 text-center text-sm text-white/70">
                      {session.status === 'PAUSED'
                        ? 'Phiên livestream đang tạm ngừng. Khi shop tiếp tục LIVE, trang sẽ tự kết nối lại.'
                        : 'Phiên livestream đã kết thúc.'}
                    </div>
                  ) : remoteStream ? (
                    <video
                      ref={remoteVideoRef}
                      controls
                      controlsList="nofullscreen nodownload noremoteplayback"
                      disablePictureInPicture
                      playsInline
                      autoPlay
                      onLoadedMetadata={(event) => {
                        void event.currentTarget.play().catch(() => undefined);
                      }}
                      className="aspect-video max-h-[72vh] w-full bg-[#090b10] object-contain"
                    />
                  ) : fallbackPlaybackUrl ? (
                    <div className="relative">
                      <video
                        src={fallbackPlaybackUrl}
                        poster={session.thumbnailUrl || undefined}
                        controls
                        controlsList="nofullscreen nodownload noremoteplayback"
                        disablePictureInPicture
                        playsInline
                        autoPlay
                        onLoadedData={() => {
                          if (firstFrameTrackedRef.current) {
                            return;
                          }
                          firstFrameTrackedRef.current = true;
                          emitMediaMetric({
                            metricType: 'first_frame',
                            playbackProtocol: mediaPlayback?.protocol ?? 'HTML_VIDEO',
                            valueMs: Math.round(performance.now() - playbackStartedAtRef.current)
                          });
                        }}
                        onWaiting={() => {
                          bufferingCountRef.current += 1;
                          emitMediaMetric({
                            metricType: 'buffering',
                            playbackProtocol: mediaPlayback?.protocol ?? 'HTML_VIDEO',
                            count: bufferingCountRef.current
                          });
                        }}
                        onError={(event) => {
                          emitMediaMetric({
                            metricType: 'playback_error',
                            playbackProtocol: mediaPlayback?.protocol ?? 'HTML_VIDEO',
                            errorCode: `media_${event.currentTarget.error?.code ?? 'unknown'}`
                          });
                        }}
                        className="aspect-video max-h-[72vh] w-full bg-[#090b10] object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex aspect-video items-center justify-center px-6 text-center text-sm text-white/60">
                      Phòng live đang chuẩn bị nguồn phát. Vui lòng chờ trong giây lát.
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/75 via-black/35 to-transparent p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E84C3D] px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-black/20">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                        LIVE
                      </span>
                      <span className="rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                        ● {viewerCount.toLocaleString('vi-VN')} đang xem
                      </span>
                    </div>
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ebe3d8] bg-[#fffdfa] px-4 py-3 text-sm text-[#667085]">
                  <span className="font-semibold text-[#9a3412]">{streamStatusLabel}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (usesMediaEnginePlayback) {
                        setPlaybackReloadKey((current) => current + 1);
                        return;
                      }
                      requestRealtimeStream();
                    }}
                    disabled={!isSessionLive || (!usesMediaEnginePlayback && socketStatus !== 'connected')}
                    className="rounded-lg border border-[#e2d8cd] bg-white px-3 py-1.5 text-xs font-bold text-[#344054] transition hover:border-[#ee4d2d] hover:text-[#c2410c] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Làm mới kết nối
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <MetricPill icon="👥" label="Lượt xem cao nhất" value={session.metricsSnapshot.viewerPeak} />
                <MetricPill icon="💬" label="Tin nhắn" value={session.metricsSnapshot.messageCount + messages.length} />
                <MetricPill icon="🛒" label="Lượt xem sản phẩm" value={session.metricsSnapshot.productClickCount} />
              </div>
            </article>

            <aside className="grid gap-5 xl:sticky xl:top-24 xl:self-start">
              <section className="overflow-hidden rounded-3xl border border-[#ead8ca] bg-white text-slate-900 shadow-[0_18px_60px_rgba(38,31,26,0.08)]">
                <div className="border-b border-[#ebe3d8] bg-[#fffdfa] p-4">
                  <p className="text-[11px] font-bold uppercase text-[#b54708]">Live cart</p>
                  <h2 className="mt-1 text-xl font-bold">Sản phẩm đang lên sóng</h2>
                  <p className="mt-1 text-sm text-[#667085]">Chọn sản phẩm để xem chi tiết hoặc mua ngay.</p>
                </div>
                <div className="max-h-[330px] space-y-3 overflow-y-auto p-3">
                  {products.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-[#e2d8cd] bg-[#fbf7f1] p-4 text-sm font-medium text-[#667085]">
                      Seller chưa pin sản phẩm nào.
                    </p>
                  ) : (
                    products.map((product) => (
                      <button
                        key={product.productId}
                        type="button"
                        onClick={() => handleOpenProduct(product.productId)}
                        className="group relative flex w-full items-center gap-3 rounded-2xl border border-[#e2d8cd] bg-white p-2.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#E84C3D] hover:bg-[#fff8f3] hover:shadow-md"
                      >
                        <span className="absolute -right-1 -top-2 rounded-full bg-[#E84C3D] px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                          {formatLiveDiscount(product)}
                        </span>
                        <Image
                          src={product.imageSnapshot || '/icon.svg'}
                          alt={product.nameSnapshot}
                          width={56}
                          height={56}
                          unoptimized
                          className="h-16 w-16 rounded-xl object-cover ring-1 ring-[#f1e4d8]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-sm font-semibold text-slate-900">{product.nameSnapshot}</span>
                          <span className="mt-1 block text-base font-bold text-[#E84C3D]">
                            {formatPrice(product.priceSnapshot, product.currencySnapshot)}
                          </span>
                          <span className="mt-0.5 block text-xs font-medium text-slate-500">Đã bán {formatSoldCount(product)}</span>
                        </span>
                        <span className="rounded-xl bg-[#E84C3D] px-3 py-2 text-xs font-bold text-white transition group-hover:bg-[#c73428]">Mua</span>
                      </button>
                    ))
                  )}
                </div>
              </section>

              {recommendationLoading || recommendedProducts.length > 0 ? (
                <section className="overflow-hidden rounded-3xl border border-[#ead8ca] bg-white text-slate-900 shadow-[0_18px_60px_rgba(38,31,26,0.08)]">
                  <div className="border-b border-[#ebe3d8] bg-[#fffdfa] p-4">
                    <p className="text-[11px] font-bold uppercase text-[#b54708]">Gợi ý mua kèm</p>
                    <h2 className="mt-1 text-xl font-bold">Mua kèm phổ biến</h2>
                  </div>
                  <div className="space-y-3 p-3">
                    {recommendedProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => handleOpenProduct(product.id)}
                        className="group flex w-full items-center gap-3 rounded-2xl border border-[#e2d8cd] bg-white p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#E84C3D] hover:bg-[#fff8f3]"
                      >
                        <Image
                          src={product.image || '/icon.svg'}
                          alt={product.title}
                          width={56}
                          height={56}
                          unoptimized
                          className="h-16 w-16 rounded-xl object-cover ring-1 ring-[#f1e4d8]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-sm font-semibold text-slate-900">{product.title}</span>
                          <span className="mt-1 block text-base font-bold text-[#E84C3D]">{formatPrice(product.price)}</span>
                        </span>
                      </button>
                    ))}
                    {recommendationLoading && recommendedProducts.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-[#e2d8cd] bg-[#fbf7f1] p-4 text-sm font-medium text-[#667085]">
                        Đang tải gợi ý...
                      </p>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <section className="overflow-hidden rounded-3xl border border-[#ead8ca] bg-white text-slate-900 shadow-[0_18px_60px_rgba(38,31,26,0.08)]">
                <div className="border-b border-[#ebe3d8] bg-[#fffdfa] p-4">
                  <h2 className="mt-1 text-xl font-bold">Trò chuyện</h2>
                  <p className="mt-1 text-sm text-[#667085]">
                    {user ? 'Trao đổi trực tiếp với shop và người xem khác.' : 'Đăng nhập để tham gia trò chuyện.'}
                  </p>
                </div>
                <div className="flex h-[360px] flex-col">
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                    {messages.length === 0 ? <p className="rounded-2xl bg-[#f8f6f1] p-4 text-sm font-medium text-[#667085]">Chưa có tin nhắn.</p> : null}
                    {messages.map((message) => (
                      <div key={message.messageId} className="flex gap-2.5 rounded-2xl bg-[#f8f6f1] p-3">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${getChatAvatarColor(message.senderRole)}`}>
                          {getChatInitial(message, user, chatNameMap)}
                        </span>
                        <span className="min-w-0">
                          <p className={`text-xs font-bold ${getChatNameColor(message.senderRole)}`}>{formatChatSender(message, user, chatNameMap)}</p>
                          <p className="mt-1 break-words text-sm leading-5 text-slate-900">{message.text}</p>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-[#ebe3d8] p-3">
                    <div className="mb-2 flex gap-1.5">
                      {chatEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setChatInput((current) => `${current}${emoji}`)}
                          disabled={!isSessionLive || !accessToken || socketStatus !== 'connected'}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-[#ead8ca] bg-[#fff8f3] text-sm transition hover:border-[#E84C3D] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={chatInput}
                        onChange={(event) => setChatInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            handleSendMessage();
                          }
                        }}
                        disabled={!isSessionLive || !accessToken || socketStatus !== 'connected'}
                        placeholder={accessToken ? 'Nhập chat...' : 'Bạn cần đăng nhập để chat'}
                        className="min-w-0 flex-1 rounded-xl border border-[#d7d0c5] bg-[#fbfaf7] px-3 py-2 text-sm outline-none transition focus:border-[#ee4d2d] focus:bg-white disabled:bg-slate-100"
                      />
                      <button
                        type="button"
                        onClick={handleSendMessage}
                        disabled={!isSessionLive || !chatInput.trim() || !chatSafety.allowed || !accessToken || socketStatus !== 'connected'}
                        className="rounded-xl bg-[#ee4d2d] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#db4729] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Gửi
                      </button>
                    </div>
                    {!chatSafety.allowed && chatInput.trim() ? (
                      <p className="mt-2 text-xs font-semibold text-[#c2410c]">{chatSafety.message}</p>
                    ) : null}
                    {chatError ? <p className="mt-2 text-xs font-semibold text-red-600">{chatError}</p> : null}
                  </div>
                </div>
              </section>
            </aside>
          </section>
        ) : null}
      </main>
    </div>
  );

  async function refreshProducts(currentSessionId: string) {
    try {
      const nextProducts = await listLiveProducts(currentSessionId);
      setProducts(nextProducts.filter((product) => product.pinStatus === 'PINNED'));
    } catch {
      // REST refresh is a convenience; realtime state remains usable if it fails.
    }
  }
}

function MetricPill({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#e2d8cd] bg-white p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-[#E84C3D] hover:shadow-md">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fff4ea] text-lg">{icon}</span>
        <p className="text-[11px] font-bold uppercase text-[#98a2b3]">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums text-[#111827] transition-all duration-300">{value.toLocaleString('vi-VN')}</p>
    </div>
  );
}

function formatLiveDiscount(product: LiveProduct): string {
  const discount = 8 + (stableNumber(product.productId) % 18);
  return `-${discount}%`;
}

function formatSoldCount(product: LiveProduct): string {
  const sold = 24 + (stableNumber(product.productId) % 476);
  return sold.toLocaleString('vi-VN');
}

function stableNumber(value: string): number {
  return Array.from(value).reduce((total, char) => total + char.charCodeAt(0), 0);
}

function getChatInitial(message: LiveMessage, currentUser: { id: string; name: string } | null, knownNames: Record<string, string>): string {
  const sender = formatChatSender(message, currentUser, knownNames);
  return (sender.trim().charAt(0) || 'U').toUpperCase();
}

function formatChatSender(message: LiveMessage, currentUser: { id: string; name: string } | null, knownNames: Record<string, string>): string {
  if (currentUser?.id === message.senderId && currentUser.name.trim()) {
    return currentUser.name.trim();
  }

  const knownName = knownNames[message.senderId]?.trim();
  if (knownName) {
    return knownName;
  }

  const normalizedRole = message.senderRole.toLowerCase();
  if (normalizedRole.includes('seller')) {
    return 'Shop';
  }
  if (normalizedRole.includes('admin')) {
    return 'Admin';
  }
  return 'Khách hàng';
}

function readBuyerProfileNames(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(BUYER_PROFILES_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, string>>((accumulator, [userId, profile]) => {
      if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
        return accumulator;
      }

      const name = (profile as { name?: unknown }).name;
      if (typeof name === 'string' && name.trim()) {
        accumulator[userId] = name.trim();
      }

      return accumulator;
    }, {});
  } catch {
    return {};
  }
}

function getChatAvatarColor(senderRole: string): string {
  const normalizedRole = senderRole.toLowerCase();
  if (normalizedRole.includes('seller')) {
    return 'bg-[#E84C3D]';
  }
  if (normalizedRole.includes('admin')) {
    return 'bg-slate-700';
  }
  return 'bg-[#f59e0b]';
}

function getChatNameColor(senderRole: string): string {
  const normalizedRole = senderRole.toLowerCase();
  if (normalizedRole.includes('seller')) {
    return 'text-[#E84C3D]';
  }
  if (normalizedRole.includes('admin')) {
    return 'text-slate-700';
  }
  return 'text-[#b45309]';
}

function formatViewerStreamStatus(realtimeStatus: 'waiting' | 'connecting' | 'connected' | 'fallback' | 'error', socketStatus: SocketStatus) {
  if (realtimeStatus === 'connected') {
    return 'Đang phát trực tiếp';
  }
  if (realtimeStatus === 'connecting' || realtimeStatus === 'waiting') {
    return 'Đang kết nối nguồn phát';
  }
  if (socketStatus === 'error' || realtimeStatus === 'error') {
    return 'Cần làm mới kết nối';
  }
  return 'Nguồn phát dự phòng';
}

function formatSessionStatus(status: LiveSession['status']) {
  switch (status) {
    case 'LIVE':
      return 'LIVE';
    case 'PAUSED':
      return 'TẠM NGỪNG';
    case 'ENDED':
      return 'ĐÃ KẾT THÚC';
    default:
      return status;
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value ?? '').trim();
  } catch {
    return '';
  }
}

function createClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function publishWHEPOffer(peer: RTCPeerConnection, playbackUrl: string): Promise<void> {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await waitForIceGatheringComplete(peer);

  const localDescription = peer.localDescription;
  if (!localDescription?.sdp) {
    throw new Error('whep_missing_sdp');
  }

  const response = await fetch(playbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: localDescription.sdp
  });
  if (!response.ok) {
    throw new Error(`whep_${response.status}`);
  }

  const answer = await response.text();
  await peer.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answer }));
}

function waitForIceGatheringComplete(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === 'complete') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      peer.removeEventListener('icegatheringstatechange', handleStateChange);
      resolve();
    }, 5000);

    function handleStateChange() {
      if (peer.iceGatheringState !== 'complete') {
        return;
      }
      window.clearTimeout(timeout);
      peer.removeEventListener('icegatheringstatechange', handleStateChange);
      resolve();
    }

    peer.addEventListener('icegatheringstatechange', handleStateChange);
  });
}

function safeParseSocketPayload(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isLiveMessage(input: unknown): input is LiveMessage {
  if (!input || typeof input !== 'object') {
    return false;
  }
  const value = input as Partial<LiveMessage>;
  return typeof value.messageId === 'string' && typeof value.text === 'string';
}

function isLiveProduct(input: unknown): input is LiveProduct {
  if (!input || typeof input !== 'object') {
    return false;
  }
  const value = input as Partial<LiveProduct>;
  return typeof value.productId === 'string' && typeof value.nameSnapshot === 'string';
}
