import { requestSellerApi } from './client';
import type { SellerReturnListOutput, SellerReturnRequest, SellerReturnStatus } from './types';

function withAuth(accessToken: string, init?: RequestInit): RequestInit { return { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) } }; }

export function listSellerReturns(accessToken: string, params?: { status?: SellerReturnStatus; search?: string }): Promise<SellerReturnListOutput> {
  const query = new URLSearchParams({ page: '1', pageSize: '100' });
  if (params?.status) query.set('status', params.status);
  if (params?.search?.trim()) query.set('search', params.search.trim());
  return requestSellerApi<SellerReturnListOutput>(`/api/seller/returns?${query}`, withAuth(accessToken, { method: 'GET', cache: 'no-store' }));
}

export function decideSellerReturn(accessToken: string, returnId: string, decision: 'APPROVE' | 'REJECT', note?: string): Promise<SellerReturnRequest> {
  return requestSellerApi<SellerReturnRequest>(`/api/seller/returns/${encodeURIComponent(returnId)}/decision`, withAuth(accessToken, { method: 'PATCH', body: JSON.stringify({ decision, note: note?.trim() || undefined }) }));
}

export function completeSellerReturn(accessToken: string, returnId: string, note?: string): Promise<SellerReturnRequest> {
  return requestSellerApi<SellerReturnRequest>(`/api/seller/returns/${encodeURIComponent(returnId)}/complete`, withAuth(accessToken, { method: 'PATCH', body: JSON.stringify({ note: note?.trim() || undefined }) }));
}
