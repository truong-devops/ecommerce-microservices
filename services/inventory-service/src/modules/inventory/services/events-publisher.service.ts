import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { AppLogger } from '../../../common/utils/app-logger.util';

@Injectable()
export class EventsPublisherService implements OnModuleDestroy {
  private readonly enabled: boolean;
  private readonly topic: string;
  private readonly producer: Producer | null;
  private isConnected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger
  ) {
    this.enabled = this.configService.get<boolean>('kafka.enabled', false);
    this.topic = this.configService.get<string>('kafka.inventoryEventsTopic', 'inventory.events');

    if (!this.enabled) {
      this.producer = null;
      return;
    }

    const kafka = new Kafka({
      clientId: 'inventory-service',
      brokers: this.configService.get<string[]>('kafka.brokers', ['localhost:9092'])
    });

    this.producer = kafka.producer();
  }

  async publish(eventType: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.enabled || !this.producer) {
      return;
    }

    await this.ensureConnected();
    await this.producer.send({
      topic: this.topic,
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

  async onModuleDestroy(): Promise<void> {
    if (this.enabled && this.isConnected && this.producer) {
      await this.producer.disconnect();
      this.isConnected = false;
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.producer || this.isConnected) {
      return;
    }

    await this.producer.connect();
    this.isConnected = true;
    this.logger.log(
      JSON.stringify({
        message: 'Kafka producer connected',
        service: 'inventory-service',
        topic: this.topic
      }),
      'events-publisher'
    );
  }
}
