'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { BuyerApiClientError } from '@/lib/api/client';
import { buildLiveWebSocketUrl, getLiveSession, listLiveProducts, trackLiveProductClick } from '@/lib/api/live';
import type { LiveMessage, LiveProduct, LiveSession, LiveSessionDetail } from '@/lib/api/types';
import { formatPrice } from '@/lib/price';
import { useAuth, useLanguage } from '@/providers/AppProvider';

type LiveDetailStatus = 'loading' | 'error' | 'success';
type SocketStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

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
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const clientIdRef = useRef(createClientMessageId());
  const broadcasterClientIdRef = useRef('');
  const negotiationIdRef = useRef('');
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const realtimeRetryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status, setStatus] = useState<LiveDetailStatus>('loading');
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('idle');
  const [realtimeStatus, setRealtimeStatus] = useState<'waiting' | 'connecting' | 'connected' | 'fallback' | 'error'>('fallback');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [detail, setDetail] = useState<LiveSessionDetail | null>(null);
  const [products, setProducts] = useState<LiveProduct[]>([]);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [error, setError] = useState('');

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
      setStatus('success');
    } catch (loadError) {
      setError(loadError instanceof BuyerApiClientError ? loadError.message : text.home.loadError);
      setStatus('error');
    }
  }, [accessToken, sessionId, text.home.loadError]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

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
      return [...current, message].slice(-100);
    });
  }, []);

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
      if (detail?.session.status === 'LIVE') {
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

      const nextMessage = payload.message;
      if ((payload.type === 'live:message:new' || payload.type === 'ack') && isLiveMessage(nextMessage)) {
        appendUniqueMessage(nextMessage);
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
    sessionId
  ]);

  useEffect(() => {
    if (detail?.session.status !== 'LIVE' || socketStatus !== 'connected' || realtimeStatus === 'connected') {
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
  }, [clearRealtimeRetryTimer, detail?.session.status, realtimeStatus, requestRealtimeStream, socketStatus]);

  const handleSendMessage = useCallback(() => {
    const textValue = chatInput.trim();
    if (!textValue || socketRef.current?.readyState !== WebSocket.OPEN) {
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
  }, [chatInput]);

  const handleOpenProduct = useCallback(
    (productId: string) => {
      if (sessionId) {
        void trackLiveProductClick(sessionId, productId, accessToken);
      }
      router.push(`/products/${encodeURIComponent(productId)}`);
    },
    [accessToken, router, sessionId]
  );

  const session = detail?.session ?? null;
  const keywords = useMemo(() => products.map((product) => product.nameSnapshot).slice(0, 6), [products]);
  const streamStatusLabel = formatViewerStreamStatus(realtimeStatus, socketStatus);
  const isSessionLive = session?.status === 'LIVE';

  return (
    <div className="min-h-screen bg-[#05070d] text-white">
      <Header keywords={keywords.length > 0 ? keywords : ['livestream', 'live sale', 'deal hot']} />

      <main className="mx-auto w-full max-w-[1440px] px-3 py-4 md:px-5 md:py-6">
        {status === 'loading' ? <p className="py-16 text-center text-sm text-white/70">{text.home.loading}</p> : null}

        {status === 'error' ? (
          <section className="mx-auto mt-8 max-w-xl rounded-2xl border border-red-400/30 bg-white p-6 text-center text-slate-900">
            <p className="text-sm text-red-600">{error || text.home.loadError}</p>
            <Link href="/live" className="mt-4 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              Về danh sách live
            </Link>
          </section>
        ) : null}

        {status === 'success' && session ? (
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <article className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1020] shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 md:px-5 md:py-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold text-white shadow-lg ${isSessionLive ? 'bg-red-600 shadow-red-950/40' : 'bg-slate-600 shadow-slate-950/30'}`}>
                      {formatSessionStatus(session.status)}
                    </span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                      {viewerCount.toLocaleString('vi-VN')} đang xem
                    </span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">{streamStatusLabel}</span>
                  </div>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">{session.title}</h1>
                  <p className="mt-1 text-sm leading-6 text-white/60">{session.description || 'Shop đang phát trực tiếp.'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshProducts(session.sessionId)}
                  className="rounded-full border border-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Làm mới sản phẩm
                </button>
              </div>

              <div className="relative bg-black">
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
                    playsInline
                    autoPlay
                    onLoadedMetadata={(event) => {
                      void event.currentTarget.play().catch(() => undefined);
                    }}
                    className="aspect-video max-h-[72vh] w-full bg-black object-contain"
                  />
                ) : session.playbackUrl ? (
                  <div className="relative">
                    <video
                      src={session.playbackUrl}
                      poster={session.thumbnailUrl || undefined}
                      controls
                      playsInline
                      autoPlay
                      className="aspect-video max-h-[72vh] w-full bg-black object-contain"
                    />
                    {realtimeStatus !== 'connected' ? (
                      <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur">
                        Đang phát từ nguồn dự phòng
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center px-6 text-center text-sm text-white/60">
                    Phòng live đang chuẩn bị nguồn phát. Vui lòng chờ trong giây lát.
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3 text-sm text-white/70">
                <span>{streamStatusLabel}</span>
                <button
                  type="button"
                  onClick={() => requestRealtimeStream()}
                  disabled={!isSessionLive || socketStatus !== 'connected'}
                  className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Làm mới kết nối
                </button>
              </div>

              <div className="grid gap-3 border-t border-white/10 p-4 md:grid-cols-3">
                <MetricPill label="Lượt xem cao nhất" value={session.metricsSnapshot.viewerPeak} />
                <MetricPill label="Tin nhắn" value={session.metricsSnapshot.messageCount + messages.length} />
                <MetricPill label="Lượt xem sản phẩm" value={session.metricsSnapshot.productClickCount} />
              </div>
            </article>

            <aside className="grid gap-4 xl:sticky xl:top-24 xl:self-start">
              <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white text-slate-900 shadow-xl">
                <div className="border-b border-slate-200 p-4">
                  <h2 className="text-base font-semibold">Sản phẩm đang lên sóng</h2>
                  <p className="mt-1 text-sm text-slate-500">Chọn sản phẩm để xem chi tiết hoặc mua ngay.</p>
                </div>
                <div className="max-h-[300px] space-y-2 overflow-y-auto p-3">
                  {products.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      Seller chưa pin sản phẩm nào.
                    </p>
                  ) : (
                    products.map((product) => (
                      <button
                        key={product.productId}
                        type="button"
                        onClick={() => handleOpenProduct(product.productId)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2 text-left transition hover:border-brand-200 hover:bg-brand-50"
                      >
                        <Image
                          src={product.imageSnapshot || '/icon.svg'}
                          alt={product.nameSnapshot}
                          width={56}
                          height={56}
                          unoptimized
                          className="h-14 w-14 rounded-lg object-cover"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-sm font-semibold text-slate-900">{product.nameSnapshot}</span>
                          <span className="mt-1 block text-sm font-bold text-brand-600">
                            {formatPrice(product.priceSnapshot, product.currencySnapshot)}
                          </span>
                        </span>
                        <span className="rounded-md bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white">Mua</span>
                      </button>
                    ))
                  )}
                </div>
              </section>

              <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white text-slate-900 shadow-xl">
                <div className="border-b border-slate-200 p-4">
                  <h2 className="text-base font-semibold">Trò chuyện</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {user ? 'Trao đổi trực tiếp với shop và người xem khác.' : 'Đăng nhập để tham gia trò chuyện.'}
                  </p>
                </div>
                <div className="flex h-[320px] flex-col">
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                    {messages.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Chưa có tin nhắn.</p> : null}
                    {messages.map((message) => (
                      <div key={message.messageId} className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{message.senderRole}</p>
                        <p className="mt-1 text-sm text-slate-900">{message.text}</p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-slate-200 p-3">
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
                        className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 disabled:bg-slate-100"
                      />
                      <button
                        type="button"
                        onClick={handleSendMessage}
                        disabled={!isSessionLive || !chatInput.trim() || !accessToken || socketStatus !== 'connected'}
                        className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Gửi
                      </button>
                    </div>
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

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value.toLocaleString('vi-VN')}</p>
    </div>
  );
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
