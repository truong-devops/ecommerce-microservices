import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PaymentStatusHistoryEntity } from '../entities/payment-status-history.entity';

@Injectable()
export class PaymentStatusHistoryRepository {
  constructor(
    @InjectRepository(PaymentStatusHistoryEntity)
    private readonly repository: Repository<PaymentStatusHistoryEntity>
  ) {}

  async save(history: Partial<PaymentStatusHistoryEntity>, manager?: EntityManager): Promise<PaymentStatusHistoryEntity> {
    const repo = manager ? manager.getRepository(PaymentStatusHistoryEntity) : this.repository;
    return repo.save(history);
  }

  async listByPaymentId(paymentId: string): Promise<PaymentStatusHistoryEntity[]> {
    return this.repository.find({
      where: { paymentId },
      order: { createdAt: 'DESC' }
    });
  }
}
