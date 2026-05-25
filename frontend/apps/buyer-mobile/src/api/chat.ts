import type { BuyerChatConversation, BuyerChatMessage } from '@frontend/buyer-contracts';

import { normalizeConversations, normalizeMessages } from '@/domain/chat';

import { requestBuyerApi } from './client';

export async function fetchConversations(accessToken: string): Promise<BuyerChatConversation[]> {
  const output = await requestBuyerApi<unknown>('/chat/conversations?page=1&pageSize=50', { method: 'GET' }, accessToken);
  return normalizeConversations(output);
}

export function openConversation(
  accessToken: string,
  input: { sellerId: string; productId?: string; orderId?: string; sellerName?: string }
): Promise<BuyerChatConversation> {
  return requestBuyerApi<BuyerChatConversation>(
    '/chat/conversations',
    { method: 'POST', body: JSON.stringify(input) },
    accessToken
  );
}

export async function fetchMessages(accessToken: string, conversationId: string): Promise<BuyerChatMessage[]> {
  const output = await requestBuyerApi<unknown>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`,
    { method: 'GET' },
    accessToken
  );
  return normalizeMessages(output);
}

export function sendMessage(
  accessToken: string,
  conversationId: string,
  text: string,
  clientMessageId: string
): Promise<BuyerChatMessage> {
  return requestBuyerApi<BuyerChatMessage>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: 'POST', body: JSON.stringify({ text, clientMessageId }) },
    accessToken
  );
}

export function markConversationRead(accessToken: string, conversationId: string): Promise<unknown> {
  return requestBuyerApi(`/chat/conversations/${encodeURIComponent(conversationId)}/read`, { method: 'POST', body: '{}' }, accessToken);
}
