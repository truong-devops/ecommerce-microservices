export interface CartEventMetadata {
  requestId: string;
  occurredAt: string;
  actorId: string;
  actorRole: string;
}

export interface CartItemEventPayload {
  cartId: string;
  userId: string;
  item: {
    id: string;
    productId: string;
    variantId: string | null;
    sku: string;
    name: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    sellerId: string;
  };
  metadata: CartEventMetadata;
}

export interface CartClearedEventPayload {
  cartId: string;
  userId: string;
  metadata: CartEventMetadata;
}
