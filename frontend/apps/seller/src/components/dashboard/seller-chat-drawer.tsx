'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listSellerChatConversations,
  listSellerChatMessages,
  markSellerChatRead,
  sendSellerChatMessage
} from '@/lib/api/chat';
import { SellerApiClientError } from '@/lib/api/client';
import { validateChatText } from '@/lib/chat-safety';
import { formatCustomerCode } from '@/lib/order-codes';
import type { SellerChatConversation, SellerChatMessage } from '@/lib/api/types';

interface SellerChatDrawerProps {
  accessToken: string;
  sellerId: string;
}

type SellerMessageView = SellerChatMessage & { localState?: 'pending' | 'failed' };

const SELLER_DRAWER_WIDTH_CLASS = 'w-[860px]';
const SELLER_DRAWER_LIST_WIDTH_CLASS = 'w-[290px]';
const SELLER_POLL_INTERVAL_MS = 7000;

export function SellerChatDrawer({ accessToken, sellerId }: SellerChatDrawerProps) {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<SellerChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [messages, setMessages] = useState<SellerMessageView[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const totalUnread = useMemo(
    () => conversations.reduce((total, item) => total + (item.unread?.seller ?? 0), 0),
    [conversations]
  );

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );
  const chatSafety = useMemo(() => validateChatText(messageInput), [messageInput]);

  const resolveBuyerDisplayName = useCallback((conversation: SellerChatConversation): string => {
    const nameFromContext = (conversation.context?.buyerName ?? '').trim();
    if (nameFromContext) {
      return nameFromContext;
    }

    const code = conversation.buyerCode || formatCustomerCode(conversation.buyerId);
    return `Khách hàng ${code}`;
  }, []);

  const selectedBuyerName = selectedConversation ? resolveBuyerDisplayName(selectedConversation) : '';

  const loadConversations = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!open) return;

    if (!silent) {
      setLoadingConversations(true);
      setErrorMessage('');
    }
    try {
      const result = await listSellerChatConversations(accessToken, { page: 1, pageSize: 50 });
      const rawItems = Array.isArray(result.items) ? result.items : [];
      const nextItems = dedupeSellerConversations(rawItems);
      setConversations(nextItems);

      if (!selectedConversationId && nextItems.length > 0) {
        setSelectedConversationId(nextItems[0].id);
      } else if (selectedConversationId && !nextItems.some((item) => item.id === selectedConversationId)) {
        setSelectedConversationId(nextItems[0]?.id ?? '');
      }
    } catch (error) {
      if (!silent) {
        setErrorMessage(error instanceof SellerApiClientError ? error.message : 'Không thể tải hội thoại');
      }
    } finally {
      if (!silent) {
        setLoadingConversations(false);
      }
    }
  }, [accessToken, open, selectedConversationId]);

  const loadMessages = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!open || !selectedConversationId) return;

    if (!silent) {
      setLoadingMessages(true);
      setErrorMessage('');
    }
    try {
      const result = await listSellerChatMessages(accessToken, selectedConversationId, { limit: 50 });
      setMessages(Array.isArray(result.items) ? result.items.map((item) => ({ ...item })) : []);
      await markSellerChatRead(accessToken, selectedConversationId);
      setConversations((prev) =>
        prev.map((item) =>
          item.id === selectedConversationId
            ? {
                ...item,
                unread: {
                  ...item.unread,
                  seller: 0
                }
              }
            : item
        )
      );
    } catch (error) {
      if (!silent) {
        setErrorMessage(error instanceof SellerApiClientError ? error.message : 'Không thể tải tin nhắn');
      }
    } finally {
      if (!silent) {
        setLoadingMessages(false);
      }
    }
  }, [accessToken, open, selectedConversationId]);

  const handleSendMessage = useCallback(async () => {
    const text = messageInput.trim();
    if (!open || !text || !selectedConversationId || sendingMessage) {
      return;
    }
    if (!chatSafety.allowed) {
      setErrorMessage(chatSafety.message ?? 'Tin nhắn không hợp lệ');
      return;
    }

    const optimisticId = `tmp-${Date.now()}`;
    const optimistic: SellerMessageView = {
      id: optimisticId,
      conversationId: selectedConversationId,
      seq: Date.now(),
      senderId: sellerId,
      senderRole: 'SELLER',
      kind: 'TEXT',
      text,
      sentAt: new Date().toISOString(),
      localState: 'pending'
    };

    setSendingMessage(true);
    setMessageInput('');
    setMessages((prev) => [...prev, optimistic]);

    try {
      const saved = await sendSellerChatMessage(accessToken, selectedConversationId, {
        text,
        clientMessageId: `seller-mini-${Date.now()}`
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
      setErrorMessage(error instanceof SellerApiClientError ? error.message : 'Gửi tin nhắn thất bại');
    } finally {
      setSendingMessage(false);
    }
  }, [accessToken, chatSafety, messageInput, open, selectedConversationId, sellerId, sendingMessage]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadConversations();
  }, [open, loadConversations]);

  useEffect(() => {
    if (!open || !selectedConversationId) {
      setMessages([]);
      return;
    }
    void loadMessages();
  }, [open, selectedConversationId, loadMessages]);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => {
      void loadConversations({ silent: true });
      void loadMessages({ silent: true });
    }, SELLER_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [open, loadConversations, loadMessages]);

  return (
    <>
      <div className="fixed right-2 top-[520px] z-40 hidden flex-col gap-2 lg:flex">
        <button
          type="button"
          className="h-10 w-10 rounded-full border border-[#f05e41] bg-[#f05e41] text-lg text-white shadow-sm transition hover:bg-[#db4729]"
          aria-label="Thông báo"
        >
          🔔
        </button>
        <button
          type="button"
          className="relative h-10 w-10 rounded-full border border-[#f05e41] bg-[#f05e41] text-lg text-white shadow-sm transition hover:bg-[#db4729]"
          aria-label="Hỗ trợ"
        >
          🎧
        </button>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="relative h-10 w-10 rounded-full border border-[#f05e41] bg-[#f05e41] text-lg text-white shadow-sm transition hover:bg-[#db4729]"
          aria-label="Chat"
        >
          💬
          {totalUnread > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#ee4d2d] px-1 text-[10px] font-semibold text-white">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          ) : null}
        </button>
      </div>

      {open ? (
        <aside className={`fixed bottom-4 right-16 top-20 z-40 hidden ${SELLER_DRAWER_WIDTH_CLASS} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)] lg:flex`}>
          <div className={`flex ${SELLER_DRAWER_LIST_WIDTH_CLASS} flex-col border-r border-slate-200 bg-[#fbfcfe]`}>
            <div className="relative border-b border-slate-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-3 pr-14">
                <div>
                  <p className="text-xl font-bold text-slate-950">Tin nhắn</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{conversations.length} khách hàng</p>
                </div>
                {totalUnread > 0 ? (
                  <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-[#fff1ec] px-2.5 py-1 text-xs font-bold text-[#ee4d2d]">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute right-4 top-4 rounded-full px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
              >
                Đóng
              </button>
            </div>

            <div className="border-b border-slate-200 bg-white px-4 py-3">
              <Link href="/customer-care/chat" className="inline-flex items-center rounded-xl border border-[#ffd6ca] bg-[#fff7f3] px-3 py-2 text-xs font-bold text-[#ee4d2d] transition hover:bg-[#fff1ec]">
                Mở trang chat đầy đủ
              </Link>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-2">
              {loadingConversations ? <p className="px-3 py-3 text-sm font-medium text-slate-500">Đang tải...</p> : null}
              {!loadingConversations && conversations.length === 0 ? (
                <div className="m-2 rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center">
                  <p className="text-sm font-semibold text-slate-700">Chưa có hội thoại</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Tin nhắn của khách sẽ hiện tại đây.</p>
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
                        onClick={() => setSelectedConversationId(item.id)}
                        className={`group flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                          selectedConversationId === item.id
                            ? 'border-[#ffd6ca] bg-white shadow-sm'
                            : 'border-transparent hover:border-slate-200 hover:bg-white'
                        }`}
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
          </div>

          <div className="flex min-w-0 flex-1 flex-col bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
              {selectedConversation ? (
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fff1ec] text-base font-bold text-[#ee4d2d] ring-1 ring-[#ffd8cf]">
                    {getInitial(selectedBuyerName)}
                  </span>
                  <span className="min-w-0">
                    <p className="truncate text-base font-bold text-slate-950">{selectedBuyerName}</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">Trả lời nhanh từ trang chủ</p>
                  </span>
                </div>
              ) : (
                <div>
                  <p className="text-base font-bold text-slate-950">Chọn hội thoại</p>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">Chọn khách hàng để trả lời.</p>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_48%,#f8fafc_100%)] p-5">
              {loadingMessages ? <p className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-500 shadow-sm">Đang tải tin nhắn...</p> : null}
              {!loadingMessages && messages.length === 0 ? (
                <div className="mx-auto mt-24 max-w-sm rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center shadow-sm">
                  <p className="text-sm font-bold text-slate-800">Chưa có tin nhắn</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Khách chưa gửi nội dung nào trong hội thoại này.</p>
                </div>
              ) : null}

              <div className="space-y-4">
                {messages.map((item) => {
                  const mine = item.senderId === sellerId;
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
                  className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-[#ee4d2d] focus:bg-white disabled:bg-slate-100"
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
          </div>
        </aside>
      ) : null}
    </>
  );
}

function dedupeSellerConversations(items: SellerChatConversation[]): SellerChatConversation[] {
  const byBuyer = new Map<string, SellerChatConversation>();

  for (const item of items) {
    const key = item.buyerId || item.id;
    const current = byBuyer.get(key);
    if (!current || compareConversationPriority(item, current) < 0) {
      byBuyer.set(key, item);
    }
  }

  return [...byBuyer.values()].sort(compareConversationPriority);
}

function compareConversationPriority(a: SellerChatConversation, b: SellerChatConversation): number {
  const aUpdated = Date.parse(a.updatedAt || '');
  const bUpdated = Date.parse(b.updatedAt || '');

  const aScore = Number.isFinite(aUpdated) ? aUpdated : 0;
  const bScore = Number.isFinite(bUpdated) ? bUpdated : 0;

  if (aScore !== bScore) {
    return bScore - aScore;
  }

  const aUnread = a.unread?.seller ?? 0;
  const bUnread = b.unread?.seller ?? 0;
  if (aUnread !== bUnread) {
    return bUnread - aUnread;
  }

  return a.id.localeCompare(b.id);
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
