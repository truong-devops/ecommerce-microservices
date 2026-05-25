import type { Order, ReviewItem, ReviewListOutput, ReviewSummary } from '@frontend/buyer-contracts';

import { requestBuyerApi } from './client';

export function fetchReviewSummary(productId: string): Promise<ReviewSummary> {
  return requestBuyerApi<ReviewSummary>(`/reviews/products/${encodeURIComponent(productId)}/summary`);
}

export function fetchProductReviews(productId: string): Promise<ReviewListOutput> {
  return requestBuyerApi<ReviewListOutput>(`/reviews?productId=${encodeURIComponent(productId)}&page=1&pageSize=3`);
}

export function assertReviewEligibility(order: Order, productId: string): void {
  if (order.status !== 'DELIVERED') {
    throw new Error('Chỉ có thể đánh giá sau khi đơn hàng đã giao');
  }
  if (!order.items.some((item) => item.productId === productId)) {
    throw new Error('Sản phẩm không nằm trong đơn hàng này');
  }
}

export function createReview(
  accessToken: string,
  input: { order: Order; productId: string; sellerId: string; rating: number; content: string }
): Promise<ReviewItem> {
  assertReviewEligibility(input.order, input.productId);
  return requestBuyerApi<ReviewItem>(
    '/reviews',
    {
      method: 'POST',
      body: JSON.stringify({
        orderId: input.order.id,
        productId: input.productId,
        sellerId: input.sellerId,
        rating: input.rating,
        content: input.content.trim()
      })
    },
    accessToken
  );
}
