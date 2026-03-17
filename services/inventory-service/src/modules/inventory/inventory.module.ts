import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './controllers/inventory.controller';
import { InventoryItemEntity } from './entities/inventory-item.entity';
import { InventoryMovementEntity } from './entities/inventory-movement.entity';
import { InventoryReservationEntity } from './entities/inventory-reservation.entity';
import { OutboxEventEntity } from './entities/outbox-event.entity';
import { InventoryItemRepository } from './repositories/inventory-item.repository';
import { InventoryMovementRepository } from './repositories/inventory-movement.repository';
import { InventoryReservationRepository } from './repositories/inventory-reservation.repository';
import { OutboxEventRepository } from './repositories/outbox-event.repository';
import { EventsPublisherService } from './services/events-publisher.service';
import { InventoryEventsConsumerService } from './services/inventory-events-consumer.service';
import { InventoryService } from './services/inventory.service';
import { OutboxDispatcherService } from './services/outbox-dispatcher.service';
import { ReservationExpirerService } from './services/reservation-expirer.service';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryItemEntity, InventoryReservationEntity, InventoryMovementEntity, OutboxEventEntity])],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryItemRepository,
    InventoryReservationRepository,
    InventoryMovementRepository,
    OutboxEventRepository,
    EventsPublisherService,
    OutboxDispatcherService,
    ReservationExpirerService,
    InventoryEventsConsumerService
  ],
  exports: [InventoryService]
})
export class InventoryModule {}
