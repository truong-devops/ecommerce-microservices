'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { createBuyerChatConversation, listBuyerChatConversations, listBuyerChatMessages, markBuyerChatRead, sendBuyerChatMessage } from '@/lib/api/chat';
import { BuyerApiClientError } from '@/lib/api/client';
import type { BuyerChatConversation, BuyerChatMessage } from '@/lib/api/types';
import { useAuth, useLanguage } from '@/providers/AppProvider';

function toWsBase(raw: string): string {
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw;
  if (raw.startsWith('https://')) return `wss://${raw.slice('https://'.length)}`;
  if (raw.startsWith('http://')) return `ws://${raw.slice('http://'.length)}`;
  return `ws://${raw}`;
}

const CHAT_WS_BASE_URL = toWsBase(process.env.NEXT_PUBLIC_CHAT_WS_BASE_URL ?? 'http://localhost:12000');
type BuyerMessageView = BuyerChatMessage & { localState?: 'pending' | 'failed' };

export default function BuyerChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-app-bg" />}>
      <BuyerChatPageContent />
    </Suspense>
  );
}

function BuyerChatPageContent() {
  const { text } = useLanguage();
  const { ready, user, accessToken } = useAuth();
  const searchParams = useSearchParams();
  const preferredConversationId = (searchParams.get('conversationId') ?? '').trim();
  const preferredSellerId = (searchParams.get('sellerId') ?? '').trim();
  const preferredProductId = (searchParams.get('productId') ?? '').trim();

  const [sellerIdInput, setSellerIdInput] = useState(preferredSellerId);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [conversations, setConversations] = useState<BuyerChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState(preferredConversationId);
  const [messages, setMessages] = useState<BuyerMessageView[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCreateAttemptedRef = useRef(false);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  const filteredConversations = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) {
      return conversations;
    }

    return conversations.filter((item) => {
      const target = `${item.sellerId} ${item.buyerId} ${item.lastMessage?.textPreview ?? ''}`.toLowerCase();
      return target.includes(keyword);
    });
  }, [conversations, searchKeyword]);

  const upsertConversation = useCallback((conversation: BuyerChatConversation) => {
    setConversations((prev) => {
      const index = prev.findIndex((item) => item.id === conversation.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = conversation;
        return next;
      }
      return [conversation, ...prev];
    });
    setSelectedConversationId(conversation.id);
  }, []);

  const loadConversations = useCallback(async () => {
    if (!accessToken) return;

    setLoadingConversations(true);
    setErrorMessage('');

    try {
      const result = await listBuyerChatConversations({ accessToken, page: 1, pageSize: 50 });
      const nextItems = Array.isArray(result.items) ? result.items : [];
      setConversations(nextItems);

      if (preferredConversationId && nextItems.some((item) => item.id === preferredConversationId)) {
        setSelectedConversationId(preferredConversationId);
      } else if (!selectedConversationId && nextItems.length > 0) {
        setSelectedConversationId(nextItems[0].id);
      } else if (selectedConversationId && !nextItems.some((item) => item.id === selectedConversationId)) {
        setSelectedConversationId(nextItems[0]?.id ?? '');
      }
    } catch (error) {
      setErrorMessage(error instanceof BuyerApiClientError ? error.message : 'Không thể tải hội thoại');
    } finally {
      setLoadingConversations(false);
    }
  }, [accessToken, preferredConversationId, selectedConversationId]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!accessToken || !conversationId) return;

    setLoadingMessages(true);
    setErrorMessage('');

    try {
      const result = await listBuyerChatMessages({
        accessToken,
        conversationId,
        limit: 100
      });
      setMessages(Array.isArray(result.items) ? result.items.map((item) => ({ ...item })) : []);
      await markBuyerChatRead({ accessToken, conversationId });
      setConversations((prev) =>
        prev.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                unread: {
                  ...item.unread,
                  buyer: 0
                }
              }
            : item
        )
      );
    } catch (error) {
      setErrorMessage(error instanceof BuyerApiClientError ? error.message : 'Không thể tải tin nhắn');
    } finally {
      setLoadingMessages(false);
    }
  }, [accessToken]);

  const createConversationWithSeller = useCallback(async (sellerId: string, autoMode = false) => {
    const normalized = sellerId.trim();
    if (!accessToken || !normalized || creatingConversation) {
      return;
    }

    setCreatingConversation(true);
    setErrorMessage('');
    try {
      const conversation = await createBuyerChatConversation({
        accessToken,
        payload: {
          sellerId: normalized,
          productId: preferredProductId || undefined,
          buyerName: user?.name?.trim() || undefined
        }
      });
      upsertConversation(conversation);
      setSellerIdInput('');
    } catch (error) {
      if (!autoMode) {
        setErrorMessage(error instanceof BuyerApiClientError ? error.message : 'Không thể tạo hội thoại');
      }
    } finally {
      setCreatingConversation(false);
    }
  }, [accessToken, creatingConversation, preferredProductId, upsertConversation, user?.name]);

  const connectWs = useCallback(() => {
    if (!accessToken || !selectedConversationId) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const wsUrl = `${CHAT_WS_BASE_URL}/api/v1/chat/ws?conversationId=${encodeURIComponent(selectedConversationId)}`;
    const ws = new WebSocket(wsUrl, ['chat.v1', `access-token.${accessToken}`]);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onclose = () => {
      setWsConnected(false);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = setTimeout(() => {
        connectWs();
      }, 2000);
    };

    ws.onerror = () => {
      setWsConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          message?: BuyerChatMessage;
          conversationId?: string;
        };

        if (payload.type === 'chat.message.created' && payload.message && payload.conversationId === selectedConversationId) {
          setMessages((prev) => upsertMessage(prev, payload.message as BuyerMessageView));
          setConversations((prev) =>
            prev.map((item) =>
              item.id === selectedConversationId
                ? {
                    ...item,
                    lastMessage: {
                      messageId: payload.message!.id,
                      senderId: payload.message!.senderId,
                      textPreview: payload.message!.text,
                      sentAt: payload.message!.sentAt
                    }
                  }
                : item
            )
          );
        }
      } catch {
        // Ignore malformed data.
      }
    };
  }, [accessToken, selectedConversationId]);

  useEffect(() => {
    if (!ready || !accessToken || !user) return;
    void loadConversations();
  }, [ready, accessToken, user, loadConversations]);

  useEffect(() => {
    if (!ready || !accessToken || !preferredSellerId || autoCreateAttemptedRef.current) {
      return;
    }
    autoCreateAttemptedRef.current = true;
    void createConversationWithSeller(preferredSellerId, true);
  }, [accessToken, createConversationWithSeller, preferredSellerId, ready]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    void loadMessages(selectedConversationId);
  }, [selectedConversationId, loadMessages]);

  useEffect(() => {
    if (!selectedConversationId || !accessToken) {
      return;
    }

    connectWs();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [selectedConversationId, accessToken, connectWs]);

  useEffect(() => {
    if (!selectedConversationId || wsConnected) {
      return;
    }

    const timer = setInterval(() => {
      void loadMessages(selectedConversationId);
    }, 6000);

    return () => {
      clearInterval(timer);
    };
  }, [selectedConversationId, wsConnected, loadMessages]);

  const handleSendMessage = useCallback(async () => {
    const textValue = messageInput.trim();
    if (!accessToken || !selectedConversationId || !textValue || sendingMessage) {
      return;
    }

    const optimisticId = `tmp-${Date.now()}`;
    const optimistic: BuyerMessageView = {
      id: optimisticId,
      conversationId: selectedConversationId,
      seq: Date.now(),
      senderId: user?.id ?? '',
      senderRole: user?.role ?? 'CUSTOMER',
      kind: 'TEXT',
      text: textValue,
      sentAt: new Date().toISOString(),
      localState: 'pending'
    };

    setSendingMessage(true);
    setMessageInput('');
    setMessages((prev) => [...prev, optimistic]);

    try {
      const saved = await sendBuyerChatMessage({
        accessToken,
        conversationId: selectedConversationId,
        payload: {
          text: textValue,
          clientMessageId: `buyer-${Date.now()}`
        }
      });
      setMessages((prev) => prev.map((item) => (item.id === optimisticId ? { ...saved } : item)));
      setConversations((prev) =>
        prev.map((item) =>
          item.id === selectedConversationId
            ? {
                ...item,
                lastMessage: {
                  messageId: saved.id,
                  senderId: saved.senderId,
                  textPreview: saved.text,
                  sentAt: saved.sentAt
                }
              }
            : item
        )
      );
    } catch (error) {
      setMessages((prev) => prev.map((item) => (item.id === optimisticId ? { ...item, localState: 'failed' } : item)));
      setErrorMessage(error instanceof BuyerApiClientError ? error.message : 'Không gửi được tin nhắn');
    } finally {
      setSendingMessage(false);
    }
  }, [accessToken, messageInput, selectedConversationId, sendingMessage, user?.id, user?.role]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-app-bg text-slate-900">
        <Header keywords={[]} />
        <main className="mx-auto w-full max-w-[1300px] px-3 py-8 md:px-4">
          <p className="text-sm text-slate-600">Loading...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={[]} />

      <main className="mx-auto w-full max-w-[1300px] px-3 py-5 md:px-4 md:py-6">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link href="/" className="hover:text-brand-600">Home</Link>
          <span>›</span>
          <span className="font-medium text-slate-700">Chat</span>
          <span className={`ml-1 rounded px-2 py-0.5 text-xs ${wsConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {wsConnected ? 'Realtime connected' : 'Polling fallback'}
          </span>
        </div>

        {!user ? (
          <section className="rounded-md border border-slate-200 bg-white p-6">
            <p className="text-sm text-slate-700">{text.auth.loginTitle}</p>
            <Link href="/login" className="mt-3 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
              {text.auth.submitLogin}
            </Link>
          </section>
        ) : (
          <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
            <div className="grid min-h-[78vh] gap-0 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="flex min-h-0 flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
                <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {selectedConversation ? `Chat với shop ${selectedConversation.sellerId.slice(0, 8)}...` : 'Chat'}
                  </p>
                </div>

                <div className="flex-1 space-y-3 overflow-auto bg-[#fafafa] p-4">
                  {loadingMessages ? <p className="text-sm text-slate-500">Đang tải tin nhắn...</p> : null}
                  {!loadingMessages && !selectedConversationId ? <p className="text-sm text-slate-500">Chọn hội thoại để bắt đầu chat.</p> : null}
                  {!loadingMessages && selectedConversationId && messages.length === 0 ? <p className="text-sm text-slate-500">Chưa có tin nhắn</p> : null}

                  {messages.map((item) => {
                    const mine = item.senderId === user.id;
                    return (
                      <div key={item.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${mine ? 'bg-[#ee4d2d] text-white' : 'bg-white text-slate-800 border border-slate-200'}`}>
                          <p className="whitespace-pre-wrap break-words">{item.text}</p>
                          <p className={`mt-1 text-[10px] ${mine ? 'text-orange-100' : 'text-slate-400'}`}>{new Date(item.sentAt).toLocaleTimeString()}</p>
                          {mine && item.localState === 'pending' ? <p className="text-[10px] text-orange-100">Sending...</p> : null}
                          {mine && item.localState === 'failed' ? <p className="text-[10px] text-rose-100">Failed</p> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={messageInput}
                      onChange={(event) => setMessageInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleSendMessage();
                        }
                      }}
                      placeholder={selectedConversationId ? 'Nhập nội dung tin nhắn' : 'Hãy chọn hội thoại hoặc tạo chat mới ở panel bên phải'}
                      className="h-11 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#ee4d2d]"
                      disabled={!selectedConversationId}
                    />
                    <button
                      type="button"
                      onClick={() => void handleSendMessage()}
                      disabled={!selectedConversationId || sendingMessage || messageInput.trim().length === 0}
                      className="h-11 rounded-md bg-[#ee4d2d] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#f3b4a7]"
                    >
                      Gửi
                    </button>
                  </div>
                  {errorMessage ? <p className="mt-2 text-xs text-rose-600">{errorMessage}</p> : null}
                </div>
              </div>

              <aside className="flex min-h-0 flex-col bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <h2 className="text-[30px] leading-none font-semibold text-[#ee4d2d]">Chat</h2>
                  <div className="flex items-center gap-2 text-sm">
                    <button type="button" className="rounded border border-slate-200 px-2 py-1 text-slate-600">Chat với Người mua</button>
                    <span className="text-[#0b6bde]">Webchat</span>
                  </div>
                </div>

                <div className="border-b border-slate-200 px-3 py-3">
                  <input
                    value={searchKeyword}
                    onChange={(event) => setSearchKeyword(event.target.value)}
                    placeholder="Tìm theo tên khách hàng"
                    className="h-10 w-full rounded border border-slate-300 px-3 text-sm outline-none focus:border-[#ee4d2d]"
                  />

                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={sellerIdInput}
                      onChange={(event) => setSellerIdInput(event.target.value)}
                      placeholder="sellerId để tạo chat"
                      className="h-9 flex-1 rounded border border-slate-300 px-2 text-xs outline-none focus:border-[#ee4d2d]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void createConversationWithSeller(sellerIdInput, false);
                      }}
                      disabled={creatingConversation || sellerIdInput.trim().length === 0}
                      className="h-9 rounded bg-[#ee4d2d] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#f3b4a7]"
                    >
                      {creatingConversation ? 'Đang tạo' : 'Tạo chat'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-sm">
                  <div className="flex items-center gap-5">
                    <p className="font-semibold text-slate-700">Đang phục vụ</p>
                    <p className="font-semibold text-[#ee4d2d]">Tất cả cuộc trò chuyện</p>
                  </div>
                  <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600">
                    Bộ lọc
                  </button>
                </div>

                <div className="flex-1 overflow-auto">
                  {loadingConversations ? <p className="px-3 py-2 text-sm text-slate-500">Đang tải...</p> : null}
                  {!loadingConversations && filteredConversations.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-slate-500">Chưa có cuộc trò chuyện nào.</p>
                  ) : null}

                  <ul className="divide-y divide-slate-100">
                    {filteredConversations.map((item) => {
                      const active = item.id === selectedConversationId;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedConversationId(item.id)}
                            className={`w-full px-3 py-3 text-left transition ${active ? 'bg-[#fff4ef]' : 'hover:bg-slate-50'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate text-[18px] leading-6 font-semibold text-slate-800">shop_{item.sellerId.slice(0, 8)}</p>
                              <span className="text-xs text-slate-400">{formatDayLabel(item.updatedAt)}</span>
                            </div>
                            <p className="mt-0.5 truncate text-sm text-slate-500">{item.lastMessage?.textPreview ?? 'Chưa có tin nhắn'}</p>
                            {(item.unread?.buyer ?? 0) > 0 ? (
                              <span className="mt-1 inline-flex rounded-full bg-[#ee4d2d] px-1.5 py-0.5 text-[10px] text-white">
                                {item.unread.buyer > 99 ? '99+' : item.unread.buyer}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </aside>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

function upsertMessage(messages: BuyerMessageView[], incoming: BuyerMessageView): BuyerMessageView[] {
  const existingIndex = messages.findIndex((item) => item.id === incoming.id);
  if (existingIndex >= 0) {
    const next = [...messages];
    next[existingIndex] = { ...incoming };
    return next;
  }
  return [...messages, { ...incoming }].sort((a, b) => a.seq - b.seq);
}

function formatDayLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit'
  });
}
