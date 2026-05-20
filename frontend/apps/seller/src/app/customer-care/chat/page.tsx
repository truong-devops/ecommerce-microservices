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
import { validateChatText } from '@/lib/chat-safety';
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
  const chatSafety = useMemo(() => validateChatText(messageInput), [messageInput]);

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
    if (!chatSafety.allowed) {
      setErrorMessage(chatSafety.message ?? 'Tin nhắn không hợp lệ');
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
  }, [accessToken, chatSafety, messageInput, selectedConversationId, sendingMessage, user?.id, user?.role]);

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

          <section className="grid min-h-[76vh] grid-cols-12 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <aside className="col-span-12 flex min-h-[260px] flex-col border-b border-slate-200 bg-[#fbfcfe] lg:col-span-4 lg:border-b-0 lg:border-r">
              <div className="border-b border-slate-200 bg-white px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xl font-bold text-slate-950">Hội thoại</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">{conversations.length} khách hàng</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${wsConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {wsConnected ? 'Realtime' : 'Polling'}
                  </span>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-2">
                {loadingConversations ? <div className="px-3 py-3 text-sm font-medium text-slate-500">Đang tải...</div> : null}
                {!loadingConversations && conversations.length === 0 ? (
                  <div className="m-2 rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center">
                    <p className="text-sm font-semibold text-slate-700">Chưa có hội thoại</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Khi khách nhắn tin cho shop, hội thoại sẽ hiện ở đây.</p>
                  </div>
                ) : null}

                <ul className="space-y-1">
                  {conversations.map((item) => {
                    const buyerName = resolveBuyerDisplayName(item);
                    const unread = item.unread?.seller ?? 0;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`group flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                            item.id === selectedConversationId
                              ? 'border-[#ffd6ca] bg-white shadow-sm'
                              : 'border-transparent hover:border-slate-200 hover:bg-white'
                          }`}
                          onClick={() => setSelectedConversationId(item.id)}
                        >
                          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff1ec] text-sm font-bold text-[#ee4d2d] ring-1 ring-[#ffd8cf]">
                            {getInitial(buyerName)}
                            {unread > 0 ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#ee4d2d] ring-2 ring-white" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className="truncate text-sm font-bold text-slate-900">{buyerName}</span>
                              <span className="shrink-0 text-[11px] font-medium text-slate-400">{formatDayLabel(item.updatedAt)}</span>
                            </span>
                            <span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{formatConversationPreview(item)}</span>
                          </span>
                          {unread > 0 ? (
                            <span className="mt-0.5 inline-flex min-w-5 justify-center rounded-full bg-[#ee4d2d] px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </aside>

            <section className="col-span-12 flex min-h-[70vh] flex-col lg:col-span-8">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
                {selectedConversation ? (
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fff1ec] text-base font-bold text-[#ee4d2d] ring-1 ring-[#ffd8cf]">
                      {getInitial(selectedBuyerName)}
                    </span>
                    <span className="min-w-0">
                      <p className="truncate text-base font-bold text-slate-950">{selectedBuyerName}</p>
                      <p className="mt-0.5 text-xs font-medium text-slate-500">Trao đổi về sản phẩm và đơn hàng trên eMall</p>
                    </span>
                  </div>
                ) : (
                  <div>
                    <p className="text-base font-bold text-slate-950">Chọn hội thoại</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">Chọn khách hàng ở bên trái để bắt đầu trả lời.</p>
                  </div>
                )}
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${wsConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {wsConnected ? 'Đang kết nối trực tiếp' : 'Tự động làm mới'}
                </span>
              </div>

              <div className="flex-1 overflow-auto bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_48%,#f8fafc_100%)] p-5">
                {loadingMessages ? <p className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-500 shadow-sm">Đang tải tin nhắn...</p> : null}
                {!loadingMessages && messages.length === 0 ? (
                  <div className="mx-auto mt-28 max-w-sm rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center shadow-sm">
                    <p className="text-sm font-bold text-slate-800">Chưa có tin nhắn</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Khách chưa gửi nội dung nào trong hội thoại này.</p>
                  </div>
                ) : null}

                <div className="space-y-4">
                  {messages.map((item) => {
                    const mine = item.senderId === user.id;
                    const senderName = mine ? 'Shop' : selectedBuyerName || 'Khách hàng';
                    return (
                      <div key={item.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                        {!mine ? (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-[#ee4d2d] ring-1 ring-[#ffd8cf]">
                            {getInitial(senderName)}
                          </span>
                        ) : null}
                        <div
                          className={`max-w-[76%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                            mine
                              ? 'rounded-br-md bg-[#ee4d2d] text-white shadow-[#ee4d2d]/20'
                              : 'rounded-bl-md border border-slate-200 bg-white text-slate-900'
                          }`}
                        >
                          {!mine ? <p className="mb-1 text-[11px] font-bold uppercase text-slate-500">{senderName}</p> : null}
                          <p className="whitespace-pre-wrap break-words leading-6">{item.text}</p>
                          <div className={`mt-2 flex items-center gap-2 text-[11px] ${mine ? 'text-orange-100' : 'text-slate-400'}`}>
                            <span>{formatMessageTime(item.sentAt)}</span>
                            {mine && item.localState === 'pending' ? <span>Đang gửi</span> : null}
                            {mine && item.localState === 'failed' ? <span className="text-rose-100">Gửi lỗi</span> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-200 bg-white px-4 py-3">
                <div className="flex items-end gap-2">
                  <input
                    value={messageInput}
                    onChange={(event) => setMessageInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                    placeholder="Chỉ trao đổi về sản phẩm và đơn hàng trên eMall..."
                    className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-[#ee4d2d] focus:bg-white disabled:bg-slate-100"
                    disabled={!selectedConversationId}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSendMessage()}
                    disabled={!selectedConversationId || sendingMessage || messageInput.trim().length === 0 || !chatSafety.allowed}
                    className="h-11 rounded-xl bg-[#ee4d2d] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#db4729] disabled:cursor-not-allowed disabled:bg-[#f3b4a7]"
                  >
                    Gửi
                  </button>
                </div>
                {!chatSafety.allowed ? <p className="mt-2 text-xs font-semibold text-rose-600">{chatSafety.message}</p> : null}
                {errorMessage ? <p className="mt-2 text-xs font-semibold text-rose-600">{errorMessage}</p> : null}
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

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getInitial(value: string): string {
  return (value.trim().charAt(0) || 'K').toUpperCase();
}

function formatConversationPreview(conversation: SellerChatConversation): string {
  return conversation.lastMessage?.textPreview?.trim() || 'Chưa có tin nhắn';
}
