export interface OrderEventMetadata {
  requestId: string;
  occurredAt: string;
  actorId: string;
  actorRole: string;
}

export interface OrderCreatedEvent {
  orderId: string;
  orderNumber: string;
  userId: string;
  status: string;
  totalAmount: number;
  currency: string;
  metadata: OrderEventMetadata;
}

export interface OrderCancelledEvent {
  orderId: string;
  orderNumber: string;
  userId: string;
  status: string;
  totalAmount: number;
  currency: string;
  metadata: OrderEventMetadata;
}

export interface OrderStatusUpdatedEvent {
  orderId: string;
  orderNumber: string;
  userId: string;
  status: string;
  totalAmount: number;
  currency: string;
  metadata: OrderEventMetadata;
}

export interface OrderDeliveredEvent {
  orderId: string;
  orderNumber: string;
  userId: string;
  status: string;
  totalAmount: number;
  currency: string;
  metadata: OrderEventMetadata;
}
