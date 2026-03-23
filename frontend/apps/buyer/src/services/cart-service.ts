import { cartApiBaseUrlCandidates } from '../constants/env';
import { ApiEnvelope } from '../types/api';
import { AddToCartRequest, CartSnapshot, UpdateCartItemRequest } from '../types/cart';

function getCartPaths(path = ''): string[] {
  return [`/api/v1/cart${path}`, `/api/cart${path}`, `/cart${path}`];
}

function getErrorMessage(response: Response, payload: ApiEnvelope<unknown> | null): string {
  if (payload && payload.success === false) {
    return payload.error.message;
  }

  if (response.status === 401) {
    return 'Unauthorized. Please sign in again.';
  }

  if (response.status === 403) {
    return 'Forbidden. This account cannot manage cart.';
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

async function authedRequest<TResponse>(
  accessToken: string,
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  body?: unknown
): Promise<TResponse> {
  const paths = getCartPaths(path);
  let latestResponse: Response | null = null;
  let latestPayload: ApiEnvelope<TResponse> | null = null;
  let networkFailed = true;

  for (const baseUrl of cartApiBaseUrlCandidates) {
    for (const endpoint of paths) {
      const requestUrl = `${baseUrl}${endpoint}`;
      let response: Response;

      try {
        response = await fetchWithTimeout(requestUrl, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: body ? JSON.stringify(body) : undefined
        });
        networkFailed = false;
      } catch {
        continue;
      }

      let payload: ApiEnvelope<TResponse> | null = null;
      try {
        payload = (await response.json()) as ApiEnvelope<TResponse>;
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
      `Cannot connect to API. Checked ${cartApiBaseUrlCandidates.join(', ')}. Ensure api-gateway (8080) or cart-service (3004) is running.`
    );
  }

  throw new Error(latestResponse ? getErrorMessage(latestResponse, latestPayload) : 'Route not found.');
}

export function fetchMyCart(accessToken: string): Promise<CartSnapshot> {
  return authedRequest<CartSnapshot>(accessToken, '', 'GET');
}

export function addItemToCart(accessToken: string, request: AddToCartRequest): Promise<CartSnapshot> {
  return authedRequest<CartSnapshot>(accessToken, '/items', 'POST', request);
}

export function updateCartItemQuantity(
  accessToken: string,
  itemId: string,
  request: UpdateCartItemRequest
): Promise<CartSnapshot> {
  return authedRequest<CartSnapshot>(accessToken, `/items/${itemId}`, 'PATCH', request);
}
