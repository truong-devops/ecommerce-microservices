import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { RefundEntity } from '../entities/refund.entity';
import { RefundStatus } from '../entities/refund-status.enum';

@Injectable()
export class RefundRepository {
  constructor(
    @InjectRepository(RefundEntity)
    private readonly repository: Repository<RefundEntity>
  ) {}

  async save(refund: Partial<RefundEntity>, manager?: EntityManager): Promise<RefundEntity> {
    const repo = manager ? manager.getRepository(RefundEntity) : this.repository;
    return repo.save(refund);
  }

  async listByPaymentId(paymentId: string): Promise<RefundEntity[]> {
    return this.repository.find({
      where: { paymentId },
      order: { createdAt: 'DESC' }
    });
  }

  async getSucceededTotalByPaymentId(paymentId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder('refund')
      .select('COALESCE(SUM(refund.amount), 0)', 'total')
      .where('refund.payment_id = :paymentId', { paymentId })
      .andWhere('refund.status = :status', { status: RefundStatus.SUCCEEDED })
      .getRawOne<{ total: string }>();

    return Number.parseFloat(result?.total ?? '0');
  }
}
