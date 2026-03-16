export interface ShipmentEventMetadata {
  requestId: string;
  occurredAt: string;
  actorId: string;
  actorRole: string;
}

export interface ShipmentCreatedEvent {
  shipmentId: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  provider: string;
  status: string;
  awb: string | null;
  trackingNumber: string | null;
  shippingFee: number;
  codAmount: number;
  currency: string;
  metadata: ShipmentEventMetadata;
}

export interface ShipmentStatusUpdatedEvent {
  shipmentId: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  provider: string;
  status: string;
  awb: string | null;
  trackingNumber: string | null;
  shippingFee: number;
  codAmount: number;
  currency: string;
  metadata: ShipmentEventMetadata;
}

export interface ShipmentDeliveredEvent extends ShipmentStatusUpdatedEvent {}

export interface ShipmentFailedEvent extends ShipmentStatusUpdatedEvent {}

export interface ShipmentCancelledEvent extends ShipmentStatusUpdatedEvent {}
