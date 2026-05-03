import { requestSellerApi } from './client';
import type {
  CreateSellerChatConversationInput,
  SellerChatConversation,
  SellerChatConversationsOutput,
  SellerChatMessage,
  SellerChatMessagesOutput,
  SendSellerChatMessageInput
} from './types';

export async function listSellerChatConversations(accessToken: string, input?: { page?: number; pageSize?: number }): Promise<SellerChatConversationsOutput> {
  const params = new URLSearchParams();
  if (input?.page) params.set('page', String(input.page));
  if (input?.pageSize) params.set('pageSize', String(input.pageSize));
  const suffix = params.toString();

  const payload = await requestSellerApi<unknown>(`/api/seller/chat/conversations${suffix ? `?${suffix}` : ''}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  return normalizeConversationList(payload);
}

export async function createSellerChatConversation(accessToken: string, payload: CreateSellerChatConversationInput): Promise<SellerChatConversation> {
  return requestSellerApi<SellerChatConversation>('/api/seller/chat/conversations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

export async function listSellerChatMessages(
  accessToken: string,
  conversationId: string,
  input?: { limit?: number; beforeSeq?: number }
): Promise<SellerChatMessagesOutput> {
  const params = new URLSearchParams();
  if (input?.limit) params.set('limit', String(input.limit));
  if (input?.beforeSeq) params.set('beforeSeq', String(input.beforeSeq));
  const suffix = params.toString();

  return requestSellerApi<SellerChatMessagesOutput>(
    `/api/seller/chat/conversations/${encodeURIComponent(conversationId)}/messages${suffix ? `?${suffix}` : ''}`,
    {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );
}

export async function sendSellerChatMessage(
  accessToken: string,
  conversationId: string,
  payload: SendSellerChatMessageInput
): Promise<SellerChatMessage> {
  return requestSellerApi<SellerChatMessage>(`/api/seller/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

export async function markSellerChatRead(accessToken: string, conversationId: string): Promise<{ conversationId: string }> {
  return requestSellerApi<{ conversationId: string }>(`/api/seller/chat/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({})
  });
}

function normalizeConversationList(payload: unknown): SellerChatConversationsOutput {
  if (Array.isArray(payload)) {
    return {
      items: dedupeByBuyer(payload as SellerChatConversation[])
    };
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
    const normalized = payload as SellerChatConversationsOutput;
    return {
      ...normalized,
      items: dedupeByBuyer(normalized.items ?? [])
    };
  }

  return {
    items: []
  };
}

function dedupeByBuyer(items: SellerChatConversation[]): SellerChatConversation[] {
  const map = new Map<string, SellerChatConversation>();

  for (const item of items) {
    const key = item.buyerId || item.id;
    const current = map.get(key);
    if (!current || comparePriority(item, current) < 0) {
      map.set(key, item);
    }
  }

  return [...map.values()].sort(comparePriority);
}

function comparePriority(a: SellerChatConversation, b: SellerChatConversation): number {
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
