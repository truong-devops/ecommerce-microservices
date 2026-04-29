import type { ModeratorApiResponse } from './types';

export class ModeratorApiClientError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ModeratorApiClientError';
    this.code = code;
  }
}

export async function requestModeratorApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });

  let payload: ModeratorApiResponse<T> | null = null;

  try {
    payload = (await response.json()) as ModeratorApiResponse<T>;
  } catch {
    throw new ModeratorApiClientError('INVALID_RESPONSE', 'Invalid API response');
  }

  if (!response.ok || !payload.success) {
    const code = payload && !payload.success ? payload.error.code : 'REQUEST_FAILED';
    const message = payload && !payload.success ? payload.error.message : 'Request failed';
    throw new ModeratorApiClientError(code, message);
  }

  return payload.data;
}
