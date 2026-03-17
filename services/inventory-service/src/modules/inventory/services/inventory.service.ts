import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { Role } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { AppException } from '../../../common/utils/app-exception.util';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { addMinutes } from '../../../common/utils/date.util';
import { AdjustStockDto, ReserveInventoryDto, ReserveInventoryItemDto, ValidateInventoryDto } from '../dto';
import { InventoryItemEntity } from '../entities/inventory-item.entity';
import { InventoryMovementEntity } from '../entities/inventory-movement.entity';
import { InventoryMovementType } from '../entities/inventory-movement-type.enum';
import { InventoryReservationEntity } from '../entities/inventory-reservation.entity';
import { InventoryReservationStatus } from '../entities/inventory-reservation-status.enum';
import { InventoryEventType } from '../events/inventory-event-type.enum';
import { InventoryItemRepository } from '../repositories/inventory-item.repository';
import { InventoryMovementRepository } from '../repositories/inventory-movement.repository';
import { InventoryReservationRepository } from '../repositories/inventory-reservation.repository';
import { OutboxEventRepository } from '../repositories/outbox-event.repository';

interface InventoryActor {
  userId: string;
  role: Role;
}

interface NormalizedReserveItem {
  sku: string;
  quantity: number;
}

const SYSTEM_ACTOR: InventoryActor = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: Role.SERVICE
};

