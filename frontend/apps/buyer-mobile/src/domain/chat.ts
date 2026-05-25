import type { BuyerChatConversation, BuyerChatMessage } from '@frontend/buyer-contracts';

export function normalizeChatText(text: string): string {
  const normalized = text.trim();
  if (normalized.length < 1 || normalized.length > 2000) {
    throw new Error('Tin nhắn phải có từ 1 đến 2000 ký tự');
  }
  return normalized;
}

export function mergeChatMessages(current: BuyerChatMessage[], incoming: BuyerChatMessage[]): BuyerChatMessage[] {
  const byIdentity = new Map<string, BuyerChatMessage>();
  for (const message of [...current, ...incoming]) {
    const key = message.id || message.clientMessageId || `${message.conversationId}:${message.seq}`;
    const pendingKey = message.clientMessageId ? `client:${message.clientMessageId}` : '';
    if (pendingKey && byIdentity.has(pendingKey)) {
      byIdentity.delete(pendingKey);
    }
    byIdentity.set(message.id ? `id:${message.id}` : pendingKey || key, message);
  }
  return [...byIdentity.values()].sort((left, right) => left.seq - right.seq);
}

export function normalizeConversations(payload: unknown): BuyerChatConversation[] {
  const rawItems = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
  return sortConversations(rawItems.map(normalizeConversation).filter((item): item is BuyerChatConversation => item !== null));
}

export function normalizeMessages(payload: unknown): BuyerChatMessage[] {
  const rawItems = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
  return rawItems.map(normalizeMessage).filter((item): item is BuyerChatMessage => item !== null).sort((left, right) => left.seq - right.seq);
}

export function sortConversations(items: BuyerChatConversation[] = []): BuyerChatConversation[] {
  const bySeller = new Map<string, BuyerChatConversation>();
  for (const item of items) {
    const key = item.sellerId || item.id;
    const existing = bySeller.get(key);
    if (!existing || conversationPriority(item, existing) < 0) {
      bySeller.set(key, item);
    }
  }
  return [...bySeller.values()].sort(conversationPriority);
}

export function reconnectDelay(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, Math.min(attempt, 5)));
}

export function chatWebSocketUrl(baseUrl: string, conversationId: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('conversationId', conversationId);
  return url.toString();
}

function normalizeConversation(value: unknown): BuyerChatConversation | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  if (!id) return null;
  const sellerId = stringValue(value.sellerId);
  const context = isRecord(value.context) ? value.context : {};
  const unread = isRecord(value.unread) ? value.unread : {};
  const lastMessage = isRecord(value.lastMessage) ? value.lastMessage : null;

  return {
    id,
    sellerId,
    context: {
      productId: nullableString(context.productId),
      orderId: nullableString(context.orderId),
      shopId: nullableString(context.shopId),
      sellerName: nullableString(context.sellerName),
    },
    unread: {
      buyer: numberValue(unread.buyer),
      seller: numberValue(unread.seller),
    },
    status: stringValue(value.status) || 'ACTIVE',
    createdAt: stringValue(value.createdAt) || new Date(0).toISOString(),
    updatedAt: stringValue(value.updatedAt) || stringValue(value.createdAt) || new Date(0).toISOString(),
    lastMessage: lastMessage
      ? {
          messageId: stringValue(lastMessage.messageId),
          textPreview: stringValue(lastMessage.textPreview),
          sentAt: stringValue(lastMessage.sentAt),
        }
      : undefined,
  };
}

function normalizeMessage(value: unknown): BuyerChatMessage | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const clientMessageId = stringValue(value.clientMessageId);
  if (!id && !clientMessageId) return null;

  return {
    id,
    conversationId: stringValue(value.conversationId),
    seq: numberValue(value.seq),
    clientMessageId: clientMessageId || undefined,
    senderId: stringValue(value.senderId),
    senderRole: stringValue(value.senderRole),
    text: stringValue(value.text),
    sentAt: stringValue(value.sentAt) || new Date(0).toISOString(),
  };
}

function conversationPriority(left: BuyerChatConversation, right: BuyerChatConversation): number {
  const leftUpdated = Date.parse(left.updatedAt || '');
  const rightUpdated = Date.parse(right.updatedAt || '');
  const leftScore = Number.isFinite(leftUpdated) ? leftUpdated : 0;
  const rightScore = Number.isFinite(rightUpdated) ? rightUpdated : 0;
  if (leftScore !== rightScore) return rightScore - leftScore;

  const leftUnread = left.unread?.buyer ?? 0;
  const rightUnread = right.unread?.buyer ?? 0;
  if (leftUnread !== rightUnread) return rightUnread - leftUnread;

  return left.id.localeCompare(right.id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nullableString(value: unknown): string | null {
  const output = stringValue(value);
  return output || null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
