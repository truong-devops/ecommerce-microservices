import { Role } from '../../../common/constants/role.enum';
import { PaymentStatus } from '../entities/payment-status.enum';

export interface PaymentEventMetadata {
  requestId: string;
  occurredAt: string;
  actorId: string;
  actorRole: Role;
}

export interface PaymentEventPayload {
  [key: string]: unknown;
  paymentId: string;
  orderId: string;
  userId: string;
  sellerId: string | null;
  provider: string;
  providerPaymentId: string | null;
  status: PaymentStatus;
  amount: number;
  refundedAmount: number;
  currency: string;
  metadata: PaymentEventMetadata;
}
