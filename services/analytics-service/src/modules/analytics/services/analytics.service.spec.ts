import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '../../../common/constants/role.enum';
import { RedisService } from '../../../common/utils/redis.service';
import { AnalyticsRepository } from '../repositories/analytics.repository';
import { AnalyticsEventNormalizerService } from './analytics-event-normalizer.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  const analyticsRepository = {
    hasEventKey: jest.fn(),
    insertEvent: jest.fn(),
    queryOverview: jest.fn(),
    queryTimeseries: jest.fn(),
    queryPaymentsSummary: jest.fn(),
    queryShippingSummary: jest.fn()
  } as unknown as AnalyticsRepository;

  const analyticsEventNormalizerService = {
    normalize: jest.fn()
  } as unknown as AnalyticsEventNormalizerService;

  const redisService = {
    isEnabled: jest.fn(),
    setNxWithTtl: jest.fn(),
    deleteKey: jest.fn()
  } as unknown as RedisService;

  const configService = {
    get: jest.fn((key: string, defaultValue: unknown) => {
      if (key === 'ingest.dedupeTtlSeconds') {
        return 172800;
      }
      return defaultValue;
    })
  } as unknown as ConfigService;

  const service = new AnalyticsService(analyticsRepository, analyticsEventNormalizerService, redisService, configService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ingests message on happy path', async () => {
    (analyticsEventNormalizerService.normalize as jest.Mock).mockReturnValue({
      record: {
        eventKey: 'event-key-1',
        eventType: 'order.created',
        sourceService: 'order',
        occurredAt: '2026-01-01T00:00:00.000Z',
        sellerId: null,
        userId: 'user-1',
        orderId: 'order-1',
        paymentId: null,
        shipmentId: null,
        amount: 10,
        refundedAmount: 0,
        currency: 'USD',
        status: 'CREATED',
        payloadJson: '{}',
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    });
    (redisService.isEnabled as jest.Mock).mockReturnValue(false);
    (analyticsRepository.hasEventKey as jest.Mock).mockResolvedValue(false);

    const result = await service.ingestKafkaMessage('order.created', '{}');

    expect(result.ingested).toBe(true);
    expect(analyticsRepository.insertEvent).toHaveBeenCalledTimes(1);
  });

  it('skips duplicate event', async () => {
    (analyticsEventNormalizerService.normalize as jest.Mock).mockReturnValue({
      record: {
        eventKey: 'event-key-duplicate',
        eventType: 'order.created',
        sourceService: 'order',
        occurredAt: '2026-01-01T00:00:00.000Z',
        sellerId: null,
        userId: 'user-1',
        orderId: 'order-1',
        paymentId: null,
        shipmentId: null,
        amount: 10,
        refundedAmount: 0,
        currency: 'USD',
        status: 'CREATED',
        payloadJson: '{}',
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    });
    (redisService.isEnabled as jest.Mock).mockReturnValue(false);
    (analyticsRepository.hasEventKey as jest.Mock).mockResolvedValue(true);

    const result = await service.ingestKafkaMessage('order.created', '{}');

    expect(result.ingested).toBe(false);
    expect(result.duplicate).toBe(true);
    expect(analyticsRepository.insertEvent).not.toHaveBeenCalled();
  });

  it('forces seller scope for seller role', async () => {
    (analyticsRepository.queryOverview as jest.Mock).mockResolvedValue({
      totalEvents: 1,
      uniqueOrders: 1,
      uniquePayments: 0,
      uniqueShipments: 0,
      capturedAmount: 0,
      refundedAmount: 0
    });

    const result = await service.getOverview(
      {
        userId: '11111111-1111-4111-8111-111111111111',
        email: 'seller@example.com',
        role: Role.SELLER
      },
      {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
        sellerId: '22222222-2222-4222-8222-222222222222'
      }
    );

    expect(analyticsRepository.queryOverview).toHaveBeenCalledWith({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-02T00:00:00.000Z',
      sellerId: '11111111-1111-4111-8111-111111111111'
    });
    expect(result.sellerId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('throws bad request for invalid time range', async () => {
    await expect(
      service.getOverview(
        {
          userId: '11111111-1111-4111-8111-111111111111',
          email: 'admin@example.com',
          role: Role.ADMIN
        },
        {
          from: '2026-01-02T00:00:00.000Z',
          to: '2026-01-01T00:00:00.000Z'
        }
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('releases redis claim when insert fails after claim success', async () => {
    (analyticsEventNormalizerService.normalize as jest.Mock).mockReturnValue({
      record: {
        eventKey: 'event-key-rollback',
        eventType: 'payment.captured',
        sourceService: 'payment',
        occurredAt: '2026-01-01T00:00:00.000Z',
        sellerId: 'seller-1',
        userId: 'user-1',
        orderId: 'order-1',
        paymentId: 'payment-1',
        shipmentId: null,
        amount: 100,
        refundedAmount: 0,
        currency: 'USD',
        status: 'CAPTURED',
        payloadJson: '{}',
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    });
    (redisService.isEnabled as jest.Mock).mockReturnValue(true);
    (redisService.setNxWithTtl as jest.Mock).mockResolvedValue(true);
    (analyticsRepository.hasEventKey as jest.Mock).mockResolvedValue(false);
    (analyticsRepository.insertEvent as jest.Mock).mockRejectedValue(new Error('insert failed'));

    await expect(service.ingestKafkaMessage('payment.captured', '{}')).rejects.toThrow('insert failed');
    expect(redisService.deleteKey).toHaveBeenCalledWith('analytics:event:event-key-rollback');
  });
});
