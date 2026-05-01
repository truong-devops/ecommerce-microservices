import { requestBuyerApi } from './client';
import type { CreateReviewInput, ListReviewsInput, ReviewItem, ReviewListOutput, ReviewSummary } from './types';

function buildReviewQuery(params?: ListReviewsInput): string {
  if (!params) {
    return '';
  }

  const query = new URLSearchParams();

  if (typeof params.page === 'number') {
    query.set('page', String(params.page));
  }

  if (typeof params.pageSize === 'number') {
    query.set('pageSize', String(params.pageSize));
  }

  if (params.productId && params.productId.trim().length > 0) {
    query.set('productId', params.productId.trim());
  }

  if (typeof params.rating === 'number' && Number.isFinite(params.rating)) {
    query.set('rating', String(Math.floor(params.rating)));
  }

  if (params.search && params.search.trim().length > 0) {
    query.set('search', params.search.trim());
  }

  if (params.sortBy) {
    query.set('sortBy', params.sortBy);
  }

  if (params.sortOrder) {
    query.set('sortOrder', params.sortOrder);
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export function fetchReviewSummaryByProduct(productId: string): Promise<ReviewSummary> {
  return requestBuyerApi<ReviewSummary>(`/api/buyer/reviews/products/${encodeURIComponent(productId)}/summary`, {
    method: 'GET',
    cache: 'no-store'
  });
}

export function fetchReviewsByProduct(params: ListReviewsInput): Promise<ReviewListOutput> {
  return requestBuyerApi<ReviewListOutput>(`/api/buyer/reviews${buildReviewQuery(params)}`, {
    method: 'GET',
    cache: 'no-store'
  });
}

export function createBuyerReview(input: { accessToken: string; payload: CreateReviewInput }): Promise<ReviewItem> {
  return requestBuyerApi<ReviewItem>('/api/buyer/reviews', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`
    },
    body: JSON.stringify(input.payload)
  });
}
