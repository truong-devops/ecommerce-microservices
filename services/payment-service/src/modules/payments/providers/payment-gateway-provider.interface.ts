import { PaymentStatus } from '../entities/payment-status.enum';
import { RefundStatus } from '../entities/refund-status.enum';

export const PAYMENT_GATEWAY_PROVIDER = 'PAYMENT_GATEWAY_PROVIDER';

export interface CreatePaymentIntentInput {
  orderId: string;
  amount: number;
  currency: string;
  provider: string;
  autoCapture: boolean;
  simulatedStatus?: PaymentStatus;
  metadata?: Record<string, unknown>;
}

export interface CreatePaymentIntentOutput {
  providerPaymentId: string;
  gatewayTransactionId: string;
  status: PaymentStatus;
  requiresActionUrl?: string;
  rawPayload?: Record<string, unknown>;
}

export interface ParseWebhookInput {
  provider: string;
  providerEventId: string;
  status: PaymentStatus;
  signature?: string;
  amount?: number;
  currency?: string;
  paymentId?: string;
  orderId?: string;
  gatewayTransactionId?: string;
  providerPaymentId?: string;
  metadata?: Record<string, unknown>;
  rawPayload?: Record<string, unknown>;
}

export interface ParseWebhookOutput {
  isValid: boolean;
  reason?: string;
  status: PaymentStatus;
  gatewayTransactionId?: string;
  amount?: number;
  currency?: string;
  rawPayload?: Record<string, unknown>;
}

export interface CreateRefundInput {
  paymentId: string;
  amount: number;
  currency: string;
  reason?: string;
}

export interface CreateRefundOutput {
  providerRefundId: string;
  gatewayTransactionId: string;
  status: RefundStatus;
  rawPayload?: Record<string, unknown>;
}

export interface PaymentGatewayProvider {
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<CreatePaymentIntentOutput>;
  parseWebhook(input: ParseWebhookInput): Promise<ParseWebhookOutput>;
  createRefund(input: CreateRefundInput): Promise<CreateRefundOutput>;
}
