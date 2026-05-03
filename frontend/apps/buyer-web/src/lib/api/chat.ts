import { requestBuyerApi } from './client';
import type {
  BuyerChatConversation,
  BuyerChatConversationsOutput,
  BuyerChatMessage,
  BuyerChatMessagesOutput,
  CreateBuyerChatConversationInput,
  SendBuyerChatMessageInput
} from './types';

interface AuthRequestInit extends RequestInit {
  accessToken: string;
}

function withAuth(accessToken: string, init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {})
    }
  };
}

export function listBuyerChatConversations(input: AuthRequestInit & { page?: number; pageSize?: number }): Promise<BuyerChatConversationsOutput> {
  const { accessToken, page, pageSize, ...init } = input;
  const params = new URLSearchParams();
  if (typeof page === 'number') params.set('page', String(page));
  if (typeof pageSize === 'number') params.set('pageSize', String(pageSize));
  const suffix = params.toString();

  return requestBuyerApi<unknown>(`/api/buyer/chat/conversations${suffix ? `?${suffix}` : ''}`,
    withAuth(accessToken, {
      method: 'GET',
      cache: 'no-store',
      ...init
    })
  ).then(normalizeConversationList);
}

export function createBuyerChatConversation(input: AuthRequestInit & { payload: CreateBuyerChatConversationInput }): Promise<BuyerChatConversation> {
  const { accessToken, payload, ...init } = input;

  return requestBuyerApi<BuyerChatConversation>(
    '/api/buyer/chat/conversations',
    withAuth(accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
      ...init
    })
  );
}

export function listBuyerChatMessages(
  input: AuthRequestInit & {
    conversationId: string;
    limit?: number;
    beforeSeq?: number;
  }
): Promise<BuyerChatMessagesOutput> {
  const { accessToken, conversationId, limit, beforeSeq, ...init } = input;
  const params = new URLSearchParams();
  if (typeof limit === 'number') params.set('limit', String(limit));
  if (typeof beforeSeq === 'number') params.set('beforeSeq', String(beforeSeq));
  const suffix = params.toString();

  return requestBuyerApi<BuyerChatMessagesOutput>(
    `/api/buyer/chat/conversations/${encodeURIComponent(conversationId)}/messages${suffix ? `?${suffix}` : ''}`,
    withAuth(accessToken, {
      method: 'GET',
      cache: 'no-store',
      ...init
    })
  );
}

export function sendBuyerChatMessage(
  input: AuthRequestInit & {
    conversationId: string;
    payload: SendBuyerChatMessageInput;
  }
): Promise<BuyerChatMessage> {
  const { accessToken, conversationId, payload, ...init } = input;

  return requestBuyerApi<BuyerChatMessage>(
    `/api/buyer/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
    withAuth(accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
      ...init
    })
  );
}

export function markBuyerChatRead(input: AuthRequestInit & { conversationId: string }): Promise<{ conversationId: string }> {
  const { accessToken, conversationId, ...init } = input;

  return requestBuyerApi<{ conversationId: string }>(
    `/api/buyer/chat/conversations/${encodeURIComponent(conversationId)}/read`,
    withAuth(accessToken, {
      method: 'POST',
      body: JSON.stringify({}),
      ...init
    })
  );
}

function normalizeConversationList(payload: unknown): BuyerChatConversationsOutput {
  if (Array.isArray(payload)) {
    return {
      items: dedupeBySeller(payload as BuyerChatConversation[])
    };
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
    const normalized = payload as BuyerChatConversationsOutput;
    return {
      ...normalized,
      items: dedupeBySeller(normalized.items ?? [])
    };
  }

  return {
    items: []
  };
}

function dedupeBySeller(items: BuyerChatConversation[]): BuyerChatConversation[] {
  const map = new Map<string, BuyerChatConversation>();

  for (const item of items) {
    const key = item.sellerId || item.id;
    const current = map.get(key);
    if (!current || comparePriority(item, current) < 0) {
      map.set(key, item);
    }
  }

  return [...map.values()].sort(comparePriority);
}

function comparePriority(a: BuyerChatConversation, b: BuyerChatConversation): number {
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
