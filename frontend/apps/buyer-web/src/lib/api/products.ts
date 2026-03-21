import { requestBuyerApi } from './client';
import type { ProductDetail } from './types';

export function fetchProductDetail(productId: string): Promise<ProductDetail> {
  return requestBuyerApi<ProductDetail>(`/api/buyer/products/${encodeURIComponent(productId)}`, {
    method: 'GET',
    cache: 'no-store'
  });
}
