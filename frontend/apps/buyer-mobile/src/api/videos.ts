import type { BuyerVideo, BuyerVideoComment } from '@frontend/buyer-contracts';

import { requestBuyerApi } from './client';

export function fetchVideos(): Promise<BuyerVideo[]> {
  return requestBuyerApi<BuyerVideo[]>('/videos/feed?page=1&pageSize=12');
}

export function trackVideoEvent(
  videoId: string,
  eventType: 'view-started' | 'view-qualified' | 'product-clicked' | 'add-to-cart',
  payload: { productId?: string; clientEventId?: string; watchTimeSec?: number } = {}
): Promise<unknown> {
  return requestBuyerApi(`/videos/${encodeURIComponent(videoId)}/events/${eventType}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function fetchVideoComments(videoId: string): Promise<BuyerVideoComment[]> {
  return requestBuyerApi<BuyerVideoComment[]>(`/videos/${encodeURIComponent(videoId)}/comments?page=1&pageSize=30`);
}

export function createVideoComment(accessToken: string, videoId: string, text: string, clientCommentId: string): Promise<BuyerVideoComment> {
  return requestBuyerApi<BuyerVideoComment>(
    `/videos/${encodeURIComponent(videoId)}/comments`,
    { method: 'POST', body: JSON.stringify({ text, clientCommentId }) },
    accessToken
  );
}
