import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { Role, STAFF_ROLES } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { AppException } from '../../../common/utils/app-exception.util';
import { CreateShipmentDto, CreateTrackingEventDto, ListShipmentsDto, ShippingWebhookDto, UpdateShipmentStatusDto } from '../dto';
import { ShipmentEntity } from '../entities/shipment.entity';
import { ShipmentStatus, SHIPMENT_STATUS_TRANSITIONS } from '../entities/shipment-status.enum';
import { ShipmentTrackingEventEntity } from '../entities/shipment-tracking-event.entity';
import { ShipmentEventType } from '../events/shipment-event-type.enum';
import { ShipmentEventPayload } from '../events/shipment-event-payload.type';
import { OutboxEventRepository } from '../repositories/outbox-event.repository';
import { ShipmentAuditLogRepository } from '../repositories/shipment-audit-log.repository';
import { ShipmentRepository } from '../repositories/shipment.repository';
import { ShipmentStatusHistoryRepository } from '../repositories/shipment-status-history.repository';
import { ShipmentTrackingEventRepository } from '../repositories/shipment-tracking-event.repository';
import { WebhookIdempotencyRecordRepository } from '../repositories/webhook-idempotency-record.repository';

const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

interface ShipmentResponse {
  [key: string]: unknown;
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  provider: string;
  awb: string | null;
  trackingNumber: string | null;
  status: ShipmentStatus;
  currency: string;
  shippingFee: number;
  codAmount: number;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  note: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface ShipmentListResponse {
  [key: string]: unknown;
  items: ShipmentResponse[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

interface TrackingEventResponse {
  [key: string]: unknown;
  id: string;
  shipmentId: string;
  status: ShipmentStatus;
  eventCode: string | null;
  description: string | null;
  location: string | null;
  occurredAt: string;
  rawPayload: Record<string, unknown> | null;
  createdAt: string;
}

@Injectable()
export class ShippingService {
  private readonly webhookIdempotencyTtlMinutes: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly shipmentRepository: ShipmentRepository,
    private readonly shipmentTrackingEventRepository: ShipmentTrackingEventRepository,
    private readonly shipmentStatusHistoryRepository: ShipmentStatusHistoryRepository,
    private readonly shipmentAuditLogRepository: ShipmentAuditLogRepository,
    private readonly outboxEventRepository: OutboxEventRepository,
    private readonly webhookIdempotencyRecordRepository: WebhookIdempotencyRecordRepository
  ) {
    this.webhookIdempotencyTtlMinutes = this.configService.get<number>('webhookIdempotency.ttlMinutes', 1440);
  }

  async createShipment(
    user: AuthenticatedUserContext,
    requestId: string,
    dto: CreateShipmentDto
  ): Promise<Record<string, unknown>> {
    this.assertStaffRole(user);

    return this.dataSource.transaction(async (manager) => {
      const existingShipment = await this.shipmentRepository.findByOrderId(dto.orderId, manager);
      if (existingShipment) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'Shipment already exists for this order'
        });
      }

      const shipment = await this.shipmentRepository.save(
        {
          orderId: dto.orderId,
          buyerId: dto.buyerId,
          sellerId: dto.sellerId,
          provider: dto.provider,
          awb: dto.awb ?? null,
          trackingNumber: dto.trackingNumber ?? null,
          status: ShipmentStatus.PENDING,
          currency: dto.currency,
          shippingFee: this.roundMoney(dto.shippingFee ?? 0),
          codAmount: this.roundMoney(dto.codAmount ?? 0),
          recipientName: dto.recipientName,
          recipientPhone: dto.recipientPhone,
          recipientAddress: dto.recipientAddress,
          note: dto.note ?? null,
          metadata: dto.metadata ?? null
        },
        manager
      );

      await this.shipmentStatusHistoryRepository.save(
        {
          shipmentId: shipment.id,
          fromStatus: null,
          toStatus: ShipmentStatus.PENDING,
          changedBy: user.userId,
          changedByRole: user.role,
          reason: 'Shipment created'
        },
        manager
      );

      await this.shipmentAuditLogRepository.save(
        {
          shipmentId: shipment.id,
          action: 'SHIPMENT_CREATED',
          actorId: user.userId,
          actorRole: user.role,
          requestId,
          metadata: {
            orderId: shipment.orderId,
            provider: shipment.provider
          }
        },
        manager
      );

      await this.enqueueShipmentEvent(manager, ShipmentEventType.SHIPMENT_CREATED, shipment, user, requestId);

      return this.toShipmentResponse(shipment);
    });
  }

  async listShipments(user: AuthenticatedUserContext, query: ListShipmentsDto): Promise<ShipmentListResponse> {
    const forcedBuyerId = user.role === Role.CUSTOMER ? user.userId : undefined;
    const { items, totalItems } = await this.shipmentRepository.list(query, forcedBuyerId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    return {
      items: items.map((item) => this.toShipmentResponse(item)),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize)
      }
    };
  }

  async getShipmentById(user: AuthenticatedUserContext, shipmentId: string): Promise<Record<string, unknown>> {
    const shipment = await this.shipmentRepository.findById(shipmentId);

    if (!shipment) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Shipment not found'
      });
    }

    this.assertCanReadShipment(user, shipment);

    return this.toShipmentResponse(shipment);
  }

  async getShipmentByOrderId(user: AuthenticatedUserContext, orderId: string): Promise<Record<string, unknown>> {
    const shipment = await this.shipmentRepository.findByOrderId(orderId);

    if (!shipment) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Shipment not found'
      });
    }

    this.assertCanReadShipment(user, shipment);

    return this.toShipmentResponse(shipment);
  }

  async updateShipmentStatus(
    user: AuthenticatedUserContext,
    requestId: string,
    shipmentId: string,
    dto: UpdateShipmentStatusDto
  ): Promise<Record<string, unknown>> {
    this.assertStaffRole(user);

    return this.dataSource.transaction(async (manager) => {
      const shipment = await this.shipmentRepository.findByIdForUpdate(shipmentId, manager);

      if (!shipment) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Shipment not found'
        });
      }

      if (shipment.status === dto.status) {
        return this.toShipmentResponse(shipment);
      }

      this.assertCanTransition(shipment.status, dto.status);

      const previousStatus = shipment.status;
      shipment.status = dto.status;
      const updatedShipment = await this.shipmentRepository.save(shipment, manager);

      await this.shipmentStatusHistoryRepository.save(
        {
          shipmentId: updatedShipment.id,
          fromStatus: previousStatus,
          toStatus: dto.status,
          changedBy: user.userId,
          changedByRole: user.role,
          reason: dto.reason ?? null
        },
        manager
      );

      await this.shipmentTrackingEventRepository.save(
        {
          shipmentId: updatedShipment.id,
          status: dto.status,
          eventCode: null,
          description: dto.reason ?? 'Status updated manually',
          location: null,
          occurredAt: new Date(),
          rawPayload: null
        },
        manager
      );

      await this.shipmentAuditLogRepository.save(
        {
          shipmentId: updatedShipment.id,
          action: 'SHIPMENT_STATUS_UPDATED',
          actorId: user.userId,
          actorRole: user.role,
          requestId,
          metadata: {
            fromStatus: previousStatus,
            toStatus: dto.status,
            reason: dto.reason ?? null
          }
        },
        manager
      );

      await this.enqueueShipmentEvent(manager, ShipmentEventType.SHIPMENT_STATUS_UPDATED, updatedShipment, user, requestId);
      await this.enqueueTerminalStatusEvent(manager, updatedShipment, user, requestId);

      return this.toShipmentResponse(updatedShipment);
    });
  }

  async addTrackingEvent(
    user: AuthenticatedUserContext,
    requestId: string,
    shipmentId: string,
    dto: CreateTrackingEventDto
  ): Promise<Record<string, unknown>> {
    this.assertStaffRole(user);

    return this.dataSource.transaction(async (manager) => {
      const shipment = await this.shipmentRepository.findByIdForUpdate(shipmentId, manager);

      if (!shipment) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Shipment not found'
        });
      }

      let updatedShipment = shipment;

      if (shipment.status !== dto.status) {
        this.assertCanTransition(shipment.status, dto.status);

        const previousStatus = shipment.status;
        shipment.status = dto.status;
        updatedShipment = await this.shipmentRepository.save(shipment, manager);

        await this.shipmentStatusHistoryRepository.save(
          {
            shipmentId: updatedShipment.id,
            fromStatus: previousStatus,
            toStatus: dto.status,
            changedBy: user.userId,
            changedByRole: user.role,
            reason: dto.description ?? null
          },
          manager
        );

        await this.enqueueShipmentEvent(manager, ShipmentEventType.SHIPMENT_STATUS_UPDATED, updatedShipment, user, requestId);
        await this.enqueueTerminalStatusEvent(manager, updatedShipment, user, requestId);
      }

      const trackingEvent = await this.shipmentTrackingEventRepository.save(
        {
          shipmentId: updatedShipment.id,
          status: dto.status,
          eventCode: dto.eventCode ?? null,
          description: dto.description ?? null,
          location: dto.location ?? null,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
          rawPayload: dto.rawPayload ?? null
        },
        manager
      );

      await this.shipmentAuditLogRepository.save(
        {
          shipmentId: updatedShipment.id,
          action: 'SHIPMENT_TRACKING_EVENT_ADDED',
          actorId: user.userId,
          actorRole: user.role,
          requestId,
          metadata: {
            trackingEventId: trackingEvent.id,
            status: trackingEvent.status,
            eventCode: trackingEvent.eventCode
          }
        },
        manager
      );

      return {
        shipment: this.toShipmentResponse(updatedShipment),
        trackingEvent: this.toTrackingEventResponse(trackingEvent)
      };
    });
  }

  async getTrackingEvents(user: AuthenticatedUserContext, shipmentId: string): Promise<Record<string, unknown>> {
    const shipment = await this.shipmentRepository.findById(shipmentId);

    if (!shipment) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Shipment not found'
      });
    }

    this.assertCanReadShipment(user, shipment);

    const trackingEvents = await this.shipmentTrackingEventRepository.listByShipmentId(shipmentId);

    return {
      shipmentId,
      events: trackingEvents.map((event) => this.toTrackingEventResponse(event))
    };
  }

  async handleProviderWebhook(requestId: string, provider: string, dto: ShippingWebhookDto): Promise<Record<string, unknown>> {
    const normalizedProvider = provider.trim().toLowerCase();
    if (!normalizedProvider) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Invalid provider'
      });
    }

    const requestHash = this.hashWebhookPayload(normalizedProvider, dto);
    const existingRecord = await this.webhookIdempotencyRecordRepository.findUnexpired(normalizedProvider, dto.providerEventId);

    if (existingRecord?.requestHash && existingRecord.requestHash !== requestHash) {
      throw new ConflictException({
        code: ErrorCode.WEBHOOK_IDEMPOTENCY_CONFLICT,
        message: 'Webhook event id already exists with different payload'
      });
    }

    if (existingRecord?.responseBody) {
      return existingRecord.responseBody;
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const shipment = await this.resolveShipmentForWebhook(dto, manager);

        if (!shipment) {
          throw new NotFoundException({
            code: ErrorCode.NOT_FOUND,
            message: 'Shipment not found for webhook payload'
          });
        }

        let updatedShipment = shipment;
        const systemActor: AuthenticatedUserContext = {
          userId: SYSTEM_ACTOR_ID,
          email: 'system@shipping.local',
          role: Role.SUPPORT
        };

        if (shipment.status !== dto.status) {
          this.assertCanTransition(shipment.status, dto.status);

          const previousStatus = shipment.status;
          shipment.status = dto.status;
          updatedShipment = await this.shipmentRepository.save(shipment, manager);

          await this.shipmentStatusHistoryRepository.save(
            {
              shipmentId: updatedShipment.id,
              fromStatus: previousStatus,
              toStatus: dto.status,
              changedBy: SYSTEM_ACTOR_ID,
              changedByRole: Role.SUPPORT,
              reason: dto.description ?? `Webhook status sync from provider ${normalizedProvider}`
            },
            manager
          );

          await this.enqueueShipmentEvent(manager, ShipmentEventType.SHIPMENT_STATUS_UPDATED, updatedShipment, systemActor, requestId);
          await this.enqueueTerminalStatusEvent(manager, updatedShipment, systemActor, requestId);
        }

        const trackingEvent = await this.shipmentTrackingEventRepository.save(
          {
            shipmentId: updatedShipment.id,
            status: dto.status,
            eventCode: dto.eventCode ?? null,
            description: dto.description ?? null,
            location: dto.location ?? null,
            occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
            rawPayload: dto.rawPayload ?? null
          },
          manager
        );

        await this.shipmentAuditLogRepository.save(
          {
            shipmentId: updatedShipment.id,
            action: 'PROVIDER_WEBHOOK_RECEIVED',
            actorId: SYSTEM_ACTOR_ID,
            actorRole: Role.SUPPORT,
            requestId,
            metadata: {
              provider: normalizedProvider,
              providerEventId: dto.providerEventId,
              eventCode: dto.eventCode ?? null,
              status: dto.status
            }
          },
          manager
        );

        const responseBody = {
          processed: true,
          provider: normalizedProvider,
          shipment: this.toShipmentResponse(updatedShipment),
          trackingEvent: this.toTrackingEventResponse(trackingEvent)
        };

        const expiresAt = new Date(Date.now() + this.webhookIdempotencyTtlMinutes * 60 * 1000);

        await this.webhookIdempotencyRecordRepository.save(
          {
            provider: normalizedProvider,
            providerEventId: dto.providerEventId,
            requestHash,
            shipmentId: updatedShipment.id,
            responseStatus: HttpStatus.OK,
            responseBody,
            expiresAt
          },
          manager
        );

        return responseBody;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const persistedRecord = await this.webhookIdempotencyRecordRepository.findByProviderEvent(normalizedProvider, dto.providerEventId);

        if (persistedRecord && persistedRecord.requestHash === requestHash && persistedRecord.responseBody) {
          return persistedRecord.responseBody;
        }

        throw new ConflictException({
          code: ErrorCode.WEBHOOK_IDEMPOTENCY_CONFLICT,
          message: 'Webhook event id already exists with different payload'
        });
      }

      throw error;
    }
  }

  private async resolveShipmentForWebhook(dto: ShippingWebhookDto, manager: EntityManager): Promise<ShipmentEntity | null> {
    if (dto.orderId) {
      return this.shipmentRepository.findByOrderId(dto.orderId, manager);
    }

    if (dto.awb) {
      return this.shipmentRepository.findByAwb(dto.awb, manager);
    }

    if (dto.trackingNumber) {
      return this.shipmentRepository.findByTrackingNumber(dto.trackingNumber, manager);
    }

    throw new AppException(HttpStatus.BAD_REQUEST, {
      code: ErrorCode.BAD_REQUEST,
      message: 'Webhook payload must include orderId or awb or trackingNumber'
    });
  }

  private async enqueueTerminalStatusEvent(
    manager: EntityManager,
    shipment: ShipmentEntity,
    actor: AuthenticatedUserContext,
    requestId: string
  ): Promise<void> {
    if (shipment.status === ShipmentStatus.DELIVERED) {
      await this.enqueueShipmentEvent(manager, ShipmentEventType.SHIPMENT_DELIVERED, shipment, actor, requestId);
      return;
    }

    if (shipment.status === ShipmentStatus.FAILED) {
      await this.enqueueShipmentEvent(manager, ShipmentEventType.SHIPMENT_FAILED, shipment, actor, requestId);
      return;
    }

    if (shipment.status === ShipmentStatus.CANCELLED) {
      await this.enqueueShipmentEvent(manager, ShipmentEventType.SHIPMENT_CANCELLED, shipment, actor, requestId);
    }
  }

  private async enqueueShipmentEvent(
    manager: EntityManager,
    eventType: ShipmentEventType,
    shipment: ShipmentEntity,
    actor: AuthenticatedUserContext,
    requestId: string
  ): Promise<void> {
    const payload: ShipmentEventPayload = {
      shipmentId: shipment.id,
      orderId: shipment.orderId,
      buyerId: shipment.buyerId,
      sellerId: shipment.sellerId,
      provider: shipment.provider,
      status: shipment.status,
      awb: shipment.awb,
      trackingNumber: shipment.trackingNumber,
      shippingFee: shipment.shippingFee,
      codAmount: shipment.codAmount,
      currency: shipment.currency,
      metadata: {
        requestId,
        occurredAt: new Date().toISOString(),
        actorId: actor.userId,
        actorRole: actor.role
      }
    };

    await this.outboxEventRepository.save(
      {
        aggregateType: 'shipment',
        aggregateId: shipment.id,
        eventType,
        payload
      },
      manager
    );
  }

  private assertStaffRole(user: AuthenticatedUserContext): void {
    if (!STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only staff roles can perform this action'
      });
    }
  }

  private assertCanReadShipment(user: AuthenticatedUserContext, shipment: ShipmentEntity): void {
    if (user.role === Role.CUSTOMER && shipment.buyerId !== user.userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Access denied for this shipment'
      });
    }
  }

  private assertCanTransition(currentStatus: ShipmentStatus, nextStatus: ShipmentStatus): void {
    const allowed = SHIPMENT_STATUS_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(nextStatus)) {
      throw new UnprocessableEntityException({
        code: ErrorCode.INVALID_SHIPMENT_STATUS_TRANSITION,
        message: `Cannot transition shipment status from ${currentStatus} to ${nextStatus}`
      });
    }
  }

  private toShipmentResponse(shipment: ShipmentEntity): ShipmentResponse {
    return {
      id: shipment.id,
      orderId: shipment.orderId,
      buyerId: shipment.buyerId,
      sellerId: shipment.sellerId,
      provider: shipment.provider,
      awb: shipment.awb,
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      currency: shipment.currency,
      shippingFee: shipment.shippingFee,
      codAmount: shipment.codAmount,
      recipientName: shipment.recipientName,
      recipientPhone: shipment.recipientPhone,
      recipientAddress: shipment.recipientAddress,
      note: shipment.note,
      metadata: shipment.metadata,
      createdAt: shipment.createdAt.toISOString(),
      updatedAt: shipment.updatedAt.toISOString()
    };
  }

  private toTrackingEventResponse(event: ShipmentTrackingEventEntity): TrackingEventResponse {
    return {
      id: event.id,
      shipmentId: event.shipmentId,
      status: event.status,
      eventCode: event.eventCode,
      description: event.description,
      location: event.location,
      occurredAt: event.occurredAt.toISOString(),
      rawPayload: event.rawPayload,
      createdAt: event.createdAt.toISOString()
    };
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private hashWebhookPayload(provider: string, dto: ShippingWebhookDto): string {
    const canonicalValue = canonicalize({ provider, payload: dto });
    return createHash('sha256').update(canonicalValue).digest('hex');
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
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
