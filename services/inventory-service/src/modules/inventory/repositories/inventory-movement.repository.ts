import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { InventoryMovementEntity } from '../entities/inventory-movement.entity';

@Injectable()
export class InventoryMovementRepository {
  constructor(
    @InjectRepository(InventoryMovementEntity)
    private readonly repository: Repository<InventoryMovementEntity>
  ) {}

  async saveMany(events: InventoryMovementEntity[], manager?: EntityManager): Promise<InventoryMovementEntity[]> {
    const repo = manager ? manager.getRepository(InventoryMovementEntity) : this.repository;
    return repo.save(events);
  }
}
