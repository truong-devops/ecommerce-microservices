import { requestSellerApi } from './client';
import type { SellerRecommendationInsights } from './types';

export function fetchSellerRecommendationInsights(accessToken: string, limit = 10): Promise<SellerRecommendationInsights> {
  const query = new URLSearchParams();
  query.set('limit', String(limit));

  return requestSellerApi<SellerRecommendationInsights>(`/api/seller/recommendations/insights?${query.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}
