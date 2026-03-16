import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, ILike, Repository } from 'typeorm';
import { ListOrdersDto, OrderSortBy, SortOrder } from '../dto/list-orders.dto';
import { OrderEntity } from '../entities/order.entity';

@Injectable()
export class OrderRepository {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly repository: Repository<OrderEntity>
  ) {}

  async save(order: Partial<OrderEntity>, manager?: EntityManager): Promise<OrderEntity> {
    const repo = manager ? manager.getRepository(OrderEntity) : this.repository;
    return repo.save(order);
  }

  async findById(orderId: string): Promise<OrderEntity | null> {
    return this.repository.findOne({
      where: { id: orderId },
      relations: {
        items: true
      }
    });
  }

  async findByIdForUpdate(orderId: string, manager: EntityManager): Promise<OrderEntity | null> {
    return manager.getRepository(OrderEntity).findOne({
      where: { id: orderId },
      lock: {
        mode: 'pessimistic_write'
      }
    });
  }

  async list(query: ListOrdersDto, userId?: string): Promise<{ items: OrderEntity[]; totalItems: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy ?? OrderSortBy.CREATED_AT;
    const sortOrder = query.sortOrder ?? SortOrder.DESC;

    const where: FindOptionsWhere<OrderEntity> = {};

    if (query.status) {
      where.status = query.status;
    }

    if (userId) {
      where.userId = userId;
    } else if (query.userId) {
      where.userId = query.userId;
    }

    if (query.search) {
      where.orderNumber = ILike(`%${query.search.trim()}%`);
    }

    const [items, totalItems] = await this.repository.findAndCount({
      where,
      relations: {
        items: true
      },
      order: {
        [mapSortField(sortBy)]: sortOrder
      },
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    return {
      items,
      totalItems
    };
  }
}

function mapSortField(sortBy: OrderSortBy): keyof OrderEntity {
  if (sortBy === OrderSortBy.TOTAL_AMOUNT) {
    return 'totalAmount';
  }

  if (sortBy === OrderSortBy.ORDER_NUMBER) {
    return 'orderNumber';
  }

  return 'createdAt';
}
