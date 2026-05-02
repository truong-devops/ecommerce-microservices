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

  return requestBuyerApi<BuyerChatConversationsOutput>(`/api/buyer/chat/conversations${suffix ? `?${suffix}` : ''}`,
    withAuth(accessToken, {
      method: 'GET',
      cache: 'no-store',
      ...init
    })
  );
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
