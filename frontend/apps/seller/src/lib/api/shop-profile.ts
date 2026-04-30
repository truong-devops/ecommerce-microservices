import { requestSellerApi } from './client';
import type { SellerShopProfile, UpdateSellerShopProfileInput } from './types';

function withAuth(accessToken: string, init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {})
    }
  };
}

export function getSellerShopProfile(accessToken: string): Promise<SellerShopProfile> {
  return requestSellerApi<SellerShopProfile>('/api/seller/shop/profile', withAuth(accessToken, {
    method: 'GET',
    cache: 'no-store'
  }));
}

export function updateSellerShopProfile(accessToken: string, payload: UpdateSellerShopProfileInput): Promise<SellerShopProfile> {
  return requestSellerApi<SellerShopProfile>('/api/seller/shop/profile', withAuth(accessToken, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }));
}
