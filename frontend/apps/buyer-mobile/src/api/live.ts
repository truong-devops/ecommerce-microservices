import type { LiveMessage, LiveProduct, LiveSession, LiveSessionDetail } from '@frontend/buyer-contracts';

import { requestBuyerApi } from './client';

interface LiveMessagesResponse {
  items?: LiveMessage[];
}

export function fetchLiveSessions(): Promise<LiveSession[]> {
  return requestBuyerApi<LiveSession[]>('/live/sessions?page=1&pageSize=24&status=LIVE');
}

export function fetchLiveSession(sessionId: string, accessToken?: string): Promise<LiveSessionDetail> {
  return requestBuyerApi<LiveSessionDetail>(`/live/sessions/${encodeURIComponent(sessionId)}`, { method: 'GET' }, accessToken);
}

export function fetchLiveProducts(sessionId: string): Promise<LiveProduct[]> {
  return requestBuyerApi<LiveProduct[]>(`/live/sessions/${encodeURIComponent(sessionId)}/products`);
}

export function fetchLiveMessages(sessionId: string, accessToken?: string): Promise<LiveMessage[]> {
  return requestBuyerApi<LiveMessage[] | LiveMessagesResponse>(
    `/live/sessions/${encodeURIComponent(sessionId)}/messages?page=1&pageSize=50`,
    { method: 'GET' },
    accessToken
  ).then(normalizeLiveMessagesResponse);
}

export function createLiveMessage(accessToken: string, sessionId: string, text: string, clientMessageId: string): Promise<LiveMessage> {
  return requestBuyerApi<LiveMessage>(
    `/live/sessions/${encodeURIComponent(sessionId)}/messages`,
    { method: 'POST', body: JSON.stringify({ text, clientMessageId, language: 'vi' }) },
    accessToken
  );
}

export function trackLiveProductClick(sessionId: string, productId: string, accessToken?: string): Promise<unknown> {
  return requestBuyerApi(
    `/live/sessions/${encodeURIComponent(sessionId)}/events/product-clicked`,
    { method: 'POST', body: JSON.stringify({ productId }) },
    accessToken
  );
}

function normalizeLiveMessagesResponse(payload: LiveMessage[] | LiveMessagesResponse): LiveMessage[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload.items)) {
    return payload.items;
  }
  return [];
}

export function trackLiveMetric(
  sessionId: string,
  payload: { metricType: string; playbackProtocol?: string; errorCode?: string; clientEventId?: string },
  accessToken?: string
): Promise<unknown> {
  return requestBuyerApi(
    `/live/sessions/${encodeURIComponent(sessionId)}/events/media-metric`,
    { method: 'POST', body: JSON.stringify(payload) },
    accessToken
  );
}
