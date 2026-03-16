import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OrderAuditLogEntity } from '../entities/order-audit-log.entity';

@Injectable()
export class OrderAuditLogRepository {
  constructor(
    @InjectRepository(OrderAuditLogEntity)
    private readonly repository: Repository<OrderAuditLogEntity>
  ) {}

  async save(log: Partial<OrderAuditLogEntity>, manager?: EntityManager): Promise<OrderAuditLogEntity> {
    const repo = manager ? manager.getRepository(OrderAuditLogEntity) : this.repository;
    return repo.save(log);
  }
}
