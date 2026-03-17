export interface ReviewEventMetadata {
  requestId: string;
  occurredAt: string;
  actorId: string;
  actorRole: string;
}

export interface ReviewCreatedEvent {
  reviewId: string;
  orderId: string;
  productId: string;
  sellerId: string;
  buyerId: string;
  rating: number;
  status: string;
  metadata: ReviewEventMetadata;
}

export interface ReviewUpdatedEvent {
  reviewId: string;
  orderId: string;
  productId: string;
  sellerId: string;
  buyerId: string;
  rating: number;
  status: string;
  metadata: ReviewEventMetadata;
}

export interface ReviewDeletedEvent {
  reviewId: string;
  orderId: string;
  productId: string;
  sellerId: string;
  buyerId: string;
  status: string;
  metadata: ReviewEventMetadata;
}

export interface ReviewModeratedEvent {
  reviewId: string;
  orderId: string;
  productId: string;
  sellerId: string;
  buyerId: string;
  status: string;
  moderationReason: string | null;
  metadata: ReviewEventMetadata;
}
