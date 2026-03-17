import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, MoreThan, Repository } from 'typeorm';
import { WebhookIdempotencyRecordEntity } from '../entities/webhook-idempotency-record.entity';

@Injectable()
export class WebhookIdempotencyRecordRepository {
  constructor(
    @InjectRepository(WebhookIdempotencyRecordEntity)
    private readonly repository: Repository<WebhookIdempotencyRecordEntity>
  ) {}

  async save(record: Partial<WebhookIdempotencyRecordEntity>, manager?: EntityManager): Promise<WebhookIdempotencyRecordEntity> {
    const repo = manager ? manager.getRepository(WebhookIdempotencyRecordEntity) : this.repository;
    return repo.save(record);
  }

  async findByProviderEvent(provider: string, providerEventId: string): Promise<WebhookIdempotencyRecordEntity | null> {
    return this.repository.findOne({
      where: {
        provider,
        providerEventId
      }
    });
  }

  async findUnexpired(provider: string, providerEventId: string): Promise<WebhookIdempotencyRecordEntity | null> {
    return this.repository.findOne({
      where: {
        provider,
        providerEventId,
        expiresAt: MoreThan(new Date())
      }
    });
  }
}
