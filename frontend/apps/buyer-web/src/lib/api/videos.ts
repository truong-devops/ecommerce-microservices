import { requestBuyerApi } from './client';
import type { BuyerVideoComment, BuyerVideoCommentsOutput, BuyerVideoFeedOutput, CreateBuyerVideoCommentInput, TrackBuyerVideoEventInput } from './types';

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

export function listBuyerVideoComments(videoId: string, input: { page?: number; pageSize?: number } = {}): Promise<BuyerVideoCommentsOutput> {
  const params = new URLSearchParams();
  params.set('page', String(input.page ?? 1));
  params.set('pageSize', String(input.pageSize ?? 20));

  return requestBuyerApi<BuyerVideoCommentsOutput>(`/api/buyer/videos/${encodeURIComponent(videoId)}/comments?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store'
  });
}

export function createBuyerVideoComment(
  videoId: string,
  payload: CreateBuyerVideoCommentInput,
  accessToken?: string | null
): Promise<BuyerVideoComment> {
  return requestBuyerApi<BuyerVideoComment>(`/api/buyer/videos/${encodeURIComponent(videoId)}/comments`, {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: JSON.stringify(payload)
  });
}
