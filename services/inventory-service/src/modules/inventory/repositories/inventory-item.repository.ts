import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { InventoryItemEntity } from '../entities/inventory-item.entity';

@Injectable()
export class InventoryItemRepository {
  constructor(
    @InjectRepository(InventoryItemEntity)
    private readonly repository: Repository<InventoryItemEntity>
  ) {}

  async findBySku(sku: string): Promise<InventoryItemEntity | null> {
    return this.repository.findOne({
      where: {
        sku
      }
    });
  }

  async findBySkuForUpdate(sku: string, manager: EntityManager): Promise<InventoryItemEntity | null> {
    return manager
      .getRepository(InventoryItemEntity)
      .createQueryBuilder('item')
      .where('item.sku = :sku', { sku })
      .setLock('pessimistic_write')
      .getOne();
  }

  async save(entity: InventoryItemEntity, manager?: EntityManager): Promise<InventoryItemEntity> {
    const repo = manager ? manager.getRepository(InventoryItemEntity) : this.repository;
    return repo.save(entity);
  }
}
