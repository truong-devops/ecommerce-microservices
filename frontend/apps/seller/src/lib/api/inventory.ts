import { requestSellerApi } from './client';
import type { SellerInventoryStock, SetSellerInventoryStockInput } from './types';

export function getSellerInventoryStock(accessToken: string, sku: string): Promise<SellerInventoryStock> {
  return requestSellerApi<SellerInventoryStock>(`/api/seller/inventory/stocks/${encodeURIComponent(sku)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });
}

export function setSellerInventoryStock(
  accessToken: string,
  sku: string,
  payload: SetSellerInventoryStockInput
): Promise<SellerInventoryStock> {
  return requestSellerApi<SellerInventoryStock>(`/api/seller/inventory/stocks/${encodeURIComponent(sku)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

