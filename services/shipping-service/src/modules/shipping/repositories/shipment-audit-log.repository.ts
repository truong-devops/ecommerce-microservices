import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ShipmentAuditLogEntity } from '../entities/shipment-audit-log.entity';

@Injectable()
export class ShipmentAuditLogRepository {
  constructor(
    @InjectRepository(ShipmentAuditLogEntity)
    private readonly repository: Repository<ShipmentAuditLogEntity>
  ) {}

  async save(auditLog: Partial<ShipmentAuditLogEntity>, manager?: EntityManager): Promise<ShipmentAuditLogEntity> {
    const repo = manager ? manager.getRepository(ShipmentAuditLogEntity) : this.repository;
    return repo.save(auditLog);
  }
}
