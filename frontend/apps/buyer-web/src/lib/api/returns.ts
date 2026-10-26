import { requestBuyerApi } from './client';
import type { CreateReturnRequestInput, ReturnRequest } from './types';

function withAuth(accessToken: string, init?: RequestInit): RequestInit {
  return { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) } };
}

export function fetchReturnByOrder(accessToken: string, orderId: string): Promise<ReturnRequest> {
  return requestBuyerApi<ReturnRequest>(`/api/buyer/orders/${encodeURIComponent(orderId)}/returns`, withAuth(accessToken, { method: 'GET', cache: 'no-store' }));
}

export function createReturnRequest(accessToken: string, orderId: string, payload: CreateReturnRequestInput): Promise<ReturnRequest> {
  return requestBuyerApi<ReturnRequest>(`/api/buyer/orders/${encodeURIComponent(orderId)}/returns`, withAuth(accessToken, { method: 'POST', body: JSON.stringify(payload) }));
}

export function cancelReturnRequest(accessToken: string, returnId: string): Promise<ReturnRequest> {
  return requestBuyerApi<ReturnRequest>(`/api/buyer/returns/${encodeURIComponent(returnId)}/cancel`, withAuth(accessToken, { method: 'PATCH' }));
}

export function shipReturnRequest(accessToken: string, returnId: string): Promise<ReturnRequest> {
  return requestBuyerApi<ReturnRequest>(`/api/buyer/returns/${encodeURIComponent(returnId)}/ship`, withAuth(accessToken, { method: 'PATCH' }));
}
