import { requestBuyerApi } from './client';
import type {
  CancelOrderInput,
  CreateOrderInput,
  ListOrdersInput,
  Order,
  OrderListOutput,
  OrderStatusHistoryOutput,
  ShippingQuotesOutput
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

  return requestBuyerApi<unknown>(`/api/buyer/orders${buildOrderQuery(params)}`,
    withAuth(accessToken, {
      method: 'GET',
      cache: 'no-store',
      ...init
    })
  ).then((payload) => normalizeOrderListOutput(payload, params));
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

export function quoteBuyerShipping(input: AuthRequestInit & { payload: { sellerIds: string[]; destinationProvince: string } }): Promise<ShippingQuotesOutput> {
  const { accessToken, payload, ...init } = input;

  return requestBuyerApi<ShippingQuotesOutput>(
    '/api/buyer/shipping/quotes',
    withAuth(accessToken, {
      method: 'POST',
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

export function fetchBuyerOrderById(input: AuthRequestInit & { orderId: string }): Promise<Order> {
  const { accessToken, orderId, ...init } = input;

  return requestBuyerApi<Order>(
    `/api/buyer/orders/${encodeURIComponent(orderId)}`,
    withAuth(accessToken, {
      method: 'GET',
      cache: 'no-store',
      ...init
    })
  );
}

export function fetchBuyerOrderStatusHistory(input: AuthRequestInit & { orderId: string }): Promise<OrderStatusHistoryOutput> {
  const { accessToken, orderId, ...init } = input;

  return requestBuyerApi<OrderStatusHistoryOutput>(
    `/api/buyer/orders/${encodeURIComponent(orderId)}/history`,
    withAuth(accessToken, {
      method: 'GET',
      cache: 'no-store',
      ...init
    })
  );
}

function normalizeOrderListOutput(payload: unknown, params?: ListOrdersInput): OrderListOutput {
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, params?.pageSize ?? 20));

  if (isOrderListOutput(payload)) {
    return payload;
  }

  if (Array.isArray(payload)) {
    return {
      items: payload as Order[],
      pagination: {
        page,
        pageSize,
        totalItems: payload.length,
        totalPages: payload.length === 0 ? 0 : Math.ceil(payload.length / pageSize)
      }
    };
  }

  return {
    items: [],
    pagination: {
      page,
      pageSize,
      totalItems: 0,
      totalPages: 0
    }
  };
}

function isOrderListOutput(value: unknown): value is OrderListOutput {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<OrderListOutput>;
  if (!Array.isArray(candidate.items)) {
    return false;
  }

  return Boolean(candidate.pagination && typeof candidate.pagination === 'object');
}
