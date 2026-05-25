import type { ApiMeta, ApiSuccess } from '@frontend/buyer-contracts';
import { unwrapApiEnvelope } from '@frontend/buyer-contracts';

import { resolveRuntimeConfig } from './config';

export interface BuyerApiResult<T> {
  data: T;
  meta?: ApiMeta;
}

export async function requestBuyerApiEnvelope<T>(path: string, init?: RequestInit, accessToken?: string): Promise<BuyerApiResult<T>> {
  const { apiBaseUrl } = resolveRuntimeConfig();
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  const payload = (await response.json()) as unknown;
  const data = unwrapApiEnvelope<T>(payload);
  const meta = response.ok ? (payload as ApiSuccess<T>).meta : undefined;
  return { data, meta };
}

export async function requestBuyerApi<T>(path: string, init?: RequestInit, accessToken?: string): Promise<T> {
  const result = await requestBuyerApiEnvelope<T>(path, init, accessToken);
  return result.data;
}
