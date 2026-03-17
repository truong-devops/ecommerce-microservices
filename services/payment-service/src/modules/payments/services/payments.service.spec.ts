import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { Role } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { CreatePaymentIntentDto } from '../dto';
import { PaymentStatus } from '../entities/payment-status.enum';
import { RefundStatus } from '../entities/refund-status.enum';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const manager = {} as EntityManager;

  const dataSource = {
    transaction: jest.fn(async (cb: (entityManager: EntityManager) => Promise<unknown>) => cb(manager))
  } as unknown as DataSource;

  const paymentRepository = {
    findByOrderId: jest.fn(),
    save: jest.fn(),
    list: jest.fn(),
    findById: jest.fn(),
    findByIdForUpdate: jest.fn(),
    findByProviderPaymentId: jest.fn()
  };

  const paymentTransactionRepository = {
    save: jest.fn(),
    findByGatewayTransactionId: jest.fn()
  };

  const paymentStatusHistoryRepository = {
    save: jest.fn()
  };

  const paymentAuditLogRepository = {
    save: jest.fn()
  };

  const idempotencyRecordRepository = {
    save: jest.fn()
  };

  const webhookIdempotencyRecordRepository = {
    findUnexpired: jest.fn(),
    findByProviderEvent: jest.fn(),
    save: jest.fn()
  };

  const refundRepository = {
    save: jest.fn(),
    listByPaymentId: jest.fn(),
    getSucceededTotalByPaymentId: jest.fn()
  };

  const outboxEventRepository = {
    save: jest.fn()
  };

  const idempotencyService = {
    acquireForCreatePaymentIntent: jest.fn(),
    persistResult: jest.fn(),
    releaseLock: jest.fn()
  };

  const paymentGatewayProvider = {
    createPaymentIntent: jest.fn(),
    parseWebhook: jest.fn(),
    createRefund: jest.fn()
  };

  const configService = {
    get: jest.fn((key: string, defaultValue: number) => {
      if (key === 'webhookIdempotency.ttlMinutes') {
        return 1440;
      }
      return defaultValue;
    })
  } as unknown as ConfigService;

  const service = new PaymentsService(
    configService,
    dataSource,
    paymentRepository as never,
    paymentTransactionRepository as never,
    paymentStatusHistoryRepository as never,
    paymentAuditLogRepository as never,
    idempotencyRecordRepository as never,
    webhookIdempotencyRecordRepository as never,
    refundRepository as never,
    outboxEventRepository as never,
    idempotencyService as never,
    paymentGatewayProvider as never
  );

  const customerUser: AuthenticatedUserContext = {
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'buyer@example.com',
    role: Role.CUSTOMER
  };

  const adminUser: AuthenticatedUserContext = {
    userId: '22222222-2222-4222-8222-222222222222',
    email: 'admin@example.com',
    role: Role.ADMIN
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates payment intent on happy path', async () => {
    idempotencyService.acquireForCreatePaymentIntent.mockResolvedValue({
      replay: false,
      requestHash: 'hash-1',
      lockKey: 'lock-1'
    });
    paymentGatewayProvider.createPaymentIntent.mockResolvedValue({
      providerPaymentId: 'mock-pay-1',
      gatewayTransactionId: 'mock-txn-1',
      status: PaymentStatus.CAPTURED
    });
    paymentRepository.findByOrderId.mockResolvedValue(null);
    paymentRepository.save.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      orderId: '44444444-4444-4444-8444-444444444444',
      userId: customerUser.userId,
      sellerId: '33333333-3333-4333-8333-333333333333',
      provider: 'mock',
      providerPaymentId: 'mock-pay-1',
      status: PaymentStatus.CAPTURED,
      currency: 'USD',
      amount: 20,
      refundedAmount: 0,
      description: null,
      metadata: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    });

    const dto: CreatePaymentIntentDto = {
      orderId: '44444444-4444-4444-8444-444444444444',
      sellerId: '33333333-3333-4333-8333-333333333333',
      currency: 'USD',
      amount: 20
    };

    const response = await service.createPaymentIntent(customerUser, 'request-1', 'idem-key-1', dto);

    expect(response.id).toBe('55555555-5555-4555-8555-555555555555');
    expect(paymentRepository.save).toHaveBeenCalledTimes(1);
    expect(outboxEventRepository.save).toHaveBeenCalled();
    expect(idempotencyService.persistResult).toHaveBeenCalledTimes(1);
    expect(idempotencyService.releaseLock).toHaveBeenCalledWith('lock-1');
  });

  it('returns replay response when idempotency record exists', async () => {
    idempotencyService.acquireForCreatePaymentIntent.mockResolvedValue({
      replay: true,
      requestHash: 'hash-1',
      responseBody: {
        id: 'existing-payment-id'
      }
    });

    const response = await service.createPaymentIntent(customerUser, 'request-1', 'idem-key-1', {
      orderId: '44444444-4444-4444-8444-444444444444',
      currency: 'USD',
      amount: 20
    });

    expect(response.id).toBe('existing-payment-id');
    expect(paymentGatewayProvider.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('throws conflict when payment already exists for order', async () => {
    idempotencyService.acquireForCreatePaymentIntent.mockResolvedValue({
      replay: false,
      requestHash: 'hash-1',
      lockKey: 'lock-1'
    });
    paymentGatewayProvider.createPaymentIntent.mockResolvedValue({
      providerPaymentId: 'mock-pay-1',
      gatewayTransactionId: 'mock-txn-1',
      status: PaymentStatus.CAPTURED
    });
    paymentRepository.findByOrderId.mockResolvedValue({ id: 'existing-id' });

    await expect(
      service.createPaymentIntent(customerUser, 'request-1', 'idem-key-1', {
        orderId: '44444444-4444-4444-8444-444444444444',
        currency: 'USD',
        amount: 20
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws invalid transition when refunding payment in PENDING status', async () => {
    paymentRepository.findByIdForUpdate.mockResolvedValue({
      id: 'payment-id',
      status: PaymentStatus.PENDING,
      userId: customerUser.userId,
      amount: 20,
      refundedAmount: 0
    });

    await expect(service.createRefund(customerUser, 'request-1', 'payment-id', { amount: 10 })).rejects.toBeInstanceOf(
      UnprocessableEntityException
    );
  });

  it('throws forbidden when customer reads payment of another user', async () => {
    paymentRepository.findById.mockResolvedValue({
      id: 'payment-id',
      userId: '99999999-9999-4999-8999-999999999999',
      sellerId: null
    });

    await expect(service.getPaymentById(customerUser, 'payment-id')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates successful refund and updates payment status', async () => {
    paymentRepository.findByIdForUpdate.mockResolvedValue({
      id: 'payment-id',
      orderId: '44444444-4444-4444-8444-444444444444',
      userId: customerUser.userId,
      sellerId: null,
      provider: 'mock',
      providerPaymentId: 'mock-pay-1',
      status: PaymentStatus.CAPTURED,
      currency: 'USD',
      amount: 20,
      refundedAmount: 0,
      description: null,
      metadata: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    });

    paymentGatewayProvider.createRefund.mockResolvedValue({
      providerRefundId: 'ref-1',
      gatewayTransactionId: 'txn-ref-1',
      status: RefundStatus.SUCCEEDED
    });

    refundRepository.save.mockResolvedValue({
      id: 'refund-id',
      paymentId: 'payment-id',
      providerRefundId: 'ref-1',
      amount: 20,
      currency: 'USD',
      status: RefundStatus.SUCCEEDED,
      reason: null,
      metadata: null,
      requestedBy: adminUser.userId,
      requestedByRole: adminUser.role,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    });

    paymentRepository.save.mockResolvedValue({
      id: 'payment-id',
      orderId: '44444444-4444-4444-8444-444444444444',
      userId: customerUser.userId,
      sellerId: null,
      provider: 'mock',
      providerPaymentId: 'mock-pay-1',
      status: PaymentStatus.REFUNDED,
      currency: 'USD',
      amount: 20,
      refundedAmount: 20,
      description: null,
      metadata: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    });

    const result = await service.createRefund(adminUser, 'request-2', 'payment-id', { amount: 20 });

    expect((result.payment as Record<string, unknown>).status).toBe(PaymentStatus.REFUNDED);
    expect((result.refund as Record<string, unknown>).status).toBe(RefundStatus.SUCCEEDED);
  });
});
