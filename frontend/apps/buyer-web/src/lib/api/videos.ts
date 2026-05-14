import { requestBuyerApi } from './client';
import type { BuyerVideoFeedOutput, TrackBuyerVideoEventInput } from './types';

interface ListBuyerVideosInput {
  page?: number;
  pageSize?: number;
  productId?: string;
  sellerId?: string;
}

export function listBuyerVideos(input: ListBuyerVideosInput = {}): Promise<BuyerVideoFeedOutput> {
  const params = new URLSearchParams();
  params.set('page', String(input.page ?? 1));
  params.set('pageSize', String(input.pageSize ?? 12));

  if (input.productId?.trim()) {
    params.set('productId', input.productId.trim());
  }

  if (input.sellerId?.trim()) {
    params.set('sellerId', input.sellerId.trim());
  }

  return requestBuyerApi<BuyerVideoFeedOutput>(`/api/buyer/videos?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store'
  });
}

export function trackBuyerVideoEvent(
  videoId: string,
  eventType: 'view-started' | 'view-qualified' | 'product-clicked' | 'add-to-cart',
  payload: TrackBuyerVideoEventInput = {}
): Promise<{ accepted: true }> {
  return requestBuyerApi<{ accepted: true }>(`/api/buyer/videos/${encodeURIComponent(videoId)}/events/${eventType}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
