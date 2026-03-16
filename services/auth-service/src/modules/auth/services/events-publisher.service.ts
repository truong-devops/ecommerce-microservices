import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { AppLogger } from '../../../common/utils/app-logger.util';

@Injectable()
export class EventsPublisherService implements OnModuleDestroy {
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private isConnected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger
  ) {
    this.kafka = new Kafka({
      clientId: 'auth-service',
      brokers: this.configService.get<string[]>('kafka.brokers', ['localhost:9092'])
    });

    this.producer = this.kafka.producer();
  }

  async publishUserEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    await this.publish(this.configService.getOrThrow<string>('kafka.userEventsTopic'), eventType, payload);
  }

  async publishNotificationEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    await this.publish(this.configService.getOrThrow<string>('kafka.notificationEventsTopic'), eventType, payload);
  }

  async publishAuditEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    await this.publish(this.configService.getOrThrow<string>('kafka.auditEventsTopic'), eventType, payload);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isConnected) {
      await this.producer.disconnect();
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      await this.producer.connect();
      this.isConnected = true;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          message: 'Kafka connect failed',
          error: (error as Error).message
        }),
        undefined,
        'events-publisher'
      );
    }
  }

  private async publish(topic: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    await this.ensureConnected();
    if (!this.isConnected) {
      return;
    }

    await this.producer.send({
      topic,
      messages: [
        {
          key: eventType,
          value: JSON.stringify({
            eventType,
            payload,
            occurredAt: new Date().toISOString()
          })
        }
      ]
    });
  }
}
