import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PaymentTransactionEntity } from '../entities/payment-transaction.entity';

@Injectable()
export class PaymentTransactionRepository {
  constructor(
    @InjectRepository(PaymentTransactionEntity)
    private readonly repository: Repository<PaymentTransactionEntity>
  ) {}

  async save(transaction: Partial<PaymentTransactionEntity>, manager?: EntityManager): Promise<PaymentTransactionEntity> {
    const repo = manager ? manager.getRepository(PaymentTransactionEntity) : this.repository;
    return repo.save(transaction);
  }

  async listByPaymentId(paymentId: string): Promise<PaymentTransactionEntity[]> {
    return this.repository.find({
      where: { paymentId },
      order: { createdAt: 'DESC' }
    });
  }

  async findByGatewayTransactionId(gatewayTransactionId: string, manager?: EntityManager): Promise<PaymentTransactionEntity | null> {
    const repo = manager ? manager.getRepository(PaymentTransactionEntity) : this.repository;
    return repo.findOne({
      where: {
        gatewayTransactionId
      }
    });
  }
}
