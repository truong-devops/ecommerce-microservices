'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listBuyerChatConversations,
  listBuyerChatMessages,
  markBuyerChatRead,
  sendBuyerChatMessage
} from '@/lib/api/chat';
import { BuyerApiClientError } from '@/lib/api/client';
import type { BuyerChatConversation, BuyerChatMessage } from '@/lib/api/types';

interface BuyerChatDrawerProps {
  accessToken: string | null;
  buyerId: string | null;
}

type BuyerMessageView = BuyerChatMessage & { localState?: 'pending' | 'failed' };

export function BuyerChatDrawer({ accessToken, buyerId }: BuyerChatDrawerProps) {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<BuyerChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [messages, setMessages] = useState<BuyerMessageView[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  const totalUnread = useMemo(
    () => conversations.reduce((total, item) => total + (item.unread?.buyer ?? 0), 0),
    [conversations]
  );

  const loadConversations = useCallback(async () => {
    if (!open || !accessToken) return;

    setLoadingConversations(true);
    setErrorMessage('');
    try {
      const result = await listBuyerChatConversations({ accessToken, page: 1, pageSize: 50 });
      const nextItems = Array.isArray(result.items) ? result.items : [];
      setConversations(nextItems);

      if (!selectedConversationId && nextItems.length > 0) {
        setSelectedConversationId(nextItems[0].id);
      } else if (selectedConversationId && !nextItems.some((item) => item.id === selectedConversationId)) {
        setSelectedConversationId(nextItems[0]?.id ?? '');
      }
    } catch (error) {
      setErrorMessage(error instanceof BuyerApiClientError ? error.message : 'Không thể tải hội thoại');
    } finally {
      setLoadingConversations(false);
    }
  }, [accessToken, open, selectedConversationId]);

  const loadMessages = useCallback(async () => {
    if (!open || !accessToken || !selectedConversationId) return;

    setLoadingMessages(true);
    setErrorMessage('');
    try {
      const result = await listBuyerChatMessages({
        accessToken,
        conversationId: selectedConversationId,
        limit: 50
      });
      setMessages(Array.isArray(result.items) ? result.items.map((item) => ({ ...item })) : []);
      await markBuyerChatRead({ accessToken, conversationId: selectedConversationId });
      setConversations((prev) =>
        prev.map((item) =>
          item.id === selectedConversationId
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
  }, [accessToken, open, selectedConversationId]);

  const handleSendMessage = useCallback(async () => {
    const text = messageInput.trim();
    if (!open || !accessToken || !selectedConversationId || !text || sendingMessage) {
      return;
    }

    const optimisticId = `tmp-${Date.now()}`;
    const optimistic: BuyerMessageView = {
      id: optimisticId,
      conversationId: selectedConversationId,
      seq: Date.now(),
      senderId: buyerId ?? '',
      senderRole: 'CUSTOMER',
      kind: 'TEXT',
      text,
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
          text,
          clientMessageId: `buyer-mini-${Date.now()}`
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
      setErrorMessage(error instanceof BuyerApiClientError ? error.message : 'Gửi tin nhắn thất bại');
    } finally {
      setSendingMessage(false);
    }
  }, [accessToken, buyerId, messageInput, open, selectedConversationId, sendingMessage]);

  useEffect(() => {
    if (!open || !accessToken) return;
    void loadConversations();
  }, [open, accessToken, loadConversations]);

  useEffect(() => {
    if (!open || !accessToken || !selectedConversationId) {
      setMessages([]);
      return;
    }
    void loadMessages();
  }, [open, accessToken, selectedConversationId, loadMessages]);

  useEffect(() => {
    if (!open || !accessToken) return;
    const timer = setInterval(() => {
      void loadConversations();
      void loadMessages();
    }, 7000);
    return () => clearInterval(timer);
  }, [open, accessToken, loadConversations, loadMessages]);

  return (
    <>
      <div className="fixed right-2 top-[500px] z-40 hidden flex-col gap-2 lg:flex">
        <button
          type="button"
          className="h-10 w-10 rounded-full border border-[#f05e41] bg-[#f05e41] text-lg text-white shadow-sm transition hover:bg-[#db4729]"
          aria-label="Thông báo"
        >
          🔔
        </button>
        <button
          type="button"
          className="h-10 w-10 rounded-full border border-[#f05e41] bg-[#f05e41] text-lg text-white shadow-sm transition hover:bg-[#db4729]"
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
            <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold text-[#ee4d2d]">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          ) : null}
        </button>
      </div>

      {open ? (
        <aside className="fixed bottom-3 right-14 top-16 z-40 hidden w-[380px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl lg:flex">
          {!accessToken ? (
            <div className="flex w-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm font-semibold text-slate-700">Bạn cần đăng nhập để chat</p>
              <Link href="/login" className="rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#db4729]">
                Đăng nhập
              </Link>
            </div>
          ) : (
            <>
              <div className="flex w-[170px] flex-col border-r border-slate-200">
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
                  <Link href="/chat" className="text-xs font-medium text-[#0b6bde] hover:underline">
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
                          <p className="truncate text-xs font-semibold text-slate-700">Seller: {item.sellerId.slice(0, 8)}</p>
                          <p className="truncate text-[11px] text-slate-500">{item.lastMessage?.textPreview ?? '...'}</p>
                          {(item.unread?.buyer ?? 0) > 0 ? (
                            <span className="mt-1 inline-flex rounded-full bg-[#ee4d2d] px-1.5 py-0.5 text-[10px] text-white">
                              {item.unread.buyer}
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
                    {selectedConversation ? `Hội thoại ${selectedConversation.id.slice(0, 8)}...` : 'Chọn hội thoại'}
                  </p>
                </div>

                <div className="flex-1 space-y-2 overflow-auto p-3">
                  {loadingMessages ? <p className="text-xs text-slate-500">Đang tải tin nhắn...</p> : null}
                  {!loadingMessages && messages.length === 0 ? <p className="text-xs text-slate-500">Chưa có tin nhắn</p> : null}

                  {messages.map((item) => {
                    const mine = item.senderId === buyerId;
                    return (
                      <div key={item.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs ${mine ? 'bg-[#ee4d2d] text-white' : 'bg-slate-100 text-slate-800'}`}>
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
            </>
          )}
        </aside>
      ) : null}
    </>
  );
}
