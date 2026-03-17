import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PaymentAuditLogEntity } from '../entities/payment-audit-log.entity';

@Injectable()
export class PaymentAuditLogRepository {
  constructor(
    @InjectRepository(PaymentAuditLogEntity)
    private readonly repository: Repository<PaymentAuditLogEntity>
  ) {}

  async save(log: Partial<PaymentAuditLogEntity>, manager?: EntityManager): Promise<PaymentAuditLogEntity> {
    const repo = manager ? manager.getRepository(PaymentAuditLogEntity) : this.repository;
    return repo.save(log);
  }
}
