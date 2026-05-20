'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { SellerApiClientError } from '@/lib/api/client';
import {
  listSellerChatConversations,
  listSellerChatMessages,
  markSellerChatRead,
  sendSellerChatMessage
} from '@/lib/api/chat';
import type { SellerChatConversation, SellerChatMessage } from '@/lib/api/types';
import { useAuth } from '@/providers/AppProvider';

function toWsBase(raw: string): string {
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) {
    return raw;
  }
  if (raw.startsWith('https://')) {
    return `wss://${raw.slice('https://'.length)}`;
  }
  if (raw.startsWith('http://')) {
    return `ws://${raw.slice('http://'.length)}`;
  }
  return `ws://${raw}`;
}

const CHAT_WS_BASE_URL = toWsBase(process.env.NEXT_PUBLIC_CHAT_WS_BASE_URL ?? 'http://localhost:12000');
type SellerMessageView = SellerChatMessage & { localState?: 'pending' | 'failed' };

export default function CustomerCareChatPage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();

  const [conversations, setConversations] = useState<SellerChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>('');
  const [messages, setMessages] = useState<SellerMessageView[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );
  const selectedBuyerName = selectedConversation ? resolveBuyerDisplayName(selectedConversation) : '';

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  const loadConversations = useCallback(async () => {
    if (!accessToken) return;

    setLoadingConversations(true);
    setErrorMessage('');

    try {
      const result = await listSellerChatConversations(accessToken, { page: 1, pageSize: 50 });
      const nextItems = Array.isArray(result.items) ? result.items : [];
      setConversations(nextItems);

      if (!selectedConversationId && nextItems.length > 0) {
        setSelectedConversationId(nextItems[0].id);
      }
      if (selectedConversationId && !nextItems.some((item) => item.id === selectedConversationId)) {
        setSelectedConversationId(nextItems[0]?.id ?? '');
      }
    } catch (error) {
      setErrorMessage(error instanceof SellerApiClientError ? error.message : 'Khong the tai danh sach chat');
    } finally {
      setLoadingConversations(false);
    }
  }, [accessToken, selectedConversationId]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!accessToken || !conversationId) return;

    setLoadingMessages(true);
    setErrorMessage('');
    try {
      const result = await listSellerChatMessages(accessToken, conversationId, { limit: 100 });
      setMessages(Array.isArray(result.items) ? result.items.map((item) => ({ ...item })) : []);
      await markSellerChatRead(accessToken, conversationId);
    } catch (error) {
      setErrorMessage(error instanceof SellerApiClientError ? error.message : 'Khong the tai tin nhan');
    } finally {
      setLoadingMessages(false);
    }
  }, [accessToken]);

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
          message?: SellerChatMessage;
          conversationId?: string;
        };

        if (payload.type === 'chat.message.created' && payload.message && payload.conversationId === selectedConversationId) {
          setMessages((prev) => upsertMessage(prev, payload.message as SellerMessageView));
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
        // Ignore malformed messages.
      }
    };
  }, [accessToken, selectedConversationId]);

  useEffect(() => {
    if (!ready || !user || !accessToken) {
      return;
    }
    void loadConversations();
  }, [ready, user, accessToken, loadConversations]);

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
    const text = messageInput.trim();
    if (!text || !accessToken || !selectedConversationId || sendingMessage) {
      return;
    }

    const optimisticId = `tmp-${Date.now()}`;
    const optimisticMessage: SellerMessageView = {
      id: optimisticId,
      conversationId: selectedConversationId,
      seq: Date.now(),
      senderId: user?.id ?? '',
      senderRole: user?.role ?? 'SELLER',
      kind: 'TEXT',
      text,
      sentAt: new Date().toISOString(),
      localState: 'pending'
    };

    setSendingMessage(true);
    setMessageInput('');
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const saved = await sendSellerChatMessage(accessToken, selectedConversationId, {
        text,
        clientMessageId: `seller-${Date.now()}`
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
      setErrorMessage(error instanceof SellerApiClientError ? error.message : 'Khong the gui tin nhan');
    } finally {
      setSendingMessage(false);
    }
  }, [accessToken, messageInput, selectedConversationId, sendingMessage, user?.id, user?.role]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Đang kiểm tra phiên đăng nhập...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-orange-500">eMall Seller</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Bạn chưa đăng nhập</h1>
          <p className="mt-2 text-sm text-slate-600">Đăng nhập để truy cập Seller Center.</p>
          <Link href="/login" className="mt-5 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600">
            Đi đến trang đăng nhập
          </Link>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen text-slate-900">
      <SellerTopbar email={user.email} role={user.role} onLogout={handleLogout} />

      <div className="flex">
        <SellerSidebar />

        <main className="min-w-0 flex-1 px-3 py-3 lg:px-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="hover:text-[#ee4d2d]">
              Trang chủ
            </Link>
            <span>›</span>
            <span className="font-medium text-slate-700">Quản lý Chat</span>
            <span className={`ml-2 rounded px-2 py-0.5 text-xs ${wsConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {wsConnected ? 'Realtime connected' : 'Polling fallback'}
            </span>
          </div>

          <section className="grid min-h-[70vh] grid-cols-12 gap-3 rounded-md border border-slate-200 bg-white p-3">
            <aside className="col-span-12 overflow-auto rounded-md border border-slate-200 lg:col-span-4">
              <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">Hội thoại</div>

              {loadingConversations ? <div className="px-3 py-2 text-sm text-slate-500">Đang tải...</div> : null}
              {!loadingConversations && conversations.length === 0 ? <div className="px-3 py-2 text-sm text-slate-500">Chưa có hội thoại</div> : null}

              <ul className="divide-y divide-slate-200">
                {conversations.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`w-full px-3 py-2 text-left transition ${item.id === selectedConversationId ? 'bg-orange-50' : 'hover:bg-slate-50'}`}
                      onClick={() => setSelectedConversationId(item.id)}
                    >
                      <p className="truncate text-sm font-semibold text-slate-800">{resolveBuyerDisplayName(item)}</p>
                      <p className="truncate text-xs text-slate-500">{item.lastMessage?.textPreview ?? 'Chưa có tin nhắn'}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            <section className="col-span-12 flex min-h-[60vh] flex-col rounded-md border border-slate-200 lg:col-span-8">
              <div className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700">
                {selectedConversation ? selectedBuyerName : 'Chọn hội thoại'}
              </div>

              <div className="flex-1 space-y-2 overflow-auto p-3">
                {loadingMessages ? <p className="text-sm text-slate-500">Đang tải tin nhắn...</p> : null}
                {!loadingMessages && messages.length === 0 ? <p className="text-sm text-slate-500">Chưa có tin nhắn</p> : null}

                {messages.map((item) => {
                  const mine = item.senderId === user.id;
                  return (
                    <div key={item.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] rounded-lg px-3 py-2 text-sm ${mine ? 'bg-[#ee4d2d] text-white' : 'bg-slate-100 text-slate-800'}`}>
                        <p>{item.text}</p>
                        <p className={`mt-1 text-[10px] ${mine ? 'text-orange-100' : 'text-slate-400'}`}>{new Date(item.sentAt).toLocaleString()}</p>
                        {mine && item.localState === 'pending' ? <p className="mt-0.5 text-[10px] text-orange-100">Sending...</p> : null}
                        {mine && item.localState === 'failed' ? <p className="mt-0.5 text-[10px] text-rose-100">Failed</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-200 p-3">
                <div className="flex gap-2">
                  <input
                    value={messageInput}
                    onChange={(event) => setMessageInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                    placeholder="Nhập tin nhắn..."
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#ee4d2d]"
                    disabled={!selectedConversationId}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSendMessage()}
                    disabled={!selectedConversationId || sendingMessage}
                    className="rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Gửi
                  </button>
                </div>
                {errorMessage ? <p className="mt-2 text-xs text-rose-600">{errorMessage}</p> : null}
              </div>
            </section>
          </section>
        </main>
      </div>
    </div>
  );
}

function upsertMessage(messages: SellerMessageView[], incoming: SellerMessageView): SellerMessageView[] {
  const existingIndex = messages.findIndex((item) => item.id === incoming.id);
  if (existingIndex >= 0) {
    const next = [...messages];
    next[existingIndex] = { ...incoming };
    return next;
  }
  return [...messages, { ...incoming }].sort((a, b) => a.seq - b.seq);
}

function resolveBuyerDisplayName(conversation: SellerChatConversation): string {
  const name = conversation.context?.buyerName?.trim();
  if (name) {
    return name;
  }

  if (conversation.buyerCode?.trim()) {
    return `Khách hàng ${conversation.buyerCode.trim()}`;
  }

  return `Khách hàng ${conversation.buyerId.slice(0, 8)}`;
}
