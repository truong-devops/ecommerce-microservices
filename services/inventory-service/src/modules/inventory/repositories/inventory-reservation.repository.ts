import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThanOrEqual, Repository } from 'typeorm';
import { InventoryReservationEntity } from '../entities/inventory-reservation.entity';
import { InventoryReservationStatus } from '../entities/inventory-reservation-status.enum';

@Injectable()
export class InventoryReservationRepository {
  constructor(
    @InjectRepository(InventoryReservationEntity)
    private readonly repository: Repository<InventoryReservationEntity>
  ) {}

  async findActiveByOrderId(orderId: string, manager?: EntityManager, lock = false): Promise<InventoryReservationEntity[]> {
    const repo = manager ? manager.getRepository(InventoryReservationEntity) : this.repository;
    const query = repo
      .createQueryBuilder('reservation')
      .where('reservation.order_id = :orderId', { orderId })
      .andWhere('reservation.status = :status', { status: InventoryReservationStatus.ACTIVE })
      .orderBy('reservation.sku', 'ASC');

    if (lock) {
      query.setLock('pessimistic_write');
    }

    return query.getMany();
  }

  async findExpiredActive(limit: number): Promise<InventoryReservationEntity[]> {
    return this.repository.find({
      where: {
        status: InventoryReservationStatus.ACTIVE,
        expiresAt: LessThanOrEqual(new Date())
      },
      order: {
        expiresAt: 'ASC'
      },
      take: limit
    });
  }

  async saveMany(items: InventoryReservationEntity[], manager?: EntityManager): Promise<InventoryReservationEntity[]> {
    const repo = manager ? manager.getRepository(InventoryReservationEntity) : this.repository;
    return repo.save(items);
  }

  async save(item: InventoryReservationEntity, manager?: EntityManager): Promise<InventoryReservationEntity> {
    const repo = manager ? manager.getRepository(InventoryReservationEntity) : this.repository;
    return repo.save(item);
  }
}
