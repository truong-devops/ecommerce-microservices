import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './controllers/orders.controller';
import { IdempotencyRecordEntity } from './entities/idempotency-record.entity';
import { OrderAuditLogEntity } from './entities/order-audit-log.entity';
import { OrderItemEntity } from './entities/order-item.entity';
import { OrderStatusHistoryEntity } from './entities/order-status-history.entity';
import { OrderEntity } from './entities/order.entity';
import { OutboxEventEntity } from './entities/outbox-event.entity';
import { IdempotencyRecordRepository } from './repositories/idempotency-record.repository';
import { OrderAuditLogRepository } from './repositories/order-audit-log.repository';
import { OrderItemRepository } from './repositories/order-item.repository';
import { OrderRepository } from './repositories/order.repository';
import { OrderStatusHistoryRepository } from './repositories/order-status-history.repository';
import { OutboxEventRepository } from './repositories/outbox-event.repository';
import { EventsPublisherService } from './services/events-publisher.service';
import { IdempotencyService } from './services/idempotency.service';
import { OrderNumberService } from './services/order-number.service';
import { OrdersService } from './services/orders.service';
import { OutboxDispatcherService } from './services/outbox-dispatcher.service';
import { AccessTokenStrategy } from './strategies/access-token.strategy';

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: 'jwt-access'
    }),
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderItemEntity,
      OrderStatusHistoryEntity,
      OrderAuditLogEntity,
      IdempotencyRecordEntity,
      OutboxEventEntity
    ])
  ],
  controllers: [OrdersController],
  providers: [
    AccessTokenStrategy,
    OrderRepository,
    OrderItemRepository,
    OrderStatusHistoryRepository,
    OrderAuditLogRepository,
    IdempotencyRecordRepository,
    OutboxEventRepository,
    OrderNumberService,
    IdempotencyService,
    EventsPublisherService,
    OutboxDispatcherService,
    OrdersService
  ]
})
export class OrdersModule {}
