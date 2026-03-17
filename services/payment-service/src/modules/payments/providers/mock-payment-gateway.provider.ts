import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PaymentStatus } from '../entities/payment-status.enum';
import { RefundStatus } from '../entities/refund-status.enum';
import {
  CreatePaymentIntentInput,
  CreatePaymentIntentOutput,
  CreateRefundInput,
  CreateRefundOutput,
  ParseWebhookInput,
  ParseWebhookOutput,
  PaymentGatewayProvider
} from './payment-gateway-provider.interface';

const MOCK_VALID_SIGNATURE = 'valid-mock-signature';

@Injectable()
export class MockPaymentGatewayProvider implements PaymentGatewayProvider {
  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<CreatePaymentIntentOutput> {
    const status = this.resolveStatus(input);

    return {
      providerPaymentId: `mock_pay_${randomUUID()}`,
      gatewayTransactionId: `mock_txn_${randomUUID()}`,
      status,
      requiresActionUrl:
        status === PaymentStatus.REQUIRES_ACTION
          ? `https://mock-gateway.local/3ds/${randomUUID()}`
          : undefined,
      rawPayload: {
        source: 'mock-gateway',
        status,
        orderId: input.orderId
      }
    };
  }

  async parseWebhook(input: ParseWebhookInput): Promise<ParseWebhookOutput> {
    if (input.signature && input.signature !== MOCK_VALID_SIGNATURE) {
      return {
        isValid: false,
        reason: 'Invalid mock signature',
        status: input.status
      };
    }

    return {
      isValid: true,
      status: input.status,
      gatewayTransactionId: input.gatewayTransactionId,
      amount: input.amount,
      currency: input.currency,
      rawPayload: {
        source: 'mock-gateway-webhook',
        providerEventId: input.providerEventId,
        status: input.status,
        ...(input.rawPayload ?? {})
      }
    };
  }

  async createRefund(input: CreateRefundInput): Promise<CreateRefundOutput> {
    return {
      providerRefundId: `mock_ref_${randomUUID()}`,
      gatewayTransactionId: `mock_ref_txn_${randomUUID()}`,
      status: RefundStatus.SUCCEEDED,
      rawPayload: {
        source: 'mock-gateway-refund',
        paymentId: input.paymentId,
        amount: input.amount,
        reason: input.reason ?? null
      }
    };
  }

  private resolveStatus(input: CreatePaymentIntentInput): PaymentStatus {
    if (input.simulatedStatus) {
      return input.simulatedStatus;
    }

    if (input.autoCapture) {
      return PaymentStatus.CAPTURED;
    }

    return PaymentStatus.AUTHORIZED;
  }
}
