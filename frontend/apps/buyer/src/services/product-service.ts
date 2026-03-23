import { apiResolverVersion, productApiBaseUrlCandidates } from '../constants/env';
import { ApiEnvelope } from '../types/api';
import { ProductListResponse } from '../types/product';

function buildProductPaths(search?: string): string[] {
  const searchParams = new URLSearchParams();
  searchParams.set('page', '1');
  searchParams.set('pageSize', '24');

  if (search?.trim()) {
    searchParams.set('search', search.trim());
  }

  const query = searchParams.toString();
  return [`/api/v1/products?${query}`, `/api/products?${query}`];
}

function getErrorMessage(response: Response, payload: ApiEnvelope<unknown> | null): string {
  if (payload && payload.success === false) {
    return payload.error.message;
  }

  return `Request failed with status ${response.status}.`;
}

function isRetryableFailure(response: Response, payload: ApiEnvelope<unknown> | null): boolean {
  if (response.status === 408 || response.status === 429 || response.status >= 500) {
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

export async function fetchPublicProducts(search?: string): Promise<ProductListResponse> {
  const paths = buildProductPaths(search);
  let latestResponse: Response | null = null;
  let latestPayload: ApiEnvelope<ProductListResponse> | null = null;
  let networkFailed = true;
  const connectionErrors: string[] = [];

  for (const baseUrl of productApiBaseUrlCandidates) {
    for (const path of paths) {
      const requestUrl = `${baseUrl}${path}`;
      let response: Response;

      try {
        response = await fetchWithTimeout(requestUrl, {
          method: 'GET'
        });
        networkFailed = false;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown_network_error';
        connectionErrors.push(`${requestUrl} -> ${reason}`);
        continue;
      }

      let payload: ApiEnvelope<ProductListResponse> | null = null;
      try {
        payload = (await response.json()) as ApiEnvelope<ProductListResponse>;
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

      const rawData = payload.data as unknown;
      const rawMeta = (payload as unknown as { meta?: { pagination?: ProductListResponse['pagination'] } }).meta;

      if (Array.isArray(rawData)) {
        return {
          items: rawData as ProductListResponse['items'],
          pagination: rawMeta?.pagination ?? {
            page: 1,
            pageSize: rawData.length,
            totalItems: rawData.length,
            totalPages: 1
          }
        };
      }

      return rawData as ProductListResponse;
    }
  }

  if (networkFailed) {
    const detailMessage =
      connectionErrors.length > 0 ? ` Details: ${connectionErrors.slice(0, 3).join(' | ')}` : '';
    throw new Error(
      `Cannot connect to API (resolver ${apiResolverVersion}). Checked ${productApiBaseUrlCandidates.join(', ')}. Ensure api-gateway (8080) or product-service (3003) is running.${detailMessage}`
    );
  }

  throw new Error(
    latestResponse ? getErrorMessage(latestResponse, latestPayload) : 'Route not found for products endpoint.'
  );
}
