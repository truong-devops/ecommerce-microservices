import { requestSellerApi } from './client';
import type { SellerShopDecor, UpdateSellerShopDecorInput } from './types';

function withAuth(accessToken: string, init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {})
    }
  };
}

export function getSellerShopDecor(accessToken: string): Promise<SellerShopDecor> {
  return requestSellerApi<SellerShopDecor>('/api/seller/shop/decor', withAuth(accessToken, {
    method: 'GET',
    cache: 'no-store'
  }));
}

export function updateSellerShopDecor(accessToken: string, payload: UpdateSellerShopDecorInput): Promise<SellerShopDecor> {
  return requestSellerApi<SellerShopDecor>('/api/seller/shop/decor', withAuth(accessToken, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }));
}
