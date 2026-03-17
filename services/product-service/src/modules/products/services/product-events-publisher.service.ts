import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { ProductStatus } from '../entities/product-status.enum';

interface ProductSnapshot {
  id: string;
  sellerId: string;
  name: string;
  slug: string;
  categoryId: string;
  brand: string | null;
  status: ProductStatus;
  minPrice: number;
  variants: Array<{
    sku: string;
    name: string;
    price: number;
    currency: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ProductEventsPublisherService implements OnModuleInit, OnModuleDestroy {
  private producer: Producer | null = null;
  private readonly topic: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger
  ) {
    const enabled = this.configService.get<boolean>('kafka.enabled', false);
    this.topic = this.configService.get<string>('kafka.productEventsTopic', 'product.events');

    if (enabled) {
      const kafka = new Kafka({
        clientId: this.configService.get<string>('kafka.clientId', 'product-service'),
        brokers: this.configService.get<string[]>('kafka.brokers', ['localhost:9092'])
      });
      this.producer = kafka.producer();
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.producer) {
      return;
    }

    try {
      await this.producer.connect();
    } catch (error) {
      this.logger.warn(`Kafka producer connect failed: ${String(error)}`, ProductEventsPublisherService.name);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
    }
  }

  async publishProductCreated(product: ProductSnapshot, actor: AuthenticatedUserContext, requestId: string): Promise<void> {
    await this.publish('product.created', product, actor, requestId);
  }

  async publishProductUpdated(product: ProductSnapshot, actor: AuthenticatedUserContext, requestId: string): Promise<void> {
    await this.publish('product.updated', product, actor, requestId);
  }

  async publishProductStatusChanged(
    product: ProductSnapshot,
    actor: AuthenticatedUserContext,
    requestId: string,
    reason?: string
  ): Promise<void> {
    await this.publish(
      'product.status-changed',
      {
        ...product,
        reason: reason ?? null
      },
      actor,
      requestId
    );
  }

  async publishProductDeleted(product: ProductSnapshot, actor: AuthenticatedUserContext, requestId: string): Promise<void> {
    await this.publish('product.deleted', product, actor, requestId);
  }

  private async publish(
    eventType: string,
    payload: ProductSnapshot | (ProductSnapshot & { reason?: string | null }),
    actor: AuthenticatedUserContext,
    requestId: string
  ): Promise<void> {
    if (!this.producer) {
      return;
    }

    const event = {
      eventType,
      payload,
      metadata: {
        requestId,
        occurredAt: new Date().toISOString(),
        actorId: actor.userId,
        actorRole: actor.role
      }
    };

    try {
      await this.producer.send({
        topic: this.topic,
        messages: [
          {
            key: String(payload.id ?? ''),
            value: JSON.stringify(event)
          }
        ]
      });
    } catch (error) {
      this.logger.warn(`Kafka publish failed for ${eventType}: ${String(error)}`, ProductEventsPublisherService.name);
    }
  }
}
