import { requestBuyerApi } from './client';
import type { LiveMessagesOutput, LiveProduct, LiveSession, LiveSessionDetail, TrackLiveMediaMetricInput } from './types';

interface ListLiveSessionsInput {
  page?: number;
  pageSize?: number;
  status?: string;
}

export function listLiveSessions(input?: ListLiveSessionsInput): Promise<LiveSession[]> {
  const params = new URLSearchParams();
  params.set('page', String(input?.page ?? 1));
  params.set('pageSize', String(input?.pageSize ?? 20));
  if (input?.status?.trim()) {
    params.set('status', input.status.trim());
  }

  return requestBuyerApi<LiveSession[]>(`/api/buyer/live/sessions?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store'
  });
}

export function getLiveSession(sessionId: string, accessToken?: string | null): Promise<LiveSessionDetail> {
  return requestBuyerApi<LiveSessionDetail>(`/api/buyer/live/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
    cache: 'no-store',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
  });
}

export function listLiveProducts(sessionId: string): Promise<LiveProduct[]> {
  return requestBuyerApi<LiveProduct[]>(`/api/buyer/live/sessions/${encodeURIComponent(sessionId)}/products`, {
    method: 'GET',
    cache: 'no-store'
  });
}

export function listLiveMessages(
  sessionId: string,
  input: { page?: number; pageSize?: number } = {},
  accessToken?: string | null
): Promise<LiveMessagesOutput> {
  const params = new URLSearchParams();
  params.set('page', String(input.page ?? 1));
  params.set('pageSize', String(input.pageSize ?? 50));

  return requestBuyerApi<LiveMessagesOutput>(`/api/buyer/live/sessions/${encodeURIComponent(sessionId)}/messages?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
  });
}

export function trackLiveProductClick(sessionId: string, productId: string, accessToken?: string | null): Promise<{ tracked: boolean }> {
  return requestBuyerApi<{ tracked: boolean }>(`/api/buyer/live/sessions/${encodeURIComponent(sessionId)}/events/product-clicked`, {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: JSON.stringify({ productId })
  });
}

export function trackLiveMediaMetric(sessionId: string, payload: TrackLiveMediaMetricInput, accessToken?: string | null): Promise<{ tracked: boolean }> {
  return requestBuyerApi<{ tracked: boolean }>(`/api/buyer/live/sessions/${encodeURIComponent(sessionId)}/events/media-metric`, {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: JSON.stringify(payload)
  });
}

export function buildLiveWebSocketUrl(sessionId: string): string {
  const fallback = 'ws://localhost:12000/api/v1';
  const configured = process.env.NEXT_PUBLIC_API_GATEWAY_WS_URL ?? fallback;
  const base = configured.replace(/\/$/, '');
  return `${base}/live/ws?sessionId=${encodeURIComponent(sessionId)}`;
}
