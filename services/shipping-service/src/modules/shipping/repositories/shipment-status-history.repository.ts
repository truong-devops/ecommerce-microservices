import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ShipmentStatusHistoryEntity } from '../entities/shipment-status-history.entity';

@Injectable()
export class ShipmentStatusHistoryRepository {
  constructor(
    @InjectRepository(ShipmentStatusHistoryEntity)
    private readonly repository: Repository<ShipmentStatusHistoryEntity>
  ) {}

  async save(history: Partial<ShipmentStatusHistoryEntity>, manager?: EntityManager): Promise<ShipmentStatusHistoryEntity> {
    const repo = manager ? manager.getRepository(ShipmentStatusHistoryEntity) : this.repository;
    return repo.save(history);
  }
}
