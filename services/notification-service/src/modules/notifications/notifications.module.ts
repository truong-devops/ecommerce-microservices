import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './controllers/notifications.controller';
import { InboxEventEntity } from './entities/inbox-event.entity';
import { NotificationAttemptEntity } from './entities/notification-attempt.entity';
import { NotificationEntity } from './entities/notification.entity';
import { InboxEventRepository } from './repositories/inbox-event.repository';
import { NotificationAttemptRepository } from './repositories/notification-attempt.repository';
import { NotificationRepository } from './repositories/notification.repository';
import { AccessTokenStrategy } from './strategies/access-token.strategy';
import { NotificationDispatcherService } from './services/notification-dispatcher.service';
import { NotificationEventsConsumerService } from './services/notification-events-consumer.service';
import { MockNotificationProviderService } from './services/mock-notification-provider.service';
import { NotificationsService } from './services/notifications.service';

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: 'jwt-access'
    }),
    TypeOrmModule.forFeature([NotificationEntity, NotificationAttemptEntity, InboxEventEntity])
  ],
  controllers: [NotificationsController],
  providers: [
    AccessTokenStrategy,
    NotificationRepository,
    NotificationAttemptRepository,
    InboxEventRepository,
    MockNotificationProviderService,
    NotificationDispatcherService,
    NotificationEventsConsumerService,
    NotificationsService
  ]
})
export class NotificationsModule {}
