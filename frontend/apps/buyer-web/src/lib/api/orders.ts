import { requestBuyerApi } from './client';
import type { CancelOrderInput, CreateOrderInput, ListOrdersInput, Order, OrderListOutput } from './types';

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

function buildOrderQuery(params?: ListOrdersInput): string {
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

  if (params.search && params.search.trim().length > 0) {
    query.set('search', params.search.trim());
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export function fetchBuyerOrders(input: AuthRequestInit & { params?: ListOrdersInput }): Promise<OrderListOutput> {
  const { accessToken, params, ...init } = input;

  return requestBuyerApi<OrderListOutput>(`/api/buyer/orders${buildOrderQuery(params)}`,
    withAuth(accessToken, {
      method: 'GET',
      cache: 'no-store',
      ...init
    })
  );
}

export function createBuyerOrder(input: AuthRequestInit & { payload: CreateOrderInput; idempotencyKey: string }): Promise<Order> {
  const { accessToken, payload, idempotencyKey, ...init } = input;

  return requestBuyerApi<Order>(
    '/api/buyer/orders',
    withAuth(accessToken, {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(payload),
      ...init
    })
  );
}

export function cancelBuyerOrder(input: AuthRequestInit & { orderId: string; payload?: CancelOrderInput }): Promise<Order> {
  const { accessToken, orderId, payload, ...init } = input;

  return requestBuyerApi<Order>(
    `/api/buyer/orders/${encodeURIComponent(orderId)}/cancel`,
    withAuth(accessToken, {
      method: 'PATCH',
      body: JSON.stringify(payload ?? {}),
      ...init
    })
  );
}

export function confirmBuyerOrderReceived(input: AuthRequestInit & { orderId: string }): Promise<Order> {
  const { accessToken, orderId, ...init } = input;

  return requestBuyerApi<Order>(
    `/api/buyer/orders/${encodeURIComponent(orderId)}/confirm-received`,
    withAuth(accessToken, {
      method: 'PATCH',
      ...init
    })
  );
}
