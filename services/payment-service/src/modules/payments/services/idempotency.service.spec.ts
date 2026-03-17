import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  const redisService = {
    setNxWithTtl: jest.fn(),
    delete: jest.fn()
  };

  const idempotencyRecordRepository = {
    findByUserAndKey: jest.fn(),
    save: jest.fn()
  };

  const configService = {
    get: jest.fn((key: string, defaultValue: number) => {
      if (key === 'idempotency.recordTtlMinutes') return 60;
      if (key === 'idempotency.lockTtlSeconds') return 30;
      return defaultValue;
    })
  } as unknown as ConfigService;

  const service = new IdempotencyService(configService, redisService as never, idempotencyRecordRepository as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('acquires idempotency lock and creates record', async () => {
    idempotencyRecordRepository.findByUserAndKey.mockResolvedValue(null);
    redisService.setNxWithTtl.mockResolvedValue(true);
    idempotencyRecordRepository.save.mockResolvedValue({});

    const result = await service.acquireForCreatePaymentIntent('user-1', 'key-1', { amount: 10 });

    expect(result.replay).toBe(false);
    expect(result.lockKey).toBeDefined();
    expect(idempotencyRecordRepository.save).toHaveBeenCalledTimes(1);
  });

  it('throws conflict when same key is used with different payload', async () => {
    idempotencyRecordRepository.findByUserAndKey.mockResolvedValue({
      requestHash: 'existing-hash',
      responseBody: null
    });

    await expect(service.acquireForCreatePaymentIntent('user-1', 'key-1', { amount: 11 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('persists idempotency result', async () => {
    const manager = {} as EntityManager;
    idempotencyRecordRepository.findByUserAndKey.mockResolvedValue({
      userId: 'user-1',
      idempotencyKey: 'key-1',
      requestHash: 'hash-1'
    });
    idempotencyRecordRepository.save.mockResolvedValue({});

    await service.persistResult('user-1', 'key-1', 'hash-1', 201, { id: 'payment-1' }, 'payment-1', manager);

    expect(idempotencyRecordRepository.save).toHaveBeenCalledTimes(1);
  });
});
