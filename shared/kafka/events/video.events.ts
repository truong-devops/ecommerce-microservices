export type VideoEventType =
  | 'video.created'
  | 'video.submitted'
  | 'video.published'
  | 'video.hidden'
  | 'video.rejected'
  | 'video.view_started'
  | 'video.view_qualified'
  | 'video.product_clicked'
  | 'video.add_to_cart';

export interface VideoEventActor {
  userId?: string | null;
  role?: string | null;
  anonymousSessionId?: string | null;
}

export interface VideoEventVideoRef {
  videoId: string;
  sellerId: string;
}

export interface VideoEventProductRef {
  productId?: string | null;
  sku?: string | null;
}

export interface VideoEventPayload {
  eventId: string;
  eventType: VideoEventType;
  occurredAt: string;
  requestId?: string | null;
  actor?: VideoEventActor;
  video: VideoEventVideoRef;
  product?: VideoEventProductRef;
  context?: {
    source?: string | null;
    watchTimeSec?: number | null;
    clientEventId?: string | null;
  };
}
