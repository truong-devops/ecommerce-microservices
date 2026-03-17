import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { addSeconds } from '../../../common/utils/date.util';
import { NotificationStatus } from '../entities/notification-status.enum';
import { NotificationAttemptRepository } from '../repositories/notification-attempt.repository';
import { NotificationRepository } from '../repositories/notification.repository';
import { MockNotificationProviderService } from './mock-notification-provider.service';

@Injectable()
export class NotificationDispatcherService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly maxRetry: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationRepository: NotificationRepository,
    private readonly notificationAttemptRepository: NotificationAttemptRepository,
    private readonly notificationProvider: MockNotificationProviderService,
    private readonly logger: AppLogger
  ) {
    this.intervalMs = this.configService.get<number>('dispatch.intervalMs', 3000);
    this.batchSize = this.configService.get<number>('dispatch.batchSize', 50);
    this.maxRetry = this.configService.get<number>('dispatch.maxRetry', 10);
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.dispatchPending();
    }, this.intervalMs);

    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async dispatchPending(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      let notifications;
      try {
        notifications = await this.notificationRepository.findDispatchable(this.batchSize);
      } catch (error) {
        if (this.isRelationNotExistsError(error)) {
          this.logger.warn(
            JSON.stringify({
              message: 'notifications table is not ready. Run migration first.',
              code: (error as { code?: string }).code
            }),
            'notification-dispatcher'
          );
          return;
        }

        throw error;
      }

      for (const notification of notifications) {
        try {
          const result = await this.notificationProvider.send({
            notificationId: notification.id,
            recipientId: notification.recipientId,
            channel: notification.channel,
            subject: notification.subject,
            content: notification.content,
            eventType: notification.eventType,
            payload: notification.payload
          });

          await this.notificationAttemptRepository.save({
            notificationId: notification.id,
            provider: result.provider,
            status: NotificationStatus.SENT,
            responseMessage: result.responseMessage ?? null,
            errorCode: null,
            metadata: null
          });

          await this.notificationRepository.markSent(notification.id);
        } catch (error) {
          const retryCount = notification.retryCount + 1;
          const cappedRetry = Math.min(retryCount, this.maxRetry);
          const nextRetrySeconds = Math.min(2 ** cappedRetry, 300);
          const nextRetryAt = retryCount >= this.maxRetry ? null : addSeconds(new Date(), nextRetrySeconds);

          await this.notificationAttemptRepository.save({
            notificationId: notification.id,
            provider: 'mock-provider',
            status: NotificationStatus.FAILED,
            responseMessage: null,
            errorCode: 'DISPATCH_FAILED',
            metadata: {
              error: (error as Error).message
            }
          });

          await this.notificationRepository.markFailed(notification.id, retryCount, nextRetryAt);

          this.logger.error(
            JSON.stringify({
              message: 'Failed to dispatch notification',
              notificationId: notification.id,
              retryCount,
              status: NotificationStatus.FAILED,
              error: (error as Error).message
            }),
            undefined,
            'notification-dispatcher'
          );
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  private isRelationNotExistsError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '42P01';
  }
}
