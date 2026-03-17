import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { CartItem, CartSnapshot } from '../entities/cart.types';

interface CartEventMetadata {
  requestId: string;
  occurredAt: string;
  actorId: string;
  actorRole: string;
}

interface CartItemEventPayload {
  cartId: string;
  userId: string;
  item: {
    id: string;
    productId: string;
    variantId: string | null;
    sku: string;
    name: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    sellerId: string;
  };
  metadata: CartEventMetadata;
}

interface CartClearedEventPayload {
  cartId: string;
  userId: string;
  metadata: CartEventMetadata;
}

@Injectable()
export class CartEventsPublisherService implements OnModuleInit, OnModuleDestroy {
  private producer: Producer | null = null;
  private readonly topic: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger
  ) {
    const enabled = this.configService.get<boolean>('kafka.enabled', false);
    this.topic = this.configService.get<string>('kafka.cartEventsTopic', 'cart.events');

    if (enabled) {
      const kafka = new Kafka({
        clientId: this.configService.get<string>('kafka.clientId', 'cart-service'),
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
      this.logger.warn(`Kafka producer connect failed: ${String(error)}`, CartEventsPublisherService.name);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
    }
  }

  async publishCartItemAdded(
    cart: CartSnapshot,
    item: CartItem,
    actor: AuthenticatedUserContext,
    requestId: string
  ): Promise<void> {
    await this.publish('cart.item-added', this.buildCartItemPayload(cart, item, actor, requestId), cart.userId);
  }

  async publishCartItemUpdated(
    cart: CartSnapshot,
    item: CartItem,
    actor: AuthenticatedUserContext,
    requestId: string
  ): Promise<void> {
    await this.publish('cart.item-updated', this.buildCartItemPayload(cart, item, actor, requestId), cart.userId);
  }

  async publishCartItemRemoved(
    cart: CartSnapshot,
    item: CartItem,
    actor: AuthenticatedUserContext,
    requestId: string
  ): Promise<void> {
    await this.publish('cart.item-removed', this.buildCartItemPayload(cart, item, actor, requestId), cart.userId);
  }

  async publishCartCleared(cartId: string, userId: string, actor: AuthenticatedUserContext, requestId: string): Promise<void> {
    const payload: CartClearedEventPayload = {
      cartId,
      userId,
      metadata: this.buildMetadata(actor, requestId)
    };

    await this.publish('cart.cleared', payload, userId);
  }

  private buildCartItemPayload(
    cart: CartSnapshot,
    item: CartItem,
    actor: AuthenticatedUserContext,
    requestId: string
  ): CartItemEventPayload {
    return {
      cartId: cart.id,
      userId: cart.userId,
      item: {
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        sku: item.sku,
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        sellerId: item.sellerId
      },
      metadata: this.buildMetadata(actor, requestId)
    };
  }

  private buildMetadata(actor: AuthenticatedUserContext, requestId: string): CartEventMetadata {
    return {
      requestId,
      occurredAt: new Date().toISOString(),
      actorId: actor.userId,
      actorRole: actor.role
    };
  }

  private async publish(eventType: string, payload: CartItemEventPayload | CartClearedEventPayload, key: string): Promise<void> {
    if (!this.producer) {
      return;
    }

    const event = {
      eventType,
      payload
    };

    try {
      await this.producer.send({
        topic: this.topic,
        messages: [{
          key,
          value: JSON.stringify(event)
        }]
      });
    } catch (error) {
      this.logger.warn(`Kafka publish failed for ${eventType}: ${String(error)}`, CartEventsPublisherService.name);
    }
  }
}
