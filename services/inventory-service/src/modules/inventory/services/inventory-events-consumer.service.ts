import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, Kafka } from 'kafkajs';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { InventoryService } from './inventory.service';

interface KafkaEnvelope {
  eventType?: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class InventoryEventsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly enabled: boolean;
  private readonly topic: string;
  private readonly consumer: Consumer | null;
  private isRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly inventoryService: InventoryService,
    private readonly logger: AppLogger
  ) {
    this.enabled = this.configService.get<boolean>('kafka.enabled', false);
    this.topic = this.configService.get<string>('kafka.inventoryEventsTopic', 'inventory.events');

    if (!this.enabled) {
      this.consumer = null;
      return;
    }

    const kafka = new Kafka({
      clientId: 'inventory-service-consumer',
      brokers: this.configService.get<string[]>('kafka.brokers', ['localhost:9092'])
    });

    this.consumer = kafka.consumer({
      groupId: this.configService.get<string>('kafka.consumerGroupId', 'inventory-service-group')
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled || !this.consumer) {
      return;
    }

    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ partition, message }) => {
        if (!message.value) {
          return;
        }

        const body = message.value.toString('utf8');
        await this.handleMessage(body, partition, message.offset);
      }
    });
    this.isRunning = true;
    this.logger.log(
      JSON.stringify({
        message: 'Kafka consumer connected',
        topic: this.topic
      }),
      'inventory-events-consumer'
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isRunning && this.consumer) {
      await this.consumer.disconnect();
      this.isRunning = false;
    }
  }

  private async handleMessage(raw: string, partition: number, offset: string): Promise<void> {
    let envelope: KafkaEnvelope;
    try {
      envelope = JSON.parse(raw) as KafkaEnvelope;
    } catch {
      this.logger.warn(
        JSON.stringify({
          message: 'Skip invalid kafka payload',
          raw
        }),
        'inventory-events-consumer'
      );
      return;
    }

    if (envelope.eventType !== 'order.cancelled') {
      return;
    }

    const payload = envelope.payload ?? {};
    const orderId = this.asString(payload.orderId);
    const hasItems = this.extractItems(payload).length > 0;

    if (!orderId || !hasItems) {
      this.logger.warn(
        JSON.stringify({
          message: 'Skip order.cancelled event due to insufficient payload',
          orderId: orderId ?? null,
          hasItems
        }),
        'inventory-events-consumer'
      );
      return;
    }

    const metadata = this.asRecord(payload.metadata);
    const requestId = this.asString(metadata.requestId) ?? `kafka-${partition}-${offset}`;

    await this.inventoryService.releaseReservationsFromOrderCancellation(orderId, requestId);
  }

  private extractItems(payload: Record<string, unknown>): Array<{ sku: string; quantity: number }> {
    const rawItems = payload.items;
    if (!Array.isArray(rawItems)) {
      return [];
    }

    return rawItems
      .map((item) => this.asRecord(item))
      .filter((item) => !!this.asString(item.sku) && typeof item.quantity === 'number' && item.quantity > 0)
      .map((item) => ({
        sku: this.asString(item.sku)!,
        quantity: item.quantity as number
      }));
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private asString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
}
