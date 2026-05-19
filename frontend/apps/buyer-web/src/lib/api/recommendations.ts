import { requestBuyerApi } from './client';
import type { CartRecommendationOutput, ProductRecommendationOutput } from './types';

export function fetchProductRecommendations(productId: string, limit = 6): Promise<ProductRecommendationOutput> {
  const query = new URLSearchParams();
  query.set('limit', String(limit));

  return requestBuyerApi<ProductRecommendationOutput>(
    `/api/buyer/recommendations/products/${encodeURIComponent(productId)}?${query.toString()}`,
    {
      method: 'GET',
      cache: 'no-store'
    }
  );
}

export function fetchCartRecommendations(input: {
  accessToken: string;
  productIds: string[];
  limit?: number;
}): Promise<CartRecommendationOutput> {
  return requestBuyerApi<CartRecommendationOutput>('/api/buyer/recommendations/cart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`
    },
    body: JSON.stringify({
      productIds: input.productIds,
      limit: input.limit ?? 6
    })
  });
}
