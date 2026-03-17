import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'crypto';
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

@Injectable()
export class VnpayPaymentGatewayProvider implements PaymentGatewayProvider {
  private readonly tmnCode: string;
  private readonly hashSecret: string;
  private readonly payUrl: string;
  private readonly returnUrl: string;
  private readonly ipnUrl: string;
  private readonly locale: string;
  private readonly orderType: string;
  private readonly refundSimulation: boolean;

  constructor(private readonly configService: ConfigService) {
    this.tmnCode = this.configService.get<string>('vnpay.tmnCode', '');
    this.hashSecret = this.configService.get<string>('vnpay.hashSecret', '');
    this.payUrl = this.configService.get<string>('vnpay.payUrl', 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html');
    this.returnUrl = this.configService.get<string>('vnpay.returnUrl', 'http://localhost:3000/payment/vnpay-return');
    this.ipnUrl = this.configService.get<string>('vnpay.ipnUrl', 'http://localhost:3006/api/v1/payments/webhooks/vnpay');
    this.locale = this.configService.get<string>('vnpay.locale', 'vn');
    this.orderType = this.configService.get<string>('vnpay.orderType', 'other');
    this.refundSimulation = this.configService.get<boolean>('vnpay.refundSimulation', true);
  }

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<CreatePaymentIntentOutput> {
    const providerPaymentId = this.generateTxnRef(input.orderId);
    const createdAt = this.formatDate(new Date());

    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.tmnCode || 'TESTTMNCODE',
      vnp_Amount: String(this.toGatewayAmount(input.amount)),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: providerPaymentId,
      vnp_OrderInfo: `Thanh toan don hang ${input.orderId}`,
      vnp_OrderType: this.orderType,
      vnp_Locale: this.locale,
      vnp_ReturnUrl: this.returnUrl,
      vnp_IpAddr: '127.0.0.1',
      vnp_CreateDate: createdAt,
      vnp_ExpireDate: this.formatDate(new Date(Date.now() + 15 * 60 * 1000))
    };

    if (this.ipnUrl) {
      params.vnp_IpnUrl = this.ipnUrl;
    }

    const paymentUrl = this.buildPaymentUrl(params);

    return {
      providerPaymentId,
      gatewayTransactionId: providerPaymentId,
      status: PaymentStatus.REQUIRES_ACTION,
      requiresActionUrl: paymentUrl,
      rawPayload: {
        source: 'vnpay',
        paymentUrl,
        params
      }
    };
  }

  async parseWebhook(input: ParseWebhookInput): Promise<ParseWebhookOutput> {
    const raw = this.normalizeRawPayload(input.rawPayload);
    const expectedSignature = input.signature ?? raw.vnp_SecureHash;

    if (!expectedSignature) {
      return {
        isValid: false,
        reason: 'Missing VNPAY signature',
        status: PaymentStatus.FAILED
      };
    }

    const paramsForSign = { ...raw };
    delete paramsForSign.vnp_SecureHash;
    delete paramsForSign.vnp_SecureHashType;

    const verified = this.verifySignature(paramsForSign, expectedSignature);
    if (!verified) {
      return {
        isValid: false,
        reason: 'Invalid VNPAY signature',
        status: PaymentStatus.FAILED
      };
    }

    const responseCode = raw.vnp_ResponseCode;
    const transactionStatus = raw.vnp_TransactionStatus;
    const isSuccess = responseCode === '00' && (!transactionStatus || transactionStatus === '00');

    const status = isSuccess ? PaymentStatus.CAPTURED : this.mapFailureStatus(responseCode);

    return {
      isValid: true,
      status,
      gatewayTransactionId: raw.vnp_TransactionNo ?? input.gatewayTransactionId,
      amount: raw.vnp_Amount ? this.fromGatewayAmount(raw.vnp_Amount) : input.amount,
      currency: raw.vnp_CurrCode ?? input.currency ?? 'VND',
      rawPayload: {
        source: 'vnpay-webhook',
        responseCode,
        transactionStatus,
        ...raw
      }
    };
  }

  async createRefund(input: CreateRefundInput): Promise<CreateRefundOutput> {
    if (!this.refundSimulation) {
      throw new Error('VNPAY refund API is not configured in this environment');
    }

    return {
      providerRefundId: `vnpay_ref_${randomUUID()}`,
      gatewayTransactionId: `vnpay_ref_txn_${randomUUID()}`,
      status: RefundStatus.SUCCEEDED,
      rawPayload: {
        source: 'vnpay-refund-simulated',
        paymentId: input.paymentId,
        amount: input.amount,
        currency: input.currency,
        reason: input.reason ?? null
      }
    };
  }

  private buildPaymentUrl(params: Record<string, string>): string {
    const serialized = this.serializeParams(params);
    const signature = this.sign(serialized);
    return `${this.payUrl}?${serialized}&vnp_SecureHash=${signature}`;
  }

  private verifySignature(params: Record<string, string>, signature: string): boolean {
    const serialized = this.serializeParams(params);
    const expected = this.sign(serialized);
    return expected.toLowerCase() === signature.toLowerCase();
  }

  private sign(serializedParams: string): string {
    const secret = this.hashSecret || 'TESTHASHSECRET';
    return createHmac('sha512', secret).update(serializedParams, 'utf8').digest('hex');
  }

  private serializeParams(params: Record<string, string>): string {
    const keys = Object.keys(params)
      .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
      .sort((a, b) => a.localeCompare(b));

    return keys.map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join('&');
  }

  private normalizeRawPayload(rawPayload?: Record<string, unknown>): Record<string, string> {
    if (!rawPayload) {
      return {};
    }

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawPayload)) {
      if (value === null || value === undefined) {
        continue;
      }
      normalized[key] = String(value);
    }

    return normalized;
  }

  private toGatewayAmount(amount: number): number {
    return Math.round((amount + Number.EPSILON) * 100);
  }

  private fromGatewayAmount(amount: string): number {
    return Number.parseInt(amount, 10) / 100;
  }

  private generateTxnRef(orderId: string): string {
    const compactOrder = orderId.replace(/-/g, '').slice(-12);
    return `${Date.now()}${compactOrder}`.slice(0, 32);
  }

  private formatDate(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  private mapFailureStatus(responseCode?: string): PaymentStatus {
    if (responseCode === '24') {
      return PaymentStatus.CANCELLED;
    }

    return PaymentStatus.FAILED;
  }
}