@Injectable()
export class InventoryService {
  private readonly defaultTtlMinutes: number;
  private readonly expireBatchSize: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly inventoryItemRepository: InventoryItemRepository,
    private readonly inventoryReservationRepository: InventoryReservationRepository,
    private readonly inventoryMovementRepository: InventoryMovementRepository,
    private readonly outboxEventRepository: OutboxEventRepository,
    private readonly logger: AppLogger
  ) {
    this.defaultTtlMinutes = this.configService.get<number>('reservation.defaultTtlMinutes', 10);
    this.expireBatchSize = this.configService.get<number>('reservation.expireBatchSize', 200);
  }

  async validateStock(query: ValidateInventoryDto): Promise<Record<string, unknown>> {
    const sku = this.normalizeSku(query.sku);
    const requestedQuantity = query.quantity;

    const inventory = await this.inventoryItemRepository.findBySku(sku);
    const availableQuantity = inventory ? inventory.onHand - inventory.reserved : 0;

    return {
      sku,
      requestedQuantity,
      availableQuantity,
      isAvailable: availableQuantity >= requestedQuantity
    };
  }

  async getStockBySku(sku: string): Promise<Record<string, unknown>> {
    const normalizedSku = this.normalizeSku(sku);
    const inventory = await this.inventoryItemRepository.findBySku(normalizedSku);
    if (!inventory) {
      throw new AppException(HttpStatus.NOT_FOUND, {
        code: ErrorCode.INVENTORY_SKU_NOT_FOUND,
        message: `Inventory SKU not found: ${normalizedSku}`
      });
    }

    return this.toStockSnapshot(inventory);
  }

  async adjustStock(actor: AuthenticatedUserContext, requestId: string, sku: string, dto: AdjustStockDto): Promise<Record<string, unknown>> {
    const normalizedSku = this.normalizeSku(sku);

    return this.dataSource.transaction(async (manager) => {
      let inventory = await this.inventoryItemRepository.findBySkuForUpdate(normalizedSku, manager);
      const movement = new InventoryMovementEntity();

      if (!inventory) {
        if (dto.deltaOnHand <= 0) {
          throw new AppException(HttpStatus.NOT_FOUND, {
            code: ErrorCode.INVENTORY_SKU_NOT_FOUND,
            message: `Inventory SKU not found: ${normalizedSku}`
          });
        }

        if (!dto.productId || !dto.sellerId) {
          throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, {
            code: ErrorCode.INVENTORY_INVALID_ADJUSTMENT,
            message: 'productId and sellerId are required when creating stock'
          });
        }

        inventory = new InventoryItemEntity();
        inventory.sku = normalizedSku;
        inventory.productId = dto.productId;
        inventory.sellerId = dto.sellerId;
        inventory.onHand = dto.deltaOnHand;
        inventory.reserved = 0;
      } else {
        if (dto.expectedVersion !== undefined && dto.expectedVersion !== inventory.version) {
          throw new AppException(HttpStatus.CONFLICT, {
            code: ErrorCode.CONFLICT,
            message: `Version conflict for SKU ${normalizedSku}`
          });
        }

        const nextOnHand = inventory.onHand + dto.deltaOnHand;
        if (nextOnHand < 0 || nextOnHand - inventory.reserved < 0) {
          throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, {
            code: ErrorCode.INVENTORY_NEGATIVE_STOCK,
            message: `Stock adjustment causes negative available quantity for SKU ${normalizedSku}`
          });
        }

        inventory.onHand = nextOnHand;
        if (dto.productId) {
          inventory.productId = dto.productId;
        }
        if (dto.sellerId) {
          inventory.sellerId = dto.sellerId;
        }
      }

      inventory = await this.inventoryItemRepository.save(inventory, manager);

      movement.sku = inventory.sku;
      movement.orderId = null;
      movement.movementType = InventoryMovementType.ADJUST;
      movement.deltaOnHand = dto.deltaOnHand;
      movement.deltaReserved = 0;
      movement.reason = dto.reason ?? null;
      movement.actorId = actor.userId;
      movement.actorRole = actor.role;
      movement.requestId = requestId;

      await this.inventoryMovementRepository.saveMany([movement], manager);
      await this.outboxEventRepository.save(
        {
          aggregateType: 'inventory-item',
          aggregateId: inventory.id,
          eventType: InventoryEventType.INVENTORY_ADJUSTED,
          payload: {
            sku: inventory.sku,
            productId: inventory.productId,
            sellerId: inventory.sellerId,
            deltaOnHand: dto.deltaOnHand,
            onHand: inventory.onHand,
            reserved: inventory.reserved,
            available: inventory.onHand - inventory.reserved,
            reason: dto.reason ?? null,
            metadata: this.buildEventMetadata(requestId, actor)
          }
        },
        manager
      );

      return this.toStockSnapshot(inventory);
    });
  }

  async reserveInventory(actor: AuthenticatedUserContext, requestId: string, dto: ReserveInventoryDto): Promise<Record<string, unknown>> {
    const requestedItems = this.normalizeReserveItems(dto.items);
    const ttlMinutes = dto.ttlMinutes ?? this.defaultTtlMinutes;

    try {
      return await this.dataSource.transaction(async (manager) => {
        const existing = await this.inventoryReservationRepository.findActiveByOrderId(dto.orderId, manager, true);
        if (existing.length > 0) {
          if (this.isSameReservation(existing, requestedItems)) {
            return this.toReservationResponse(dto.orderId, existing, true);
          }

          throw new AppException(HttpStatus.CONFLICT, {
            code: ErrorCode.INVENTORY_RESERVATION_CONFLICT,
            message: `Active reservation conflict for order ${dto.orderId}`
          });
        }

        const inventoryBySku = new Map<string, InventoryItemEntity>();
        for (const item of requestedItems) {
          const inventory = await this.inventoryItemRepository.findBySkuForUpdate(item.sku, manager);
          if (!inventory) {
            throw new AppException(HttpStatus.NOT_FOUND, {
              code: ErrorCode.INVENTORY_SKU_NOT_FOUND,
              message: `Inventory SKU not found: ${item.sku}`
            });
          }

          const available = inventory.onHand - inventory.reserved;
          if (available < item.quantity) {
            throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, {
              code: ErrorCode.INVENTORY_INSUFFICIENT_STOCK,
              message: `Insufficient stock for SKU ${item.sku}`,
              details: {
                sku: item.sku,
                requestedQuantity: item.quantity,
                availableQuantity: available
              }
            });
          }

          inventoryBySku.set(item.sku, inventory);
        }

        const expiresAt = addMinutes(new Date(), ttlMinutes);
        const reservations: InventoryReservationEntity[] = [];
        const movements: InventoryMovementEntity[] = [];

        for (const item of requestedItems) {
          const inventory = inventoryBySku.get(item.sku)!;
          inventory.reserved += item.quantity;
          await this.inventoryItemRepository.save(inventory, manager);

          const reservation = new InventoryReservationEntity();
          reservation.orderId = dto.orderId;
          reservation.sku = item.sku;
          reservation.quantity = item.quantity;
          reservation.status = InventoryReservationStatus.ACTIVE;
          reservation.expiresAt = expiresAt;
          reservation.requestId = requestId;
          reservations.push(reservation);

          const movement = new InventoryMovementEntity();
          movement.sku = item.sku;
          movement.orderId = dto.orderId;
          movement.movementType = InventoryMovementType.RESERVE;
          movement.deltaOnHand = 0;
          movement.deltaReserved = item.quantity;
          movement.reason = dto.reason ?? null;
          movement.actorId = actor.userId;
          movement.actorRole = actor.role;
          movement.requestId = requestId;
          movements.push(movement);
        }

        const savedReservations = await this.inventoryReservationRepository.saveMany(reservations, manager);
        await this.inventoryMovementRepository.saveMany(movements, manager);
        await this.outboxEventRepository.save(
          {
            aggregateType: 'inventory-reservation',
            aggregateId: dto.orderId,
            eventType: InventoryEventType.INVENTORY_RESERVED,
            payload: this.buildReservationEventPayload(dto.orderId, InventoryReservationStatus.ACTIVE, savedReservations, actor, requestId, dto.reason)
          },
          manager
        );

        return this.toReservationResponse(dto.orderId, savedReservations, false);
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        return this.handleReservationUniqueConflict(dto.orderId, requestedItems);
      }

      throw error;
    }
  }

  async releaseReservations(
    actor: AuthenticatedUserContext,
    requestId: string,
    orderId: string,
    reason?: string
  ): Promise<Record<string, unknown>> {
    return this.settleReservations(actor, requestId, orderId, InventoryReservationStatus.RELEASED, InventoryEventType.INVENTORY_RELEASED, reason);
  }

  async confirmReservations(
    actor: AuthenticatedUserContext,
    requestId: string,
    orderId: string,
    reason?: string
  ): Promise<Record<string, unknown>> {
    return this.settleReservations(actor, requestId, orderId, InventoryReservationStatus.CONFIRMED, InventoryEventType.INVENTORY_CONFIRMED, reason);
  }

  async releaseReservationsFromOrderCancellation(orderId: string, requestId: string): Promise<Record<string, unknown>> {
    return this.settleReservations(
      SYSTEM_ACTOR,
      requestId,
      orderId,
      InventoryReservationStatus.RELEASED,
      InventoryEventType.INVENTORY_RELEASED,
      'Order cancelled event',
      true
    );
  }

  async expireActiveReservationsBatch(): Promise<void> {
    const expiredReservations = await this.inventoryReservationRepository.findExpiredActive(this.expireBatchSize);
    if (expiredReservations.length === 0) {
      return;
    }

    const orderIds = [...new Set(expiredReservations.map((item) => item.orderId))];
    for (const orderId of orderIds) {
      try {
        await this.settleReservations(
          SYSTEM_ACTOR,
          `expire-${orderId}-${Date.now()}`,
          orderId,
          InventoryReservationStatus.EXPIRED,
          InventoryEventType.INVENTORY_EXPIRED,
          'Reservation TTL expired',
          true
        );
      } catch (error) {
        this.logger.error(
          JSON.stringify({
            message: 'Failed to expire reservations',
            orderId,
            error: (error as Error).message
          }),
          undefined,
          'inventory-service'
        );
      }
    }
  }

  private async settleReservations(
    actor: InventoryActor,
    requestId: string,
    orderId: string,
    nextStatus: InventoryReservationStatus.RELEASED | InventoryReservationStatus.CONFIRMED | InventoryReservationStatus.EXPIRED,
    eventType: InventoryEventType,
    reason?: string,
    allowMissing = false
  ): Promise<Record<string, unknown>> {
    return this.dataSource.transaction(async (manager) => {
      const activeReservations = await this.inventoryReservationRepository.findActiveByOrderId(orderId, manager, true);
      if (activeReservations.length === 0) {
        if (allowMissing) {
          return {
            orderId,
            status: nextStatus,
            skipped: true,
            items: []
          };
        }

        throw new AppException(HttpStatus.NOT_FOUND, {
          code: ErrorCode.INVENTORY_RESERVATION_NOT_FOUND,
          message: `No active reservations found for order ${orderId}`
        });
      }

      const movementType = this.mapReservationStatusToMovementType(nextStatus);
      const movements: InventoryMovementEntity[] = [];

      for (const reservation of activeReservations) {
        const inventory = await this.inventoryItemRepository.findBySkuForUpdate(reservation.sku, manager);
        if (!inventory) {
          throw new AppException(HttpStatus.NOT_FOUND, {
            code: ErrorCode.INVENTORY_SKU_NOT_FOUND,
            message: `Inventory SKU not found: ${reservation.sku}`
          });
        }

        if (inventory.reserved < reservation.quantity) {
          throw new AppException(HttpStatus.CONFLICT, {
            code: ErrorCode.INVENTORY_NEGATIVE_STOCK,
            message: `Reserved quantity mismatch for SKU ${reservation.sku}`
          });
        }

        inventory.reserved -= reservation.quantity;
        if (nextStatus === InventoryReservationStatus.CONFIRMED) {
          inventory.onHand -= reservation.quantity;
        }

        if (inventory.onHand < 0 || inventory.onHand - inventory.reserved < 0) {
          throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, {
            code: ErrorCode.INVENTORY_NEGATIVE_STOCK,
            message: `Operation causes negative stock for SKU ${reservation.sku}`
          });
        }

        await this.inventoryItemRepository.save(inventory, manager);

        reservation.status = nextStatus;
        reservation.requestId = requestId;
        await this.inventoryReservationRepository.save(reservation, manager);

        const movement = new InventoryMovementEntity();
        movement.sku = reservation.sku;
        movement.orderId = reservation.orderId;
        movement.movementType = movementType;
        movement.deltaOnHand = nextStatus === InventoryReservationStatus.CONFIRMED ? -reservation.quantity : 0;
        movement.deltaReserved = -reservation.quantity;
        movement.reason = reason ?? null;
        movement.actorId = actor.userId;
        movement.actorRole = actor.role;
        movement.requestId = requestId;
        movements.push(movement);
      }

      await this.inventoryMovementRepository.saveMany(movements, manager);
      await this.outboxEventRepository.save(
        {
          aggregateType: 'inventory-reservation',
          aggregateId: orderId,
          eventType,
          payload: this.buildReservationEventPayload(orderId, nextStatus, activeReservations, actor, requestId, reason)
        },
        manager
      );

      return this.toReservationResponse(orderId, activeReservations, false, nextStatus);
    });
  }

  private async handleReservationUniqueConflict(orderId: string, requestedItems: NormalizedReserveItem[]): Promise<Record<string, unknown>> {
    const existing = await this.inventoryReservationRepository.findActiveByOrderId(orderId);
    if (existing.length > 0 && this.isSameReservation(existing, requestedItems)) {
      return this.toReservationResponse(orderId, existing, true);
    }

    throw new AppException(HttpStatus.CONFLICT, {
      code: ErrorCode.INVENTORY_RESERVATION_CONFLICT,
      message: `Active reservation conflict for order ${orderId}`
    });
  }

  private toStockSnapshot(item: InventoryItemEntity): Record<string, unknown> {
    return {
      id: item.id,
      sku: item.sku,
      productId: item.productId,
      sellerId: item.sellerId,
      onHand: item.onHand,
      reserved: item.reserved,
      available: item.onHand - item.reserved,
      version: item.version,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    };
  }

  private normalizeSku(sku: string): string {
    return sku.trim().toUpperCase();
  }

  private normalizeReserveItems(items: ReserveInventoryItemDto[]): NormalizedReserveItem[] {
    const map = new Map<string, number>();
    for (const item of items) {
      const sku = this.normalizeSku(item.sku);
      map.set(sku, (map.get(sku) ?? 0) + item.quantity);
    }

    return [...map.entries()]
      .map(([sku, quantity]) => ({
        sku,
        quantity
      }))
      .sort((a, b) => a.sku.localeCompare(b.sku));
  }

  private isSameReservation(existing: InventoryReservationEntity[], requestedItems: NormalizedReserveItem[]): boolean {
    if (existing.length !== requestedItems.length) {
      return false;
    }

    const existingMap = new Map(existing.map((item) => [item.sku, item.quantity]));
    return requestedItems.every((item) => existingMap.get(item.sku) === item.quantity);
  }

  private toReservationResponse(
    orderId: string,
    reservations: InventoryReservationEntity[],
    idempotent: boolean,
    overrideStatus?: InventoryReservationStatus
  ): Record<string, unknown> {
    const status = overrideStatus ?? reservations[0]?.status ?? InventoryReservationStatus.ACTIVE;
    const expiresAt = reservations[0]?.expiresAt;
    const items = reservations.map((item) => ({
      sku: item.sku,
      quantity: item.quantity
    }));

    return {
      orderId,
      status,
      idempotent,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      items
    };
  }

  private mapReservationStatusToMovementType(status: InventoryReservationStatus): InventoryMovementType {
    if (status === InventoryReservationStatus.RELEASED) {
      return InventoryMovementType.RELEASE;
    }
    if (status === InventoryReservationStatus.CONFIRMED) {
      return InventoryMovementType.CONFIRM;
    }
    return InventoryMovementType.EXPIRE;
  }

  private buildReservationEventPayload(
    orderId: string,
    status: InventoryReservationStatus,
    reservations: InventoryReservationEntity[],
    actor: InventoryActor,
    requestId: string,
    reason?: string
  ): Record<string, unknown> {
    return {
      orderId,
      status,
      expiresAt: reservations[0]?.expiresAt?.toISOString() ?? null,
      items: reservations.map((item) => ({
        sku: item.sku,
        quantity: item.quantity
      })),
      reason: reason ?? null,
      metadata: this.buildEventMetadata(requestId, actor)
    };
  }

  private buildEventMetadata(requestId: string, actor: InventoryActor): Record<string, unknown> {
    return {
      requestId,
      occurredAt: new Date().toISOString(),
      actorId: actor.userId,
      actorRole: actor.role
    };
  }
}
