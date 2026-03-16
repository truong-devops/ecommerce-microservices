import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThanOrEqual, Repository } from 'typeorm';
import { OutboxEventEntity } from '../entities/outbox-event.entity';
import { OutboxStatus } from '../entities/outbox-status.enum';

@Injectable()
export class OutboxEventRepository {
  constructor(
    @InjectRepository(OutboxEventEntity)
    private readonly repository: Repository<OutboxEventEntity>
  ) {}

  async save(event: Partial<OutboxEventEntity>, manager?: EntityManager): Promise<OutboxEventEntity> {
    const repo = manager ? manager.getRepository(OutboxEventEntity) : this.repository;
    return repo.save(event);
  }

  async findDispatchable(batchSize: number): Promise<OutboxEventEntity[]> {
    return this.repository.find({
      where: [
        {
          status: OutboxStatus.PENDING
        },
        {
          status: OutboxStatus.FAILED,
          nextRetryAt: LessThanOrEqual(new Date())
        }
      ],
      order: {
        createdAt: 'ASC'
      },
      take: batchSize
    });
  }

  async markPublished(id: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(OutboxEventEntity) : this.repository;
    await repo.update(
      { id },
      {
        status: OutboxStatus.PUBLISHED,
        publishedAt: new Date(),
        nextRetryAt: null
      }
    );
  }

  async markFailed(id: string, retryCount: number, nextRetryAt: Date | null, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(OutboxEventEntity) : this.repository;
    await repo.update(
      { id },
      {
        status: OutboxStatus.FAILED,
        retryCount,
        nextRetryAt
      }
    );
  }
}
