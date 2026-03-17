export interface ProductEventMetadata {
  requestId: string;
  occurredAt: string;
  actorId: string;
  actorRole: string;
}

export interface ProductEventBase {
  id: string;
  sellerId: string;
  name: string;
  slug: string;
  categoryId: string;
  brand: string | null;
  status: string;
  minPrice: number;
  variants: Array<{
    sku: string;
    name: string;
    price: number;
    currency: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCreatedEvent extends ProductEventBase {
  metadata: ProductEventMetadata;
}

export interface ProductUpdatedEvent extends ProductEventBase {
  metadata: ProductEventMetadata;
}

export interface ProductStatusChangedEvent extends ProductEventBase {
  reason?: string | null;
  metadata: ProductEventMetadata;
}

export interface ProductDeletedEvent extends ProductEventBase {
  metadata: ProductEventMetadata;
}
