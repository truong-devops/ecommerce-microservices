'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { BuyerApiClientError } from '@/lib/api/client';
import {
  createBuyerChatConversation,
  listBuyerChatConversations,
  listBuyerChatMessages,
  markBuyerChatRead,
  sendBuyerChatMessage
} from '@/lib/api/chat';
import type { BuyerChatConversation, BuyerChatMessage } from '@/lib/api/types';
import { useAuth, useLanguage } from '@/providers/AppProvider';

function toWsBase(raw: string): string {
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw;
  if (raw.startsWith('https://')) return `wss://${raw.slice('https://'.length)}`;
  if (raw.startsWith('http://')) return `ws://${raw.slice('http://'.length)}`;
  return `ws://${raw}`;
}

const CHAT_WS_BASE_URL = toWsBase(process.env.NEXT_PUBLIC_CHAT_WS_BASE_URL ?? 'http://localhost:8080');
type BuyerMessageView = BuyerChatMessage & { localState?: 'pending' | 'failed' };

export default function BuyerChatPage() {
  const { text } = useLanguage();
  const { ready, user, accessToken } = useAuth();

  const [sellerIdInput, setSellerIdInput] = useState('');
  const [conversations, setConversations] = useState<BuyerChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
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

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  const loadConversations = useCallback(async () => {
    if (!accessToken) return;

    setLoadingConversations(true);
    setErrorMessage('');

    try {
      const result = await listBuyerChatConversations({ accessToken, page: 1, pageSize: 50 });
      const nextItems = Array.isArray(result.items) ? result.items : [];
      setConversations(nextItems);

      if (!selectedConversationId && nextItems.length > 0) {
        setSelectedConversationId(nextItems[0].id);
      }
      if (selectedConversationId && !nextItems.some((item) => item.id === selectedConversationId)) {
        setSelectedConversationId(nextItems[0]?.id ?? '');
      }
    } catch (error) {
      setErrorMessage(error instanceof BuyerApiClientError ? error.message : 'Cannot load conversations');
    } finally {
      setLoadingConversations(false);
    }
  }, [accessToken, selectedConversationId]);

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
    } catch (error) {
      setErrorMessage(error instanceof BuyerApiClientError ? error.message : 'Cannot load messages');
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

    const wsUrl = `${CHAT_WS_BASE_URL}/api/v1/chat/ws?conversationId=${encodeURIComponent(selectedConversationId)}&accessToken=${encodeURIComponent(accessToken)}`;
    const ws = new WebSocket(wsUrl);
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

  const handleCreateConversation = useCallback(async () => {
    const sellerId = sellerIdInput.trim();
    if (!accessToken || !sellerId) {
      return;
    }

    setCreatingConversation(true);
    setErrorMessage('');

    try {
      const conversation = await createBuyerChatConversation({
        accessToken,
        payload: {
          sellerId
        }
      });
      setConversations((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === conversation.id);
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = conversation;
          return next;
        }
        return [conversation, ...prev];
      });
      setSelectedConversationId(conversation.id);
      setSellerIdInput('');
    } catch (error) {
      setErrorMessage(error instanceof BuyerApiClientError ? error.message : 'Cannot create conversation');
    } finally {
      setCreatingConversation(false);
    }
  }, [accessToken, sellerIdInput]);

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
    } catch (error) {
      setMessages((prev) => prev.map((item) => (item.id === optimisticId ? { ...item, localState: 'failed' } : item)));
      setErrorMessage(error instanceof BuyerApiClientError ? error.message : 'Cannot send message');
    } finally {
      setSendingMessage(false);
    }
  }, [accessToken, messageInput, selectedConversationId, sendingMessage, user?.id, user?.role]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-app-bg text-slate-900">
        <Header keywords={[]} />
        <main className="mx-auto w-full max-w-[1200px] px-3 py-8 md:px-4">
          <p className="text-sm text-slate-600">Loading...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={[]} />

      <main className="mx-auto w-full max-w-[1200px] px-3 py-6 md:px-4 md:py-8">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link href="/" className="hover:text-brand-600">Home</Link>
          <span>›</span>
          <span className="font-medium text-slate-700">Chat</span>
          <span className={`ml-2 rounded px-2 py-0.5 text-xs ${wsConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
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
          <section className="grid min-h-[70vh] grid-cols-12 gap-3 rounded-md border border-slate-200 bg-white p-3">
            <aside className="col-span-12 overflow-auto rounded-md border border-slate-200 lg:col-span-4">
              <div className="border-b border-slate-200 px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">Conversations</p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={sellerIdInput}
                    onChange={(event) => setSellerIdInput(event.target.value)}
                    placeholder="sellerId"
                    className="h-9 flex-1 rounded border border-slate-300 px-2 text-xs outline-none focus:border-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateConversation()}
                    disabled={creatingConversation}
                    className="rounded bg-brand-500 px-3 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Start
                  </button>
                </div>
              </div>

              {loadingConversations ? <div className="px-3 py-2 text-sm text-slate-500">Loading...</div> : null}
              {!loadingConversations && conversations.length === 0 ? <div className="px-3 py-2 text-sm text-slate-500">No conversation yet</div> : null}

              <ul className="divide-y divide-slate-200">
                {conversations.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`w-full px-3 py-2 text-left transition ${item.id === selectedConversationId ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                      onClick={() => setSelectedConversationId(item.id)}
                    >
                      <p className="truncate text-sm font-semibold text-slate-800">Seller: {item.sellerId.slice(0, 8)}</p>
                      <p className="truncate text-xs text-slate-500">{item.lastMessage?.textPreview ?? 'No messages'}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            <section className="col-span-12 flex min-h-[60vh] flex-col rounded-md border border-slate-200 lg:col-span-8">
              <div className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700">
                {selectedConversation ? `Conversation ${selectedConversation.id.slice(0, 8)}...` : 'Choose conversation'}
              </div>

              <div className="flex-1 space-y-2 overflow-auto p-3">
                {loadingMessages ? <p className="text-sm text-slate-500">Loading messages...</p> : null}
                {!loadingMessages && messages.length === 0 ? <p className="text-sm text-slate-500">No messages</p> : null}

                {messages.map((item) => {
                  const mine = item.senderId === user.id;
                  return (
                    <div key={item.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] rounded-lg px-3 py-2 text-sm ${mine ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-800'}`}>
                        <p>{item.text}</p>
                        <p className={`mt-1 text-[10px] ${mine ? 'text-brand-100' : 'text-slate-400'}`}>{new Date(item.sentAt).toLocaleString()}</p>
                        {mine && item.localState === 'pending' ? <p className="mt-0.5 text-[10px] text-brand-100">Sending...</p> : null}
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
                    placeholder="Type a message..."
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    disabled={!selectedConversationId}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSendMessage()}
                    disabled={!selectedConversationId || sendingMessage}
                    className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
                {errorMessage ? <p className="mt-2 text-xs text-rose-600">{errorMessage}</p> : null}
              </div>
            </section>
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
