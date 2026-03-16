import { ConflictException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { AppException } from '../../../common/utils/app-exception.util';
import { addSeconds } from '../../../common/utils/date.util';
import { RedisService } from '../../../common/utils/redis.service';
import { IdempotencyRecordEntity } from '../entities/idempotency-record.entity';
import { IdempotencyRecordRepository } from '../repositories/idempotency-record.repository';

interface AcquireResult {
  replay: boolean;
  requestHash: string;
  lockKey?: string;
  responseBody?: Record<string, unknown>;
}

@Injectable()
export class IdempotencyService {
  private readonly recordTtlMinutes: number;
  private readonly lockTtlSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly idempotencyRecordRepository: IdempotencyRecordRepository
  ) {
    this.recordTtlMinutes = this.configService.get<number>('idempotency.recordTtlMinutes', 60);
    this.lockTtlSeconds = this.configService.get<number>('idempotency.lockTtlSeconds', 30);
  }

  async acquireForCreateOrder(userId: string, idempotencyKey: string, requestBody: unknown): Promise<AcquireResult> {
    const requestHash = this.hash(requestBody);
    const existing = await this.idempotencyRecordRepository.findByUserAndKey(userId, idempotencyKey);

    if (existing) {
      return this.handleExisting(existing, requestHash);
    }

    const lockKey = `idem:lock:${userId}:${idempotencyKey}`;
    const lockOk = await this.redisService.setNxWithTtl(lockKey, randomUUID(), this.lockTtlSeconds);

    if (!lockOk) {
      throw new ConflictException({
        code: ErrorCode.IDEMPOTENCY_CONFLICT,
        message: 'Request with this idempotency key is in progress'
      });
    }

    try {
      await this.idempotencyRecordRepository.save({
        userId,
        idempotencyKey,
        requestHash,
        orderId: null,
        responseStatus: null,
        responseBody: null,
        expiresAt: addSeconds(new Date(), this.recordTtlMinutes * 60)
      });
    } catch {
      const concurrent = await this.idempotencyRecordRepository.findByUserAndKey(userId, idempotencyKey);
      if (concurrent) {
        await this.redisService.delete(lockKey);
        return this.handleExisting(concurrent, requestHash);
      }

      await this.redisService.delete(lockKey);
      throw new AppException(HttpStatus.INTERNAL_SERVER_ERROR, {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to create idempotency record'
      });
    }

    return {
      replay: false,
      requestHash,
      lockKey
    };
  }

  async persistResult(
    userId: string,
    idempotencyKey: string,
    requestHash: string,
    responseStatus: number,
    responseBody: Record<string, unknown>,
    orderId: string,
    manager: EntityManager
  ): Promise<void> {
    const existing = await this.idempotencyRecordRepository.findByUserAndKey(userId, idempotencyKey);

    if (!existing) {
      throw new AppException(HttpStatus.CONFLICT, {
        code: ErrorCode.IDEMPOTENCY_CONFLICT,
        message: 'Idempotency record not found'
      });
    }

    if (existing.requestHash !== requestHash) {
      throw new AppException(HttpStatus.CONFLICT, {
        code: ErrorCode.IDEMPOTENCY_CONFLICT,
        message: 'Idempotency key is already used with different payload'
      });
    }

    await this.idempotencyRecordRepository.save(
      {
        ...existing,
        responseStatus,
        responseBody,
        orderId,
        expiresAt: addSeconds(new Date(), this.recordTtlMinutes * 60)
      },
      manager
    );
  }

  async releaseLock(lockKey?: string): Promise<void> {
    if (!lockKey) {
      return;
    }

    await this.redisService.delete(lockKey);
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private handleExisting(existing: IdempotencyRecordEntity, requestHash: string): AcquireResult {
    if (existing.requestHash !== requestHash) {
      throw new ConflictException({
        code: ErrorCode.IDEMPOTENCY_CONFLICT,
        message: 'Idempotency key is already used with different payload'
      });
    }

    if (existing.responseBody) {
      return {
        replay: true,
        requestHash,
        responseBody: existing.responseBody
      };
    }

    throw new ConflictException({
      code: ErrorCode.IDEMPOTENCY_CONFLICT,
      message: 'Request with this idempotency key is in progress'
    });
  }
}
