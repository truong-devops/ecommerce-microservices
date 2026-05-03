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
import { formatCustomerCode } from '@/lib/order-codes';
import type { SellerChatConversation, SellerChatMessage } from '@/lib/api/types';

interface SellerChatDrawerProps {
  accessToken: string;
  sellerId: string;
}

type SellerMessageView = SellerChatMessage & { localState?: 'pending' | 'failed' };

const SELLER_DRAWER_WIDTH_CLASS = 'w-[650px]';
const SELLER_DRAWER_LIST_WIDTH_CLASS = 'w-[210px]';
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

  const resolveBuyerDisplayName = useCallback((conversation: SellerChatConversation): string => {
    const nameFromContext = (conversation.context?.buyerName ?? '').trim();
    if (nameFromContext) {
      return nameFromContext;
    }

    const code = conversation.buyerCode || formatCustomerCode(conversation.buyerId);
    return `Khách hàng ${code}`;
  }, []);

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
  }, [accessToken, messageInput, open, selectedConversationId, sellerId, sendingMessage]);

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
        <aside className={`fixed bottom-3 right-14 top-16 z-40 hidden ${SELLER_DRAWER_WIDTH_CLASS} overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl lg:flex`}>
          <div className={`flex ${SELLER_DRAWER_LIST_WIDTH_CLASS} flex-col border-r border-slate-200`}>
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <p className="text-sm font-semibold text-[#ee4d2d]">Chat</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
              >
                Đóng
              </button>
            </div>

            <div className="px-3 py-2">
              <Link href="/customer-care/chat" className="text-xs font-medium text-[#0b6bde] hover:underline">
                Mở trang chat đầy đủ
              </Link>
            </div>

            <div className="flex-1 overflow-auto">
              {loadingConversations ? <p className="px-3 py-2 text-xs text-slate-500">Đang tải...</p> : null}
              {!loadingConversations && conversations.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-500">Chưa có hội thoại</p>
              ) : null}

              <ul className="divide-y divide-slate-100">
                {conversations.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedConversationId(item.id)}
                      className={`w-full px-3 py-2 text-left ${selectedConversationId === item.id ? 'bg-[#fff7f3]' : 'hover:bg-slate-50'}`}
                    >
                      <p className="truncate text-xs font-semibold text-slate-700">{resolveBuyerDisplayName(item)}</p>
                      <p className="truncate text-[11px] text-slate-500">{item.lastMessage?.textPreview ?? '...'}</p>
                      {(item.unread?.seller ?? 0) > 0 ? (
                        <span className="mt-1 inline-flex rounded-full bg-[#ee4d2d] px-1.5 py-0.5 text-[10px] text-white">
                          {item.unread.seller}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-slate-200 px-3 py-2">
              <p className="truncate text-sm font-medium text-slate-700">
                {selectedConversation ? resolveBuyerDisplayName(selectedConversation) : 'Chọn hội thoại'}
              </p>
            </div>

            <div className="flex-1 space-y-2 overflow-auto p-3">
              {loadingMessages ? <p className="text-xs text-slate-500">Đang tải tin nhắn...</p> : null}
              {!loadingMessages && messages.length === 0 ? <p className="text-xs text-slate-500">Chưa có tin nhắn</p> : null}

              {messages.map((item) => {
                const mine = item.senderId === sellerId;
                const senderCode =
                  item.senderCode ||
                  (mine
                    ? selectedConversation?.context?.sellerName || selectedConversation?.sellerCode || ''
                    : selectedConversation
                      ? resolveBuyerDisplayName(selectedConversation)
                      : formatCustomerCode(item.senderId));
                return (
                  <div key={item.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs ${mine ? 'bg-[#ee4d2d] text-white' : 'bg-slate-100 text-slate-800'}`}>
                      {!mine ? <p className="mb-1 text-[10px] font-medium text-slate-500">{senderCode}</p> : null}
                      <p>{item.text}</p>
                      <p className={`mt-1 text-[10px] ${mine ? 'text-orange-100' : 'text-slate-400'}`}>{new Date(item.sentAt).toLocaleTimeString()}</p>
                      {mine && item.localState === 'pending' ? <p className="text-[10px] text-orange-100">Sending...</p> : null}
                      {mine && item.localState === 'failed' ? <p className="text-[10px] text-rose-100">Failed</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-200 p-2">
              <div className="flex gap-1.5">
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
                  className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-[#ee4d2d]"
                  disabled={!selectedConversationId}
                />
                <button
                  type="button"
                  onClick={() => void handleSendMessage()}
                  disabled={!selectedConversationId || sendingMessage}
                  className="rounded bg-[#ee4d2d] px-2.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Gửi
                </button>
              </div>
              {errorMessage ? <p className="mt-1 text-[11px] text-rose-600">{errorMessage}</p> : null}
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
