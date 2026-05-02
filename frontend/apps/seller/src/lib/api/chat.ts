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

  return requestSellerApi<SellerChatConversationsOutput>(`/api/seller/chat/conversations${suffix ? `?${suffix}` : ''}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
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
