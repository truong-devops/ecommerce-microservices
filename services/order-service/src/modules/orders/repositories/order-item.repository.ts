import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OrderItemEntity } from '../entities/order-item.entity';

@Injectable()
export class OrderItemRepository {
  constructor(
    @InjectRepository(OrderItemEntity)
    private readonly repository: Repository<OrderItemEntity>
  ) {}

  async saveMany(items: Partial<OrderItemEntity>[], manager?: EntityManager): Promise<OrderItemEntity[]> {
    const repo = manager ? manager.getRepository(OrderItemEntity) : this.repository;
    return repo.save(items);
  }
}
