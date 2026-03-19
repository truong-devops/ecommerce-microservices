import type { BuyerApiResponse } from './types';

export class BuyerApiClientError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BuyerApiClientError';
    this.code = code;
  }
}

export async function requestBuyerApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });

  let payload: BuyerApiResponse<T> | null = null;

  try {
    payload = (await response.json()) as BuyerApiResponse<T>;
  } catch {
    throw new BuyerApiClientError('INVALID_RESPONSE', 'Invalid API response');
  }

  if (!response.ok || !payload.success) {
    const code = payload && !payload.success ? payload.error.code : 'REQUEST_FAILED';
    const message = payload && !payload.success ? payload.error.message : 'Request failed';
    throw new BuyerApiClientError(code, message);
  }

  return payload.data;
}
