import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Consumer, Kafka } from 'kafkajs';
import { Role } from '../../../common/constants/role.enum';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { ShipmentStatus } from '../entities/shipment-status.enum';
import { ShipmentAuditLogRepository } from '../repositories/shipment-audit-log.repository';
import { ShipmentRepository } from '../repositories/shipment.repository';
import { ShipmentStatusHistoryRepository } from '../repositories/shipment-status-history.repository';

interface KafkaEnvelope {
  eventType?: string;
  payload?: Record<string, unknown>;
}

const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class OrderEventsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly enabled: boolean;
  private readonly topic: string;
  private readonly consumer: Consumer | null;
  private isConnected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly shipmentRepository: ShipmentRepository,
    private readonly shipmentStatusHistoryRepository: ShipmentStatusHistoryRepository,
    private readonly shipmentAuditLogRepository: ShipmentAuditLogRepository,
    private readonly logger: AppLogger
  ) {
    this.enabled = this.configService.get<boolean>('kafka.enabled', true);
    this.topic = this.configService.get<string>('kafka.orderEventsTopic', 'order.events');

    const brokers = this.configService.get<string[]>('kafka.brokers', ['localhost:9092']).filter((broker) => broker.length > 0);
    if (!this.enabled || brokers.length === 0) {
      this.consumer = null;
      return;
    }

    const kafka = new Kafka({
      clientId: 'shipping-service-order-consumer',
      brokers
    });

    this.consumer = kafka.consumer({
      groupId: this.configService.get<string>('kafka.orderEventsConsumerGroup', 'shipping-service-order-events-group')
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.consumer) {
      this.logger.warn(
        JSON.stringify({
          message: 'Order events consumer disabled',
          topic: this.topic
        }),
        'shipping-order-consumer'
      );
      return;
    }

    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    if (!this.consumer) {
      return;
    }

    try {
      await this.consumer.connect();
      this.isConnected = true;
      await this.consumer.subscribe({ topic: this.topic, fromBeginning: false });

      void this.consumer.run({
        eachMessage: async ({ partition, message }) => {
          if (!message.value) {
            return;
          }

          await this.handleMessage(message.value.toString('utf8'), partition, message.offset);
        }
      });

      this.logger.log(
        JSON.stringify({
          message: 'Order events consumer started',
          topic: this.topic
        }),
        'shipping-order-consumer'
      );
    } catch (error) {
      this.isConnected = false;
      this.logger.error(
        JSON.stringify({
          message: 'Order events consumer bootstrap failed',
          topic: this.topic,
          error: error instanceof Error ? error.message : String(error)
        }),
        undefined,
        'shipping-order-consumer'
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.consumer && this.isConnected) {
      await this.consumer.disconnect();
      this.isConnected = false;
    }
  }

  private async handleMessage(raw: string, partition: number, offset: string): Promise<void> {
    let envelope: KafkaEnvelope;
    try {
      envelope = JSON.parse(raw) as KafkaEnvelope;
    } catch {
      this.logger.warn(
        JSON.stringify({
          message: 'Skip invalid order event payload',
          raw
        }),
        'shipping-order-consumer'
      );
      return;
    }

    if (envelope.eventType !== 'order.created') {
      return;
    }

    const payload = this.asRecord(envelope.payload);
    const orderId = this.asString(payload.orderId);
    const buyerId = this.asString(payload.userId);
    const sellerId = this.asString(payload.sellerId) ?? SYSTEM_ACTOR_ID;
    const orderNumber = this.asString(payload.orderNumber);
    const currency = this.asCurrency(payload.currency);
    const shippingFee = this.asNonNegativeNumber(payload.shippingAmount) ?? 0;

    if (!orderId || !buyerId || !currency) {
      this.logger.warn(
        JSON.stringify({
          message: 'Skip order.created due to insufficient payload',
          orderId: orderId ?? null,
          buyerId: buyerId ?? null,
          currency: currency ?? null
        }),
        'shipping-order-consumer'
      );
      return;
    }

    const metadata = this.asRecord(payload.metadata);
    const requestId = this.asString(metadata.requestId) ?? `kafka-${partition}-${offset}`;

    try {
      const created = await this.dataSource.transaction(async (manager) => {
        const existing = await this.shipmentRepository.findByOrderId(orderId, manager);
        if (existing) {
          return false;
        }

        const shipment = await this.shipmentRepository.save(
          {
            orderId,
            buyerId,
            sellerId,
            provider: 'system-auto',
            awb: null,
            trackingNumber: null,
            status: ShipmentStatus.PENDING,
            currency,
            shippingFee: this.roundMoney(shippingFee),
            codAmount: 0,
            recipientName: 'Pending recipient info',
            recipientPhone: 'N/A',
            recipientAddress: 'Pending address',
            note: 'Auto-created from order event',
            metadata: {
              source: 'order.events',
              eventType: 'order.created',
              autoCreated: true,
              orderNumber,
              requestId
            }
          },
          manager
        );

        await this.shipmentStatusHistoryRepository.save(
          {
            shipmentId: shipment.id,
            fromStatus: null,
            toStatus: ShipmentStatus.PENDING,
            changedBy: SYSTEM_ACTOR_ID,
            changedByRole: Role.SUPER_ADMIN,
            reason: 'Auto-created from order.created event'
          },
          manager
        );

        await this.shipmentAuditLogRepository.save(
          {
            shipmentId: shipment.id,
            action: 'SHIPMENT_AUTO_CREATED_FROM_ORDER_EVENT',
            actorId: SYSTEM_ACTOR_ID,
            actorRole: Role.SUPER_ADMIN,
            requestId,
            metadata: {
              orderId,
              orderNumber,
              source: 'order.events',
              kafkaPartition: partition,
              kafkaOffset: offset
            }
          },
          manager
        );

        return true;
      });

      if (created) {
        this.logger.log(
          JSON.stringify({
            message: 'Auto-created shipment from order.created',
            orderId
          }),
          'shipping-order-consumer'
        );
      }
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return;
      }

      this.logger.error(
        JSON.stringify({
          message: 'Failed to auto-create shipment from order.created',
          orderId,
          error: error instanceof Error ? error.message : String(error)
        }),
        undefined,
        'shipping-order-consumer'
      );
    }
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

  private asCurrency(value: unknown): string | null {
    const normalized = this.asString(value)?.toUpperCase();
    if (!normalized) {
      return null;
    }

    return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
  }

  private asNonNegativeNumber(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return null;
    }

    return value;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
  }
}
