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
import { validateChatText } from '@/lib/chat-safety';
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

const BUYER_DRAWER_WIDTH_CLASS = 'w-[920px]';
const BUYER_DRAWER_LIST_WIDTH_CLASS = 'w-[310px]';
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
  const chatSafety = useMemo(() => validateChatText(messageInput), [messageInput]);

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
    if (!chatSafety.allowed) {
      setErrorMessage(chatSafety.message ?? 'Tin nhắn không hợp lệ');
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
  }, [accessToken, buyerId, chatSafety, creatingConversation, messageInput, open, selectedConversation, selectedConversationId, sendingMessage]);

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
          className={`fixed bottom-6 right-16 z-40 hidden h-[660px] max-h-[calc(100vh-120px)] ${BUYER_DRAWER_WIDTH_CLASS} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)] lg:flex`}
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
              <div className={`flex ${BUYER_DRAWER_LIST_WIDTH_CLASS} flex-col border-r border-slate-200 bg-[#fbfcfe]`}>
                <div className="border-b border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-2xl font-bold leading-none text-slate-950">Tin nhắn</p>
                      <p className="mt-1 text-xs font-medium text-slate-500">{filteredConversations.length} hội thoại</p>
                    </div>
                    <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-[#fff1ec] px-2.5 py-1 text-xs font-bold text-[#ee4d2d]">
                      {totalUnread > 99 ? '99+' : totalUnread}
                    </span>
                  </div>
                </div>
                <div className="border-b border-slate-200 bg-white px-4 py-3">
                  <input
                    value={searchKeyword}
                    onChange={(event) => setSearchKeyword(event.target.value)}
                    placeholder="Tìm theo tên"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-[#ee4d2d] focus:bg-white"
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  {loadingConversations ? <p className="px-4 py-3 text-sm font-medium text-slate-500">Đang tải hội thoại...</p> : null}
                  {!loadingConversations && filteredConversations.length === 0 ? (
                    <div className="m-4 rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center">
                      <p className="text-sm font-semibold text-slate-700">Chưa có hội thoại</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Bấm Chat Ngay tại shop để bắt đầu.</p>
                    </div>
                  ) : null}
                  <ul className="space-y-1 p-2">
                    {filteredConversations.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedConversationId(item.id)}
                          className={`group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${
                            selectedConversationId === item.id
                              ? 'border border-[#ffd6ca] bg-white shadow-sm'
                              : 'border border-transparent hover:border-slate-200 hover:bg-white'
                          }`}
                        >
                          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff1ec] text-sm font-bold text-[#ee4d2d] ring-1 ring-[#ffd8cf]">
                            {getInitial(resolveSellerDisplayName(item))}
                            {(item.unread?.buyer ?? 0) > 0 ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#ee4d2d] ring-2 ring-white" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className="truncate text-sm font-bold text-slate-900">{resolveSellerDisplayName(item)}</span>
                              <span className="shrink-0 text-[11px] font-medium text-slate-400">{formatDayLabel(item.updatedAt)}</span>
                            </span>
                            <span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{formatConversationPreview(item)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
                  {selectedConversation ? (
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fff1ec] text-base font-bold text-[#ee4d2d] ring-1 ring-[#ffd8cf]">
                        {getInitial(resolveSellerDisplayName(selectedConversation))}
                      </span>
                      <span className="min-w-0">
                        <p className="truncate text-base font-bold text-slate-950">{resolveSellerDisplayName(selectedConversation)}</p>
                        <p className="mt-0.5 text-xs font-medium text-emerald-600">Đang hỗ trợ trên eMall</p>
                      </span>
                    </div>
                  ) : (
                    <div>
                      <p className="text-base font-bold text-slate-950">Chưa chọn hội thoại</p>
                      <p className="mt-0.5 text-xs font-medium text-slate-500">Chọn một shop để bắt đầu.</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-xl leading-none text-slate-500 transition hover:border-[#ee4d2d] hover:bg-[#fff7f3] hover:text-[#ee4d2d]"
                    aria-label="Đóng chat"
                  >
                    ×
                  </button>
                </div>

                <div className="flex-1 overflow-auto bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_48%,#f8fafc_100%)] p-5">
                  {creatingConversation ? <p className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-500 shadow-sm">Đang kết nối với shop...</p> : null}
                  {loadingMessages ? <p className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-500 shadow-sm">Đang tải tin nhắn...</p> : null}
                  {!loadingMessages && !creatingConversation && messages.length === 0 ? (
                    <div className="mx-auto mt-28 max-w-sm rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center shadow-sm">
                      <p className="text-sm font-bold text-slate-800">Chưa có tin nhắn</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Bạn có thể hỏi shop về sản phẩm, đơn hàng hoặc hỗ trợ sau mua.</p>
                    </div>
                  ) : null}

                  <div className="space-y-4">
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
                        <div key={item.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                          {!mine ? (
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-[#ee4d2d] ring-1 ring-[#ffd8cf]">
                              {getInitial(senderCode)}
                            </span>
                          ) : null}
                          <div
                            className={`max-w-[76%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                              mine
                                ? 'rounded-br-md bg-[#ee4d2d] text-white shadow-[#ee4d2d]/20'
                                : 'rounded-bl-md border border-slate-200 bg-white text-slate-900'
                            }`}
                          >
                            {!mine ? <p className="mb-1 text-[11px] font-bold uppercase text-slate-500">{senderCode}</p> : null}
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
                      placeholder={selectedConversationId ? 'Chỉ trao đổi về sản phẩm và đơn hàng trên eMall...' : 'Bấm Chat Ngay ở thông tin shop để bắt đầu'}
                      className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-[#ee4d2d] focus:bg-white disabled:bg-slate-100"
                      disabled={!selectedConversation || creatingConversation}
                    />
                    <button
                      type="button"
                      onClick={() => void handleSendMessage()}
                      disabled={!selectedConversation || creatingConversation || sendingMessage || messageInput.trim().length === 0 || !chatSafety.allowed}
                      className="h-11 rounded-xl bg-[#ee4d2d] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#db4729] disabled:cursor-not-allowed disabled:bg-[#f3b4a7]"
                    >
                      Gửi
                    </button>
                  </div>
                  {!chatSafety.allowed ? <p className="mt-2 text-xs font-semibold text-rose-600">{chatSafety.message}</p> : null}
                  {errorMessage ? <p className="mt-2 text-xs font-semibold text-rose-600">{errorMessage}</p> : null}
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
  return (value.trim().charAt(0) || 'S').toUpperCase();
}

function formatConversationPreview(conversation: BuyerChatConversation): string {
  return conversation.lastMessage?.textPreview?.trim() || 'Bắt đầu trao đổi với shop';
}
