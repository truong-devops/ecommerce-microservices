import { orderApiBaseUrlCandidates } from '../constants/env';
import { ApiEnvelope } from '../types/api';
import { CreateOrderRequest, OrderResponse } from '../types/order';

function buildOrderPaths(): string[] {
  return ['/api/v1/orders', '/api/orders', '/orders'];
}

function buildIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `buyer-order-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getErrorMessage(response: Response, payload: ApiEnvelope<unknown> | null): string {
  if (payload && payload.success === false) {
    return payload.error.message;
  }

  if (response.status === 401) {
    return 'Unauthorized. Please sign in again.';
  }

  if (response.status === 403) {
    return 'Forbidden. This account cannot place order.';
  }

  return `Request failed with status ${response.status}.`;
}

function isRetryableFailure(response: Response, payload: ApiEnvelope<unknown> | null): boolean {
  if (response.status === 404 || response.status === 408 || response.status === 429 || response.status >= 500) {
    return true;
  }

  if (!payload || payload.success !== false) {
    return false;
  }

  const errorCode = payload.error.code?.toLowerCase();
  if (!errorCode) {
    return false;
  }

  return errorCode.includes('upstream_timeout') || errorCode.includes('bad_gateway') || errorCode.includes('service_unavailable');
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function createCustomerOrder(accessToken: string, request: CreateOrderRequest): Promise<OrderResponse> {
  const orderPaths = buildOrderPaths();
  let latestResponse: Response | null = null;
  let latestPayload: ApiEnvelope<OrderResponse> | null = null;
  let networkFailed = true;

  for (const baseUrl of orderApiBaseUrlCandidates) {
    for (const path of orderPaths) {
      const requestUrl = `${baseUrl}${path}`;
      let response: Response;

      try {
        response = await fetchWithTimeout(requestUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': buildIdempotencyKey()
          },
          body: JSON.stringify(request)
        });
        networkFailed = false;
      } catch {
        continue;
      }

      let payload: ApiEnvelope<OrderResponse> | null = null;
      try {
        payload = (await response.json()) as ApiEnvelope<OrderResponse>;
      } catch {
        payload = null;
      }

      latestResponse = response;
      latestPayload = payload;

      if (isRetryableFailure(response, payload)) {
        continue;
      }

      if (!response.ok || !payload || payload.success === false) {
        throw new Error(getErrorMessage(response, payload));
      }

      return payload.data;
    }
  }

  if (networkFailed) {
      throw new Error(
      `Cannot connect to API. Checked ${orderApiBaseUrlCandidates.join(', ')}. Ensure api-gateway (8080) or order-service (3002) is running.`
    );
  }

  throw new Error(latestResponse ? getErrorMessage(latestResponse, latestPayload) : 'Route not found.');
}
