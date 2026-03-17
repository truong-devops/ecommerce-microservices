import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { ListPaymentsDto, PaymentSortBy, SortOrder } from '../dto/list-payments.dto';
import { PaymentEntity } from '../entities/payment.entity';

@Injectable()
export class PaymentRepository {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly repository: Repository<PaymentEntity>
  ) {}

  async save(payment: Partial<PaymentEntity>, manager?: EntityManager): Promise<PaymentEntity> {
    const repo = manager ? manager.getRepository(PaymentEntity) : this.repository;
    return repo.save(payment);
  }

  async findById(paymentId: string): Promise<PaymentEntity | null> {
    return this.repository.findOne({
      where: { id: paymentId },
      relations: {
        refunds: true
      }
    });
  }

  async findByIdForUpdate(paymentId: string, manager: EntityManager): Promise<PaymentEntity | null> {
    return manager.getRepository(PaymentEntity).findOne({
      where: { id: paymentId },
      lock: {
        mode: 'pessimistic_write'
      }
    });
  }

  async findByOrderId(orderId: string, manager?: EntityManager): Promise<PaymentEntity | null> {
    const repo = manager ? manager.getRepository(PaymentEntity) : this.repository;
    return repo.findOne({ where: { orderId } });
  }

  async findByProviderPaymentId(providerPaymentId: string, manager?: EntityManager): Promise<PaymentEntity | null> {
    const repo = manager ? manager.getRepository(PaymentEntity) : this.repository;
    return repo.findOne({ where: { providerPaymentId } });
  }

  async list(query: ListPaymentsDto, forcedUserId?: string): Promise<{ items: PaymentEntity[]; totalItems: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy ?? PaymentSortBy.CREATED_AT;
    const sortOrder = query.sortOrder ?? SortOrder.DESC;

    const qb = this.repository.createQueryBuilder('payment');
    this.applyFilters(qb, query, forcedUserId);

    const orderByMap: Record<PaymentSortBy, string> = {
      [PaymentSortBy.CREATED_AT]: 'payment.created_at',
      [PaymentSortBy.AMOUNT]: 'payment.amount',
      [PaymentSortBy.STATUS]: 'payment.status'
    };

    qb.orderBy(orderByMap[sortBy], sortOrder).skip((page - 1) * pageSize).take(pageSize);

    const [items, totalItems] = await qb.getManyAndCount();

    return { items, totalItems };
  }

  private applyFilters(qb: SelectQueryBuilder<PaymentEntity>, query: ListPaymentsDto, forcedUserId?: string): void {
    qb.where('1=1');

    if (query.status) {
      qb.andWhere('payment.status = :status', { status: query.status });
    }

    if (query.orderId) {
      qb.andWhere('payment.order_id = :orderId', { orderId: query.orderId });
    }

    if (query.provider) {
      qb.andWhere('payment.provider = :provider', { provider: query.provider });
    }

    if (forcedUserId) {
      qb.andWhere('payment.user_id = :userId', { userId: forcedUserId });
    } else if (query.userId) {
      qb.andWhere('payment.user_id = :userId', { userId: query.userId });
    }

    if (query.sellerId) {
      qb.andWhere('payment.seller_id = :sellerId', { sellerId: query.sellerId });
    }

    if (query.search) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere(
        `(
          CAST(payment.order_id AS text) ILIKE :search
          OR CAST(payment.id AS text) ILIKE :search
          OR payment.provider_payment_id ILIKE :search
        )`,
        { search }
      );
    }
  }
}
