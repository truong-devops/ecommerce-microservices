import { AnalyticsEventNormalizerService } from './analytics-event-normalizer.service';

describe('AnalyticsEventNormalizerService', () => {
  const service = new AnalyticsEventNormalizerService();

  it('normalizes a valid Kafka payload', () => {
    const result = service.normalize(
      'payment.captured',
      JSON.stringify({
        eventType: 'payment.captured',
        payload: {
          paymentId: 'payment-1',
          orderId: 'order-1',
          sellerId: 'seller-1',
          userId: 'user-1',
          amount: 125.5,
          refundedAmount: 0,
          currency: 'USD',
          status: 'CAPTURED',
          metadata: {
            occurredAt: '2026-01-01T00:00:00.000Z'
          }
        }
      })
    );

    expect(result.record).not.toBeNull();
    expect(result.record?.eventType).toBe('payment.captured');
    expect(result.record?.paymentId).toBe('payment-1');
    expect(result.record?.sellerId).toBe('seller-1');
    expect(result.record?.amount).toBe(125.5);
  });

  it('returns reason when JSON is invalid', () => {
    const result = service.normalize('order.created', '{invalid json');

    expect(result.record).toBeNull();
    expect(result.reason).toBe('invalid-json');
  });

  it('falls back to message key when eventType is missing', () => {
    const result = service.normalize(
      'shipment.delivered',
      JSON.stringify({
        payload: {
          shipmentId: 'shipment-1',
          orderId: 'order-1',
          status: 'DELIVERED'
        }
      })
    );

    expect(result.record?.eventType).toBe('shipment.delivered');
    expect(result.record?.shipmentId).toBe('shipment-1');
  });
});
