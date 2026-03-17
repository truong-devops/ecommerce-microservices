import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Consumer, Kafka } from 'kafkajs';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { NotificationsService } from './notifications.service';

interface KafkaNotificationEvent {
  eventType?: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class NotificationEventsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly consumer: Consumer | null;
  private readonly enabled: boolean;
  private readonly topic: string;
  private isConnected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly logger: AppLogger
  ) {
    this.enabled = this.configService.get<boolean>('kafka.enabled', true);
    this.topic = this.configService.getOrThrow<string>('kafka.notificationEventsTopic');

    const brokers = this.configService.get<string[]>('kafka.brokers', ['localhost:9092']).filter((broker) => broker.length > 0);
    if (!this.enabled || brokers.length === 0) {
      this.consumer = null;
      return;
    }

    const kafka = new Kafka({
      clientId: this.configService.get<string>('kafka.clientId', 'notification-service'),
      brokers
    });

    this.consumer = kafka.consumer({
      groupId: this.configService.get<string>('kafka.consumerGroup', 'notification-service-group')
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.consumer) {
      this.logger.warn(
        JSON.stringify({
          message: 'Kafka consumer disabled',
          topic: this.topic
        }),
        'notification-consumer'
      );
      return;
    }

    void this.bootstrapConsumer();
  }

  private async bootstrapConsumer(): Promise<void> {
    if (!this.consumer) {
      return;
    }

    try {
      await this.consumer.connect();
      this.isConnected = true;

      await this.consumer.subscribe({
        topic: this.topic,
        fromBeginning: false
      });

      // Do not await run() because it is long-lived and would block Nest bootstrap.
      void this.consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) {
            return;
          }

          let parsed: KafkaNotificationEvent;
          try {
            parsed = JSON.parse(message.value.toString()) as KafkaNotificationEvent;
          } catch (error) {
            this.logger.error(
              JSON.stringify({
                message: 'Failed to parse notification event payload',
                error: (error as Error).message
              }),
              undefined,
              'notification-consumer'
            );
            return;
          }

          const eventType = parsed.eventType ?? message.key?.toString() ?? '';
          const payload = parsed.payload ?? {};

          if (!eventType) {
            return;
          }

          const eventKey = this.buildEventKey(eventType, payload);
          const result = await this.notificationsService.handleIncomingEvent(eventType, payload, eventKey);

          this.logger.log(
            JSON.stringify({
              message: 'Notification event consumed',
              eventType,
              eventKey,
              result
            }),
            'notification-consumer'
          );
        }
      });

      this.logger.log(
        JSON.stringify({
          message: 'Kafka consumer started',
          topic: this.topic
        }),
        'notification-consumer'
      );
    } catch (error) {
      this.isConnected = false;
      this.logger.error(
        JSON.stringify({
          message: 'Kafka consumer bootstrap failed',
          topic: this.topic,
          error: (error as Error).message
        }),
        undefined,
        'notification-consumer'
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.consumer && this.isConnected) {
      await this.consumer.disconnect();
      this.isConnected = false;
    }
  }

  private buildEventKey(eventType: string, payload: Record<string, unknown>): string {
    const canonical = canonicalize({
      eventType,
      payload
    });

    return createHash('sha256').update(canonical).digest('hex');
  }
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${canonicalize(val)}`).join(',')}}`;
  }

  return JSON.stringify(value);
}
