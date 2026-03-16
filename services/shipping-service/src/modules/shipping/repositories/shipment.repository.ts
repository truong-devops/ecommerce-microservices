import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { ListShipmentsDto, ShipmentSortBy, SortOrder } from '../dto/list-shipments.dto';
import { ShipmentEntity } from '../entities/shipment.entity';

@Injectable()
export class ShipmentRepository {
  constructor(
    @InjectRepository(ShipmentEntity)
    private readonly repository: Repository<ShipmentEntity>
  ) {}

  async save(shipment: Partial<ShipmentEntity>, manager?: EntityManager): Promise<ShipmentEntity> {
    const repo = manager ? manager.getRepository(ShipmentEntity) : this.repository;
    return repo.save(shipment);
  }

  async findById(shipmentId: string): Promise<ShipmentEntity | null> {
    return this.repository.findOne({
      where: { id: shipmentId }
    });
  }

  async findByIdForUpdate(shipmentId: string, manager: EntityManager): Promise<ShipmentEntity | null> {
    return manager.getRepository(ShipmentEntity).findOne({
      where: { id: shipmentId },
      lock: {
        mode: 'pessimistic_write'
      }
    });
  }

  async findByOrderId(orderId: string, manager?: EntityManager): Promise<ShipmentEntity | null> {
    const repo = manager ? manager.getRepository(ShipmentEntity) : this.repository;
    return repo.findOne({ where: { orderId } });
  }

  async findByAwb(awb: string, manager?: EntityManager): Promise<ShipmentEntity | null> {
    const repo = manager ? manager.getRepository(ShipmentEntity) : this.repository;
    return repo.findOne({ where: { awb } });
  }

  async findByTrackingNumber(trackingNumber: string, manager?: EntityManager): Promise<ShipmentEntity | null> {
    const repo = manager ? manager.getRepository(ShipmentEntity) : this.repository;
    return repo.findOne({ where: { trackingNumber } });
  }

  async list(query: ListShipmentsDto, forcedBuyerId?: string): Promise<{ items: ShipmentEntity[]; totalItems: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy ?? ShipmentSortBy.CREATED_AT;
    const sortOrder = query.sortOrder ?? SortOrder.DESC;

    const qb = this.repository.createQueryBuilder('shipment');

    this.applyFilters(qb, query, forcedBuyerId);

    const orderByMap: Record<ShipmentSortBy, string> = {
      [ShipmentSortBy.CREATED_AT]: 'shipment.created_at',
      [ShipmentSortBy.SHIPPING_FEE]: 'shipment.shipping_fee',
      [ShipmentSortBy.STATUS]: 'shipment.status'
    };

    qb.orderBy(orderByMap[sortBy], sortOrder).skip((page - 1) * pageSize).take(pageSize);

    const [items, totalItems] = await qb.getManyAndCount();

    return { items, totalItems };
  }

  private applyFilters(qb: SelectQueryBuilder<ShipmentEntity>, query: ListShipmentsDto, forcedBuyerId?: string): void {
    qb.where('1=1');

    if (query.status) {
      qb.andWhere('shipment.status = :status', { status: query.status });
    }

    if (query.provider) {
      qb.andWhere('shipment.provider = :provider', { provider: query.provider });
    }

    if (query.orderId) {
      qb.andWhere('shipment.order_id = :orderId', { orderId: query.orderId });
    }

    if (forcedBuyerId) {
      qb.andWhere('shipment.buyer_id = :buyerId', { buyerId: forcedBuyerId });
    } else if (query.buyerId) {
      qb.andWhere('shipment.buyer_id = :buyerId', { buyerId: query.buyerId });
    }

    if (query.sellerId) {
      qb.andWhere('shipment.seller_id = :sellerId', { sellerId: query.sellerId });
    }

    if (query.search) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere(
        `(
          CAST(shipment.order_id AS text) ILIKE :search
          OR shipment.awb ILIKE :search
          OR shipment.tracking_number ILIKE :search
          OR shipment.recipient_name ILIKE :search
        )`,
        { search }
      );
    }
  }
}
