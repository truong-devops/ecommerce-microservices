export interface PaymentEventMetadata {
  requestId: string;
  occurredAt: string;
  actorId: string;
  actorRole: string;
}

export interface PaymentEventBase {
  paymentId: string;
  orderId: string;
  userId: string;
  sellerId: string | null;
  provider: string;
  providerPaymentId: string | null;
  status: string;
  amount: number;
  refundedAmount: number;
  currency: string;
  metadata: PaymentEventMetadata;
}

export interface PaymentCreatedEvent extends PaymentEventBase {}

export interface PaymentRequiresActionEvent extends PaymentEventBase {}

export interface PaymentAuthorizedEvent extends PaymentEventBase {}

export interface PaymentCapturedEvent extends PaymentEventBase {}

export interface PaymentFailedEvent extends PaymentEventBase {}

export interface PaymentCancelledEvent extends PaymentEventBase {}

export interface PaymentRefundedEvent extends PaymentEventBase {}

export interface PaymentPartiallyRefundedEvent extends PaymentEventBase {}

export interface PaymentChargebackEvent extends PaymentEventBase {}

export interface PaymentCompletedEvent {
  paymentId: string;
  orderId: string;
  status: string;
}
