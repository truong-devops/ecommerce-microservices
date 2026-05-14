'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createBuyerChatConversation,
  listBuyerChatConversations,
  listBuyerChatMessages,
  markBuyerChatRead,
  sendBuyerChatMessage
} from '@/lib/api/chat';
import { BuyerApiClientError } from '@/lib/api/client';
import { fetchBuyerShopDetail } from '@/lib/api/products';
import { formatCustomerCode, formatSellerCode } from '@/lib/order-codes';
import type { BuyerChatConversation, BuyerChatMessage } from '@/lib/api/types';

interface BuyerChatDrawerProps {
  accessToken: string | null;
  buyerId: string | null;
  buyerName: string | null;
}

interface BuyerChatOpenDetail {
  sellerId?: string;
  sellerName?: string;
  productId?: string;
  conversationId?: string;
}

type BuyerMessageView = BuyerChatMessage & { localState?: 'pending' | 'failed' };

const BUYER_DRAWER_WIDTH_CLASS = 'w-[800px]';
const BUYER_DRAWER_LIST_WIDTH_CLASS = 'w-[250px]';
const BUYER_POLL_INTERVAL_MS = 7000;

function makeFallbackConversation(id: string, sellerId: string): BuyerChatConversation {
  const now = new Date().toISOString();
  return {
    id,
    type: 'BUYER_SELLER',
    buyerId: '',
    sellerId,
    sellerCode: formatSellerCode(sellerId),
    context: {},
    unread: {
      buyer: 0,
      seller: 0
    },
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now
  };
}

