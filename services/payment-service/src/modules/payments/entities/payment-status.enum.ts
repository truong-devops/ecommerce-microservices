export enum PaymentStatus {
  PENDING = 'PENDING',
  REQUIRES_ACTION = 'REQUIRES_ACTION',
  AUTHORIZED = 'AUTHORIZED',
  CAPTURED = 'CAPTURED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  REFUNDED = 'REFUNDED',
  CHARGEBACK = 'CHARGEBACK'
}

export const PAYMENT_STATUS_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.PENDING]: [PaymentStatus.REQUIRES_ACTION, PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURED, PaymentStatus.FAILED, PaymentStatus.CANCELLED],
  [PaymentStatus.REQUIRES_ACTION]: [PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURED, PaymentStatus.FAILED, PaymentStatus.CANCELLED],
  [PaymentStatus.AUTHORIZED]: [PaymentStatus.CAPTURED, PaymentStatus.CANCELLED, PaymentStatus.FAILED, PaymentStatus.CHARGEBACK],
  [PaymentStatus.CAPTURED]: [PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED, PaymentStatus.CHARGEBACK],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.CANCELLED]: [],
  [PaymentStatus.PARTIALLY_REFUNDED]: [PaymentStatus.REFUNDED, PaymentStatus.CHARGEBACK],
  [PaymentStatus.REFUNDED]: [PaymentStatus.CHARGEBACK],
  [PaymentStatus.CHARGEBACK]: []
};
