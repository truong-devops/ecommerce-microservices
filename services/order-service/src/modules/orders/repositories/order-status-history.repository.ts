import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OrderStatusHistoryEntity } from '../entities/order-status-history.entity';

@Injectable()
export class OrderStatusHistoryRepository {
  constructor(
    @InjectRepository(OrderStatusHistoryEntity)
    private readonly repository: Repository<OrderStatusHistoryEntity>
  ) {}

  async save(history: Partial<OrderStatusHistoryEntity>, manager?: EntityManager): Promise<OrderStatusHistoryEntity> {
    const repo = manager ? manager.getRepository(OrderStatusHistoryEntity) : this.repository;
    return repo.save(history);
  }

  async listByOrderId(orderId: string): Promise<OrderStatusHistoryEntity[]> {
    return this.repository.find({
      where: { orderId },
      order: { createdAt: 'ASC' }
    });
  }
}
