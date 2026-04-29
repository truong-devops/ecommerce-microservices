import type { SellerApiResponse } from './types';

export class SellerApiClientError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SellerApiClientError';
    this.code = code;
  }
}

export async function requestSellerApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });

  let payload: SellerApiResponse<T> | null = null;

  try {
    payload = (await response.json()) as SellerApiResponse<T>;
  } catch {
    throw new SellerApiClientError('INVALID_RESPONSE', 'Invalid API response');
  }

  if (!response.ok || !payload.success) {
    const code = payload && !payload.success ? payload.error.code : 'REQUEST_FAILED';
    const message = payload && !payload.success ? payload.error.message : 'Request failed';
    throw new SellerApiClientError(code, message);
  }

  return payload.data;
}
