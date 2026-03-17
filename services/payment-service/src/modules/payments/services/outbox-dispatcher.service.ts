import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { addSeconds } from '../../../common/utils/date.util';
import { OutboxStatus } from '../entities/outbox-status.enum';
import { PaymentEventType } from '../events/payment-event-type.enum';
import { OutboxEventRepository } from '../repositories/outbox-event.repository';
import { EventsPublisherService } from './events-publisher.service';

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly maxRetry: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly outboxEventRepository: OutboxEventRepository,
    private readonly eventsPublisherService: EventsPublisherService,
    private readonly logger: AppLogger
  ) {
    this.intervalMs = this.configService.get<number>('outbox.dispatcherIntervalMs', 3000);
    this.batchSize = this.configService.get<number>('outbox.batchSize', 50);
    this.maxRetry = this.configService.get<number>('outbox.maxRetry', 10);
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
      const events = await this.outboxEventRepository.findDispatchable(this.batchSize);

      for (const event of events) {
        try {
          await this.eventsPublisherService.publish(event.eventType as PaymentEventType, event.payload);
          await this.outboxEventRepository.markPublished(event.id);
        } catch (error) {
          const retryCount = event.retryCount + 1;
          const cappedRetry = Math.min(retryCount, this.maxRetry);
          const nextRetrySeconds = Math.min(2 ** cappedRetry, 300);
          const nextRetryAt = retryCount >= this.maxRetry ? null : addSeconds(new Date(), nextRetrySeconds);

          await this.outboxEventRepository.markFailed(event.id, retryCount, nextRetryAt);

          this.logger.error(
            JSON.stringify({
              message: 'Failed to publish outbox event',
              eventId: event.id,
              eventType: event.eventType,
              retryCount,
              status: OutboxStatus.FAILED,
              error: (error as Error).message
            }),
            undefined,
            'outbox-dispatcher'
          );
        }
      }
    } finally {
      this.isRunning = false;
    }
  }
}
