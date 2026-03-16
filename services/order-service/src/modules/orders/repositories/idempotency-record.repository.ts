import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { IdempotencyRecordEntity } from '../entities/idempotency-record.entity';

@Injectable()
export class IdempotencyRecordRepository {
  constructor(
    @InjectRepository(IdempotencyRecordEntity)
    private readonly repository: Repository<IdempotencyRecordEntity>
  ) {}

  async findByUserAndKey(userId: string, idempotencyKey: string): Promise<IdempotencyRecordEntity | null> {
    return this.repository.findOne({
      where: {
        userId,
        idempotencyKey
      }
    });
  }

  async save(record: Partial<IdempotencyRecordEntity>, manager?: EntityManager): Promise<IdempotencyRecordEntity> {
    const repo = manager ? manager.getRepository(IdempotencyRecordEntity) : this.repository;
    return repo.save(record);
  }
}
