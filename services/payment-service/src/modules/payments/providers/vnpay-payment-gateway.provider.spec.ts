import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PaymentStatus } from '../entities/payment-status.enum';
import { VnpayPaymentGatewayProvider } from './vnpay-payment-gateway.provider';

describe('VnpayPaymentGatewayProvider', () => {
  const configValues: Record<string, string | boolean> = {
    'vnpay.tmnCode': 'TESTTMNCODE',
    'vnpay.hashSecret': 'TESTHASHSECRET',
    'vnpay.payUrl': 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    'vnpay.returnUrl': 'http://localhost:3000/payment/vnpay-return',
    'vnpay.ipnUrl': 'http://localhost:3006/api/v1/payments/webhooks/vnpay',
    'vnpay.locale': 'vn',
    'vnpay.orderType': 'other',
    'vnpay.refundSimulation': true
  };

  const configService = {
    get: jest.fn((key: string, defaultValue?: string | boolean) => configValues[key] ?? defaultValue)
  } as unknown as ConfigService;

  const provider = new VnpayPaymentGatewayProvider(configService);

  it('creates payment URL with secure hash', async () => {
    const result = await provider.createPaymentIntent({
      orderId: '44444444-4444-4444-8444-444444444444',
      amount: 100000,
      currency: 'VND',
      provider: 'vnpay',
      autoCapture: true
    });

    expect(result.status).toBe(PaymentStatus.REQUIRES_ACTION);
    expect(result.requiresActionUrl).toContain('vnp_SecureHash=');
    expect(result.rawPayload).toBeDefined();
  });

  it('validates signed webhook payload and maps success status', async () => {
    const payload: Record<string, string> = {
      vnp_Amount: '10000000',
      vnp_Command: 'pay',
      vnp_CurrCode: 'VND',
      vnp_OrderInfo: 'Thanh toan don hang 123',
      vnp_ResponseCode: '00',
      vnp_TransactionNo: '12345678',
      vnp_TransactionStatus: '00',
      vnp_TmnCode: 'TESTTMNCODE',
      vnp_TxnRef: 'txn-ref-1',
      vnp_Version: '2.1.0'
    };

    const serialized = Object.keys(payload)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(payload[key])}`)
      .join('&');

    const signature = createHmac('sha512', 'TESTHASHSECRET').update(serialized, 'utf8').digest('hex');

    const result = await provider.parseWebhook({
      provider: 'vnpay',
      providerEventId: 'event-1',
      status: PaymentStatus.CAPTURED,
      signature,
      rawPayload: payload
    });

    expect(result.isValid).toBe(true);
    expect(result.status).toBe(PaymentStatus.CAPTURED);
    expect(result.amount).toBe(100000);
    expect(result.gatewayTransactionId).toBe('12345678');
  });

  it('returns invalid when signature mismatch', async () => {
    const result = await provider.parseWebhook({
      provider: 'vnpay',
      providerEventId: 'event-2',
      status: PaymentStatus.CAPTURED,
      signature: 'invalid-signature',
      rawPayload: {
        vnp_ResponseCode: '00',
        vnp_Amount: '10000000'
      }
    });

    expect(result.isValid).toBe(false);
  });
});
