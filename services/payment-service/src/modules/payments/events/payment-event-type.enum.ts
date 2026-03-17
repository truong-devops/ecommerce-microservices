export enum PaymentEventType {
  PAYMENT_CREATED = 'payment.created',
  PAYMENT_REQUIRES_ACTION = 'payment.requires-action',
  PAYMENT_AUTHORIZED = 'payment.authorized',
  PAYMENT_CAPTURED = 'payment.captured',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_CANCELLED = 'payment.cancelled',
  PAYMENT_REFUNDED = 'payment.refunded',
  PAYMENT_PARTIALLY_REFUNDED = 'payment.partially-refunded',
  PAYMENT_CHARGEBACK = 'payment.chargeback'
}
