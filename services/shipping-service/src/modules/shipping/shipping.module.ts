import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShippingController } from './controllers/shipping.controller';
import { OutboxEventEntity } from './entities/outbox-event.entity';
import { ShipmentAuditLogEntity } from './entities/shipment-audit-log.entity';
import { ShipmentEntity } from './entities/shipment.entity';
import { ShipmentStatusHistoryEntity } from './entities/shipment-status-history.entity';
import { ShipmentTrackingEventEntity } from './entities/shipment-tracking-event.entity';
import { WebhookIdempotencyRecordEntity } from './entities/webhook-idempotency-record.entity';
import { OutboxEventRepository } from './repositories/outbox-event.repository';
import { ShipmentAuditLogRepository } from './repositories/shipment-audit-log.repository';
import { ShipmentRepository } from './repositories/shipment.repository';
import { ShipmentStatusHistoryRepository } from './repositories/shipment-status-history.repository';
import { ShipmentTrackingEventRepository } from './repositories/shipment-tracking-event.repository';
import { WebhookIdempotencyRecordRepository } from './repositories/webhook-idempotency-record.repository';
import { AccessTokenStrategy } from './strategies/access-token.strategy';
import { EventsPublisherService } from './services/events-publisher.service';
import { OutboxDispatcherService } from './services/outbox-dispatcher.service';
import { ShippingService } from './services/shipping.service';

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: 'jwt-access'
    }),
    TypeOrmModule.forFeature([
      ShipmentEntity,
      ShipmentTrackingEventEntity,
      ShipmentStatusHistoryEntity,
      ShipmentAuditLogEntity,
      OutboxEventEntity,
      WebhookIdempotencyRecordEntity
    ])
  ],
  controllers: [ShippingController],
  providers: [
    AccessTokenStrategy,
    ShipmentRepository,
    ShipmentTrackingEventRepository,
    ShipmentStatusHistoryRepository,
    ShipmentAuditLogRepository,
    OutboxEventRepository,
    WebhookIdempotencyRecordRepository,
    EventsPublisherService,
    OutboxDispatcherService,
    ShippingService
  ]
})
export class ShippingModule {}
