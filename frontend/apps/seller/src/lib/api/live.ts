import { requestSellerApi } from './client';
import type { CreateLiveSessionInput, LiveProduct, LiveSession, LiveSessionDetail, PinLiveProductInput, UpdateLiveSessionInput } from './types';

interface ListLiveSessionsInput {
  accessToken: string;
  page?: number;
  pageSize?: number;
  status?: string;
}

function withAuth(accessToken: string, init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`
    }
  };
}

export function listSellerLiveSessions(input: ListLiveSessionsInput): Promise<LiveSession[]> {
  const params = new URLSearchParams();
  params.set('page', String(input.page ?? 1));
  params.set('pageSize', String(input.pageSize ?? 20));
  if (input.status?.trim()) {
    params.set('status', input.status.trim());
  }

  return requestSellerApi<LiveSession[]>(
    `/api/seller/live/sessions?${params.toString()}`,
    withAuth(input.accessToken, { method: 'GET', cache: 'no-store' })
  );
}

export function createLiveSession(accessToken: string, payload: CreateLiveSessionInput): Promise<LiveSession> {
  return requestSellerApi<LiveSession>(
    '/api/seller/live/sessions',
    withAuth(accessToken, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  );
}

export function getSellerLiveSession(accessToken: string, sessionId: string): Promise<LiveSessionDetail> {
  return requestSellerApi<LiveSessionDetail>(
    `/api/seller/live/sessions/${encodeURIComponent(sessionId)}`,
    withAuth(accessToken, { method: 'GET', cache: 'no-store' })
  );
}

export function updateLiveSession(accessToken: string, sessionId: string, payload: UpdateLiveSessionInput): Promise<LiveSession> {
  return requestSellerApi<LiveSession>(
    `/api/seller/live/sessions/${encodeURIComponent(sessionId)}`,
    withAuth(accessToken, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    })
  );
}

export function startLiveSession(accessToken: string, sessionId: string): Promise<LiveSession> {
  return requestSellerApi<LiveSession>(
    `/api/seller/live/sessions/${encodeURIComponent(sessionId)}/start`,
    withAuth(accessToken, { method: 'PATCH' })
  );
}

export function pauseLiveSession(accessToken: string, sessionId: string): Promise<LiveSession> {
  return requestSellerApi<LiveSession>(
    `/api/seller/live/sessions/${encodeURIComponent(sessionId)}/pause`,
    withAuth(accessToken, { method: 'PATCH' })
  );
}

export function endLiveSession(accessToken: string, sessionId: string): Promise<LiveSession> {
  return requestSellerApi<LiveSession>(`/api/seller/live/sessions/${encodeURIComponent(sessionId)}/end`, withAuth(accessToken, { method: 'PATCH' }));
}

export function listPinnedLiveProducts(accessToken: string, sessionId: string): Promise<LiveProduct[]> {
  return requestSellerApi<LiveProduct[]>(
    `/api/seller/live/sessions/${encodeURIComponent(sessionId)}/products`,
    withAuth(accessToken, { method: 'GET', cache: 'no-store' })
  );
}

export function pinLiveProduct(accessToken: string, sessionId: string, payload: PinLiveProductInput): Promise<LiveProduct> {
  return requestSellerApi<LiveProduct>(
    `/api/seller/live/sessions/${encodeURIComponent(sessionId)}/products`,
    withAuth(accessToken, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  );
}

export function unpinLiveProduct(accessToken: string, sessionId: string, productId: string): Promise<LiveProduct | null> {
  return requestSellerApi<LiveProduct | null>(
    `/api/seller/live/sessions/${encodeURIComponent(sessionId)}/products/${encodeURIComponent(productId)}`,
    withAuth(accessToken, { method: 'DELETE' })
  );
}

export function buildLiveWebSocketUrl(sessionId: string): string {
  const fallback = 'ws://localhost:12000/api/v1';
  const configured = process.env.NEXT_PUBLIC_API_GATEWAY_WS_URL ?? fallback;
  const base = configured.replace(/\/$/, '');
  return `${base}/live/ws?sessionId=${encodeURIComponent(sessionId)}`;
}