export function BuyerChatDrawer({ accessToken, buyerId, buyerName }: BuyerChatDrawerProps) {
  const [open, setOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [conversations, setConversations] = useState<BuyerChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [messages, setMessages] = useState<BuyerMessageView[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingOpenDetail, setPendingOpenDetail] = useState<BuyerChatOpenDetail | null>(null);
  const [sellerNameMap, setSellerNameMap] = useState<Record<string, string>>({});

  const hasBootstrappedRef = useRef(false);
  const fallbackConversationMapRef = useRef<Record<string, string>>({});
  const resolvingShopNameRef = useRef<Set<string>>(new Set());
  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  const totalUnread = useMemo(
    () => conversations.reduce((total, item) => total + (item.unread?.buyer ?? 0), 0),
    [conversations]
  );

  const resolveSellerDisplayName = useCallback(
    (conversation: BuyerChatConversation): string => {
      const nameFromContext = (conversation.context?.sellerName ?? '').trim();
      if (nameFromContext) {
        return nameFromContext;
      }

      const nameFromMap = (sellerNameMap[conversation.sellerId] ?? '').trim();
      if (nameFromMap) {
        return nameFromMap;
      }

      return conversation.sellerCode || formatSellerCode(conversation.sellerId);
    },
    [sellerNameMap]
  );

  const filteredConversations = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) {
      return conversations;
    }

    return conversations.filter((item) => {
      const line = `${resolveSellerDisplayName(item)} ${item.lastMessage?.textPreview ?? ''}`.toLowerCase();
      return line.includes(keyword);
    });
  }, [conversations, resolveSellerDisplayName, searchKeyword]);

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

  const loadConversations = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!open || !accessToken) {
      return [];
    }

    if (!silent) {
      setLoadingConversations(true);
      setErrorMessage('');
    }
    try {
      const result = await listBuyerChatConversations({ accessToken, page: 1, pageSize: 50 });
      const nextItemsRaw = Array.isArray(result.items) ? result.items : [];
      let nextItems = dedupeBuyerConversations(nextItemsRaw);

      if (selectedConversationId && !nextItems.some((item) => item.id === selectedConversationId)) {
        const fallbackSellerId = fallbackConversationMapRef.current[selectedConversationId];
        if (fallbackSellerId) {
          nextItems = [makeFallbackConversation(selectedConversationId, fallbackSellerId), ...nextItems];
        } else {
          setSelectedConversationId('');
          setMessages([]);
        }
      }

      setConversations(nextItems);

      if (!selectedConversationId && nextItems.length > 0) {
        setSelectedConversationId(nextItems[0].id);
      }

      return nextItems;
    } catch (error) {
      if (!silent) {
        setErrorMessage(error instanceof BuyerApiClientError ? error.message : 'Không thể tải hội thoại');
      }
      return [];
    } finally {
      if (!silent) {
        setLoadingConversations(false);
      }
    }
  }, [accessToken, open, selectedConversationId]);

  const loadMessages = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!open || !accessToken || !selectedConversationId) {
      setMessages([]);
      return;
    }

    if (!silent) {
      setLoadingMessages(true);
      setErrorMessage('');
    }

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
      if (!silent) {
        setErrorMessage(error instanceof BuyerApiClientError ? error.message : 'Không thể tải tin nhắn');
      }
    } finally {
      if (!silent) {
        setLoadingMessages(false);
      }
    }
  }, [accessToken, open, selectedConversationId]);

  const ensureConversation = useCallback(async (sellerId: string, productId?: string, sellerName?: string) => {
    const normalizedSellerId = sellerId.trim();
    if (!accessToken || !normalizedSellerId || creatingConversation) {
      return;
    }

    setCreatingConversation(true);
    setErrorMessage('');

    try {
      let items = conversations;
      if (items.length === 0) {
        const latest = await listBuyerChatConversations({ accessToken, page: 1, pageSize: 50 });
        items = dedupeBuyerConversations(Array.isArray(latest.items) ? latest.items : []);
        setConversations(items);
      }

      const found =
        items.find((item) => item.sellerId === normalizedSellerId && (productId ? item.context?.productId === productId : true)) ??
        items.find((item) => item.sellerId === normalizedSellerId);

      if (found) {
        setSelectedConversationId(found.id);
        return;
      }

      const created = await createBuyerChatConversation({
        accessToken,
        payload: {
          sellerId: normalizedSellerId,
          productId: productId?.trim() ? productId.trim() : undefined,
          shopId: normalizedSellerId,
          buyerName: buyerName?.trim() || undefined,
          sellerName: sellerName?.trim() || sellerNameMap[normalizedSellerId]?.trim() || undefined
        }
      });
      upsertConversation(created);
      setMessages([]);
    } catch (error) {
      setErrorMessage(error instanceof BuyerApiClientError ? error.message : 'Không thể tạo hội thoại');
    } finally {
      setCreatingConversation(false);
    }
  }, [accessToken, buyerName, conversations, creatingConversation, sellerNameMap, upsertConversation]);

  const handleSendMessage = useCallback(async () => {
    const text = messageInput.trim();
    if (
      !open ||
      !accessToken ||
      !selectedConversationId ||
      !selectedConversation ||
      !selectedConversation.sellerId ||
      !text ||
      sendingMessage ||
      creatingConversation
    ) {
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
  }, [accessToken, buyerId, creatingConversation, messageInput, open, selectedConversation, selectedConversationId, sendingMessage]);

  useEffect(() => {
    if (!open || conversations.length === 0) {
      return;
    }

    const unresolvedSellerIds = [...new Set(conversations.map((item) => item.sellerId))]
      .map((value) => value.trim())
      .filter(
        (value) =>
          value.length > 0 &&
          !sellerNameMap[value] &&
          !resolvingShopNameRef.current.has(value) &&
          !conversations.some((conversation) => conversation.sellerId === value && (conversation.context?.sellerName ?? '').trim())
      );

    if (unresolvedSellerIds.length === 0) {
      return;
    }

    unresolvedSellerIds.forEach((sellerId) => {
      resolvingShopNameRef.current.add(sellerId);
    });

    void Promise.all(
      unresolvedSellerIds.map(async (sellerId) => {
        try {
          const shop = await fetchBuyerShopDetail(sellerId);
          return {
            sellerId,
            sellerName: shop.shopName.trim()
          };
        } catch {
          return {
            sellerId,
            sellerName: ''
          };
        } finally {
          resolvingShopNameRef.current.delete(sellerId);
        }
      })
    ).then((resolved) => {
      const nextEntries = resolved.filter((item) => item.sellerName.length > 0);
      if (nextEntries.length === 0) {
        return;
      }

      setSellerNameMap((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const entry of nextEntries) {
          if (next[entry.sellerId] !== entry.sellerName) {
            next[entry.sellerId] = entry.sellerName;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
  }, [conversations, open, sellerNameMap]);

  useEffect(() => {
    if (!open || !accessToken) {
      return;
    }

    if (!hasBootstrappedRef.current) {
      hasBootstrappedRef.current = true;
      void loadConversations({ silent: false });
      return;
    }

    void loadConversations({ silent: false });
  }, [open, accessToken, loadConversations]);

  useEffect(() => {
    if (!open || !accessToken) {
      return;
    }

    const timer = setInterval(() => {
      void loadConversations({ silent: true });
      void loadMessages({ silent: true });
    }, BUYER_POLL_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [open, accessToken, loadConversations, loadMessages]);

  useEffect(() => {
    void loadMessages({ silent: false });
  }, [loadMessages]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const custom = event as CustomEvent<BuyerChatOpenDetail>;
      const detail = custom.detail ?? {};
      setOpen(true);

      if (detail.conversationId) {
        if (detail.sellerId) {
          fallbackConversationMapRef.current[detail.conversationId] = detail.sellerId;
          if (detail.sellerName?.trim()) {
            setSellerNameMap((prev) => ({
              ...prev,
              [detail.sellerId!]: detail.sellerName!.trim()
            }));
          }
          setConversations((prev) =>
            prev.some((item) => item.id === detail.conversationId)
              ? prev
              : [makeFallbackConversation(detail.conversationId!, detail.sellerId!), ...prev]
          );
        }
        setSelectedConversationId(detail.conversationId);
        return;
      }

      if (detail.sellerId) {
        if (detail.sellerName?.trim()) {
          setSellerNameMap((prev) => ({
            ...prev,
            [detail.sellerId!]: detail.sellerName!.trim()
          }));
        }
        if (accessToken) {
          void ensureConversation(detail.sellerId, detail.productId, detail.sellerName);
        } else {
          setPendingOpenDetail(detail);
        }
      }
    };

    const handleToggle = () => {
      setOpen((prev) => !prev);
    };

    window.addEventListener('buyer-chat:open', handleOpen as EventListener);
    window.addEventListener('buyer-chat:toggle', handleToggle);

    return () => {
      window.removeEventListener('buyer-chat:open', handleOpen as EventListener);
      window.removeEventListener('buyer-chat:toggle', handleToggle);
    };
  }, [accessToken, ensureConversation]);

  useEffect(() => {
    if (!open || !pendingOpenDetail?.sellerId || !accessToken) {
      return;
    }

    const detail = pendingOpenDetail;
    setPendingOpenDetail(null);
    const sellerId = detail.sellerId;
    if (!sellerId) {
      return;
    }
    void ensureConversation(sellerId, detail.productId, detail.sellerName);
  }, [accessToken, ensureConversation, open, pendingOpenDetail]);

  return (
    <>
      <div className="fixed bottom-6 right-3 z-40 hidden flex-col gap-2 lg:flex">
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
        <aside
          className={`fixed bottom-6 right-16 z-40 hidden h-[620px] max-h-[calc(100vh-120px)] ${BUYER_DRAWER_WIDTH_CLASS} overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl lg:flex`}
        >
          {!accessToken ? (
            <div className="flex w-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm font-semibold text-slate-700">Bạn cần đăng nhập để chat</p>
              <Link href="/login" className="rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#db4729]">
                Đăng nhập
              </Link>
            </div>
          ) : (
            <div className="flex w-full">
              <div className={`flex ${BUYER_DRAWER_LIST_WIDTH_CLASS} flex-col border-r border-slate-200`}>
                <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                  <p className="text-[30px] leading-none font-semibold text-[#ee4d2d]">Chat</p>
                  <span className="text-xs text-[#ee4d2d]">({totalUnread})</span>
                </div>
                <div className="border-b border-slate-200 px-3 py-2">
                  <input
                    value={searchKeyword}
                    onChange={(event) => setSearchKeyword(event.target.value)}
                    placeholder="Tìm theo tên"
                    className="h-8 w-full rounded border border-slate-300 px-2 text-xs outline-none focus:border-[#ee4d2d]"
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  {loadingConversations ? <p className="px-3 py-2 text-xs text-slate-500">Đang tải hội thoại...</p> : null}
                  {!loadingConversations && filteredConversations.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-500">Bấm Chat Ngay tại shop để bắt đầu hội thoại.</p>
                  ) : null}
                  <ul className="divide-y divide-slate-100">
                    {filteredConversations.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedConversationId(item.id)}
                          className={`w-full px-3 py-2 text-left ${selectedConversationId === item.id ? 'bg-[#f5f5f5]' : 'hover:bg-slate-50'}`}
                        >
                        <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-slate-800">{resolveSellerDisplayName(item)}</p>
                            <span className="text-[11px] text-slate-400">{formatDayLabel(item.updatedAt)}</span>
                          </div>
                          <p className="truncate text-sm text-slate-600">{item.lastMessage?.textPreview ?? 'Chưa có tin nhắn'}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
                  <p className="truncate text-base font-semibold text-slate-800">
                    {selectedConversation ? resolveSellerDisplayName(selectedConversation) : 'Chưa chọn hội thoại'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex-1 space-y-2 overflow-auto bg-[#fafafa] p-3">
                  {creatingConversation ? <p className="text-sm text-slate-500">Đang kết nối với shop...</p> : null}
                  {loadingMessages ? <p className="text-sm text-slate-500">Đang tải tin nhắn...</p> : null}
                  {!loadingMessages && !creatingConversation && messages.length === 0 ? (
                    <p className="text-sm text-slate-500">Chưa có tin nhắn</p>
                  ) : null}

                  {messages.map((item) => {
                    const mine = item.senderId === buyerId;
                    const senderCode =
                      item.senderCode ||
                      (mine
                        ? formatCustomerCode(item.senderId)
                        : selectedConversation
                          ? resolveSellerDisplayName(selectedConversation)
                          : formatSellerCode(item.senderId));
                    return (
                      <div key={item.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                            mine ? 'bg-[#ee4d2d] text-white' : 'border border-slate-200 bg-white text-slate-800'
                          }`}
                        >
                          {!mine ? <p className="mb-1 text-[11px] font-medium text-slate-500">{senderCode}</p> : null}
                          <p className="whitespace-pre-wrap break-words">{item.text}</p>
                          <p className={`mt-1 text-[11px] ${mine ? 'text-orange-100' : 'text-slate-400'}`}>
                            {new Date(item.sentAt).toLocaleTimeString()}
                          </p>
                          {mine && item.localState === 'pending' ? <p className="text-[10px] text-orange-100">Sending...</p> : null}
                          {mine && item.localState === 'failed' ? <p className="text-[10px] text-rose-100">Failed</p> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-slate-200 bg-white p-2">
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
                      placeholder={selectedConversationId ? 'Nhập nội dung tin nhắn' : 'Bấm Chat Ngay ở thông tin shop để bắt đầu'}
                      className="h-10 min-w-0 flex-1 rounded border border-slate-300 px-3 text-sm outline-none focus:border-[#ee4d2d]"
                      disabled={!selectedConversation || creatingConversation}
                    />
                    <button
                      type="button"
                      onClick={() => void handleSendMessage()}
                      disabled={!selectedConversation || creatingConversation || sendingMessage || messageInput.trim().length === 0}
                      className="h-10 rounded bg-[#ee4d2d] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#f3b4a7]"
                    >
                      Gửi
                    </button>
                  </div>
                  {errorMessage ? <p className="mt-1 text-[11px] text-rose-600">{errorMessage}</p> : null}
                </div>
              </div>
            </div>
          )}
        </aside>
      ) : null}
    </>
  );
}

function dedupeBuyerConversations(items: BuyerChatConversation[]): BuyerChatConversation[] {
  const bySeller = new Map<string, BuyerChatConversation>();

  for (const item of items) {
    const key = item.sellerId || item.id;
    const current = bySeller.get(key);
    if (!current || compareBuyerConversationPriority(item, current) < 0) {
      bySeller.set(key, item);
    }
  }

  return [...bySeller.values()].sort(compareBuyerConversationPriority);
}

function compareBuyerConversationPriority(a: BuyerChatConversation, b: BuyerChatConversation): number {
  const aUpdated = Date.parse(a.updatedAt || '');
  const bUpdated = Date.parse(b.updatedAt || '');

  const aScore = Number.isFinite(aUpdated) ? aUpdated : 0;
  const bScore = Number.isFinite(bUpdated) ? bUpdated : 0;

  if (aScore !== bScore) {
    return bScore - aScore;
  }

  const aUnread = a.unread?.buyer ?? 0;
  const bUnread = b.unread?.buyer ?? 0;
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
