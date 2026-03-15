import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../entities/audit-log.entity';

interface CreateAuditLogInput {
  userId?: string;
  action: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogRepository {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repository: Repository<AuditLogEntity>
  ) {}

  async createAndSave(input: CreateAuditLogInput): Promise<AuditLogEntity> {
    const log = this.repository.create({
      userId: input.userId ?? null,
      action: input.action,
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata ?? null
    });

    return this.repository.save(log);
  }
}
