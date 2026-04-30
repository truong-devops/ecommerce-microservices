import { requestSellerApi } from './client';
import type {
  ListSellerOrdersInput,
  SellerOrder,
  SellerOrderListOutput,
  SellerOrderStatusHistoryOutput,
  UpdateSellerOrderStatusInput
} from './types';

function buildQuery(params?: ListSellerOrdersInput): string {
  if (!params) {
    return '';
  }

  const query = new URLSearchParams();

  if (typeof params.page === 'number') {
    query.set('page', String(params.page));
  }

  if (typeof params.pageSize === 'number') {
    query.set('pageSize', String(params.pageSize));
  }

  if (params.status) {
    query.set('status', params.status);
  }

  if (params.sortBy) {
    query.set('sortBy', params.sortBy);
  }

  if (params.sortOrder) {
    query.set('sortOrder', params.sortOrder);
  }

  if (params.search?.trim()) {
    query.set('search', params.search.trim());
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
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

export function listSellerOrders(accessToken: string, params?: ListSellerOrdersInput): Promise<SellerOrderListOutput> {
  return requestSellerApi<SellerOrderListOutput>(`/api/seller/orders${buildQuery(params)}`, withAuth(accessToken, {
    method: 'GET',
    cache: 'no-store'
  }));
}

export function getSellerOrderById(accessToken: string, orderId: string): Promise<SellerOrder> {
  return requestSellerApi<SellerOrder>(`/api/seller/orders/${encodeURIComponent(orderId)}`, withAuth(accessToken, {
    method: 'GET',
    cache: 'no-store'
  }));
}

export function getSellerOrderHistory(accessToken: string, orderId: string): Promise<SellerOrderStatusHistoryOutput> {
  return requestSellerApi<SellerOrderStatusHistoryOutput>(
    `/api/seller/orders/${encodeURIComponent(orderId)}/history`,
    withAuth(accessToken, {
      method: 'GET',
      cache: 'no-store'
    })
  );
}

export function updateSellerOrderStatus(
  accessToken: string,
  orderId: string,
  payload: UpdateSellerOrderStatusInput
): Promise<SellerOrder> {
  return requestSellerApi<SellerOrder>(
    `/api/seller/orders/${encodeURIComponent(orderId)}/status`,
    withAuth(accessToken, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    })
  );
}
