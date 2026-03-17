export interface InventoryEventMetadata {
  requestId: string;
  occurredAt: string;
  actorId: string;
  actorRole: string;
}

export interface InventoryReservationLine {
  sku: string;
  quantity: number;
}

export interface InventoryReservedEvent {
  orderId: string;
  status: 'ACTIVE';
  expiresAt: string;
  items: InventoryReservationLine[];
  reason: string | null;
  metadata: InventoryEventMetadata;
}

export interface InventoryReleasedEvent {
  orderId: string;
  status: 'RELEASED';
  expiresAt: string | null;
  items: InventoryReservationLine[];
  reason: string | null;
  metadata: InventoryEventMetadata;
}

export interface InventoryConfirmedEvent {
  orderId: string;
  status: 'CONFIRMED';
  expiresAt: string | null;
  items: InventoryReservationLine[];
  reason: string | null;
  metadata: InventoryEventMetadata;
}

export interface InventoryExpiredEvent {
  orderId: string;
  status: 'EXPIRED';
  expiresAt: string | null;
  items: InventoryReservationLine[];
  reason: string | null;
  metadata: InventoryEventMetadata;
}

export interface InventoryAdjustedEvent {
  sku: string;
  productId: string;
  sellerId: string;
  deltaOnHand: number;
  onHand: number;
  reserved: number;
  available: number;
  reason: string | null;
  metadata: InventoryEventMetadata;
}
