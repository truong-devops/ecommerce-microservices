import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ShipmentTrackingEventEntity } from '../entities/shipment-tracking-event.entity';

@Injectable()
export class ShipmentTrackingEventRepository {
  constructor(
    @InjectRepository(ShipmentTrackingEventEntity)
    private readonly repository: Repository<ShipmentTrackingEventEntity>
  ) {}

  async save(event: Partial<ShipmentTrackingEventEntity>, manager?: EntityManager): Promise<ShipmentTrackingEventEntity> {
    const repo = manager ? manager.getRepository(ShipmentTrackingEventEntity) : this.repository;
    return repo.save(event);
  }

  async listByShipmentId(shipmentId: string): Promise<ShipmentTrackingEventEntity[]> {
    return this.repository.find({
      where: { shipmentId },
      order: { occurredAt: 'DESC' }
    });
  }
}
