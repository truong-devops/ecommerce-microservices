import { requestBuyerApi } from './client';
import type { BuyerProfileOutput, UpdateBuyerProfileInput } from './types';

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

export function getBuyerProfile(input: AuthRequestInit): Promise<BuyerProfileOutput> {
  const { accessToken, ...init } = input;

  return requestBuyerApi<BuyerProfileOutput>(
    '/api/buyer/profile',
    withAuth(accessToken, {
      method: 'GET',
      cache: 'no-store',
      ...init
    })
  );
}

export function updateBuyerProfile(input: AuthRequestInit & { payload: UpdateBuyerProfileInput }): Promise<BuyerProfileOutput> {
  const { accessToken, payload, ...init } = input;

  return requestBuyerApi<BuyerProfileOutput>(
    '/api/buyer/profile',
    withAuth(accessToken, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      ...init
    })
  );
}
