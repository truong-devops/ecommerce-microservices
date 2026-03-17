import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { Role } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { AppException } from '../../../common/utils/app-exception.util';
import { CreatePaymentIntentDto, CreateRefundDto, ListPaymentsDto, PaymentWebhookDto } from '../dto';
import { PaymentTransactionType } from '../entities/payment-transaction-type.enum';
import { PaymentStatus, PAYMENT_STATUS_TRANSITIONS } from '../entities/payment-status.enum';
import { PaymentEntity } from '../entities/payment.entity';
import { RefundStatus } from '../entities/refund-status.enum';
import { PaymentEventPayload } from '../events/payment-event-payload.type';
import { PaymentEventType } from '../events/payment-event-type.enum';
import {
  CreateRefundOutput,
  PAYMENT_GATEWAY_PROVIDER,
  PaymentGatewayProvider
} from '../providers/payment-gateway-provider.interface';
import { IdempotencyRecordRepository } from '../repositories/idempotency-record.repository';
import { OutboxEventRepository } from '../repositories/outbox-event.repository';
import { PaymentAuditLogRepository } from '../repositories/payment-audit-log.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import { PaymentStatusHistoryRepository } from '../repositories/payment-status-history.repository';
import { PaymentTransactionRepository } from '../repositories/payment-transaction.repository';
import { RefundRepository } from '../repositories/refund.repository';
import { WebhookIdempotencyRecordRepository } from '../repositories/webhook-idempotency-record.repository';
import { IdempotencyService } from './idempotency.service';

const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

interface PaymentResponse {
  [key: string]: unknown;
  id: string;
  orderId: string;
  userId: string;
  sellerId: string | null;
  provider: string;
  providerPaymentId: string | null;
  status: PaymentStatus;
  currency: string;
  amount: number;
  refundedAmount: number;
  refundableAmount: number;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  requiresActionUrl?: string;
}

interface PaymentListResponse {
  [key: string]: unknown;
  items: PaymentResponse[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

interface RefundResponse {
  [key: string]: unknown;
  id: string;
  paymentId: string;
  providerRefundId: string | null;
  amount: number;
  currency: string;
  status: RefundStatus;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  requestedBy: string;
  requestedByRole: Role;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PaymentsService {
  private readonly webhookIdempotencyTtlMinutes: number;
  private readonly gatewayProvider: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly paymentRepository: PaymentRepository,
    private readonly paymentTransactionRepository: PaymentTransactionRepository,
    private readonly paymentStatusHistoryRepository: PaymentStatusHistoryRepository,
    private readonly paymentAuditLogRepository: PaymentAuditLogRepository,
    private readonly idempotencyRecordRepository: IdempotencyRecordRepository,
    private readonly webhookIdempotencyRecordRepository: WebhookIdempotencyRecordRepository,
    private readonly refundRepository: RefundRepository,
    private readonly outboxEventRepository: OutboxEventRepository,
    private readonly idempotencyService: IdempotencyService,
    @Inject(PAYMENT_GATEWAY_PROVIDER)
    private readonly paymentGatewayProvider: PaymentGatewayProvider
  ) {
    this.webhookIdempotencyTtlMinutes = this.configService.get<number>('webhookIdempotency.ttlMinutes', 1440);
    this.gatewayProvider = this.configService.get<string>('gateway.provider', 'mock');
  }

  async createPaymentIntent(
    user: AuthenticatedUserContext,
    requestId: string,
    idempotencyKey: string | undefined,
    dto: CreatePaymentIntentDto
  ): Promise<Record<string, unknown>> {
    if (!idempotencyKey) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        code: ErrorCode.BAD_REQUEST,
        message: 'Missing Idempotency-Key header'
      });
    }

    const acquireResult = await this.idempotencyService.acquireForCreatePaymentIntent(user.userId, idempotencyKey, dto);
    if (acquireResult.replay && acquireResult.responseBody) {
      return acquireResult.responseBody;
    }

    const provider = (dto.provider ?? this.gatewayProvider).trim().toLowerCase();
    if (provider !== this.gatewayProvider) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `Gateway provider ${provider} is not enabled. Active provider is ${this.gatewayProvider}`
      });
    }

    try {
      const providerResult = await this.paymentGatewayProvider.createPaymentIntent({
        orderId: dto.orderId,
        amount: dto.amount,
        currency: dto.currency,
        provider,
        autoCapture: dto.autoCapture ?? true,
        simulatedStatus: dto.simulatedStatus,
        metadata: dto.metadata
      });

      return await this.dataSource.transaction(async (manager) => {
        const existing = await this.paymentRepository.findByOrderId(dto.orderId, manager);
        if (existing) {
          throw new ConflictException({
            code: ErrorCode.CONFLICT,
            message: 'Payment already exists for this order'
          });
        }

        const payment = await this.paymentRepository.save(
          {
            orderId: dto.orderId,
            userId: user.userId,
            sellerId: dto.sellerId ?? null,
            provider,
            providerPaymentId: providerResult.providerPaymentId,
            status: providerResult.status,
            currency: dto.currency,
            amount: this.roundMoney(dto.amount),
            refundedAmount: 0,
            description: dto.description ?? null,
            metadata: {
              ...(dto.metadata ?? {}),
              requiresActionUrl: providerResult.requiresActionUrl ?? null
            }
          },
          manager
        );

        await this.paymentStatusHistoryRepository.save(
          {
            paymentId: payment.id,
            fromStatus: null,
            toStatus: payment.status,
            changedBy: user.userId,
            changedByRole: user.role,
            reason: 'Payment intent created'
          },
          manager
        );

        await this.paymentTransactionRepository.save(
          {
            paymentId: payment.id,
            transactionType: this.mapStatusToTransactionType(payment.status),
            gatewayTransactionId: providerResult.gatewayTransactionId,
            amount: payment.amount,
            currency: payment.currency,
            status: payment.status,
            requestId,
            rawPayload: providerResult.rawPayload ?? null
          },
          manager
        );

        await this.paymentAuditLogRepository.save(
          {
            paymentId: payment.id,
            action: 'PAYMENT_INTENT_CREATED',
            actorId: user.userId,
            actorRole: user.role,
            requestId,
            metadata: {
              orderId: payment.orderId,
              provider,
              status: payment.status
            }
          },
          manager
        );

        await this.enqueuePaymentEvent(manager, PaymentEventType.PAYMENT_CREATED, payment, user, requestId);
        await this.enqueueStatusEvent(manager, payment, user, requestId);

        const response = this.toPaymentResponse(payment, providerResult.requiresActionUrl);

        await this.idempotencyService.persistResult(
          user.userId,
          idempotencyKey,
          acquireResult.requestHash,
          HttpStatus.CREATED,
          response,
          payment.id,
          manager
        );

        return response;
      });
    } catch (error) {
      if (error instanceof ConflictException || error instanceof AppException) {
        throw error;
      }

      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'Payment already exists for this order'
        });
      }

      throw new ServiceUnavailableException({
        code: ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE,
        message: 'Payment gateway unavailable',
        details: error instanceof Error ? error.message : undefined
      });
    } finally {
      await this.idempotencyService.releaseLock(acquireResult.lockKey);
    }
  }

  async listPayments(user: AuthenticatedUserContext, query: ListPaymentsDto): Promise<PaymentListResponse> {
    const forcedUserId = user.role === Role.CUSTOMER ? user.userId : undefined;
    const scopedQuery = user.role === Role.SELLER ? { ...query, sellerId: user.userId } : query;

    const { items, totalItems } = await this.paymentRepository.list(scopedQuery, forcedUserId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    return {
      items: items.map((item) => this.toPaymentResponse(item)),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize)
      }
    };
  }

  async getPaymentById(user: AuthenticatedUserContext, paymentId: string): Promise<Record<string, unknown>> {
    const payment = await this.paymentRepository.findById(paymentId);

    if (!payment) {
      throw new NotFoundException({
        code: ErrorCode.PAYMENT_NOT_FOUND,
        message: 'Payment not found'
      });
    }

    this.assertCanReadPayment(user, payment);
    return this.toPaymentResponse(payment);
  }

  async getPaymentByOrderId(user: AuthenticatedUserContext, orderId: string): Promise<Record<string, unknown>> {
    const payment = await this.paymentRepository.findByOrderId(orderId);

    if (!payment) {
      throw new NotFoundException({
        code: ErrorCode.PAYMENT_NOT_FOUND,
        message: 'Payment not found'
      });
    }

    this.assertCanReadPayment(user, payment);
    return this.toPaymentResponse(payment);
  }

  async createRefund(
    user: AuthenticatedUserContext,
    requestId: string,
    paymentId: string,
    dto: CreateRefundDto
  ): Promise<Record<string, unknown>> {
    return this.dataSource.transaction(async (manager) => {
      const payment = await this.paymentRepository.findByIdForUpdate(paymentId, manager);

      if (!payment) {
        throw new NotFoundException({
          code: ErrorCode.PAYMENT_NOT_FOUND,
          message: 'Payment not found'
        });
      }

      this.assertCanRefundPayment(user, payment);
      this.assertRefundableStatus(payment.status);

      const remainingRefundable = this.roundMoney(payment.amount - payment.refundedAmount);
      const requestedAmount = this.roundMoney(dto.amount);

      if (requestedAmount > remainingRefundable) {
        throw new UnprocessableEntityException({
          code: ErrorCode.REFUND_AMOUNT_EXCEEDED,
          message: 'Refund amount exceeds remaining refundable amount'
        });
      }

      let gatewayRefund: CreateRefundOutput;
      try {
        gatewayRefund = await this.paymentGatewayProvider.createRefund({
          paymentId: payment.id,
          amount: requestedAmount,
          currency: payment.currency,
          reason: dto.reason
        });
      } catch {
        throw new ServiceUnavailableException({
          code: ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE,
          message: 'Payment gateway unavailable for refund'
        });
      }

      const refund = await this.refundRepository.save(
        {
          paymentId: payment.id,
          providerRefundId: gatewayRefund.providerRefundId,
          amount: requestedAmount,
          currency: payment.currency,
          status: gatewayRefund.status,
          reason: dto.reason ?? null,
          metadata: gatewayRefund.rawPayload ?? null,
          requestedBy: user.userId,
          requestedByRole: user.role
        },
        manager
      );

      await this.paymentTransactionRepository.save(
        {
          paymentId: payment.id,
          transactionType: gatewayRefund.status === RefundStatus.SUCCEEDED ? PaymentTransactionType.REFUND_SUCCEEDED : PaymentTransactionType.REFUND_FAILED,
          gatewayTransactionId: gatewayRefund.gatewayTransactionId,
          amount: requestedAmount,
          currency: payment.currency,
          status: gatewayRefund.status,
          requestId,
          rawPayload: gatewayRefund.rawPayload ?? null
        },
        manager
      );

      let updatedPayment = payment;
      if (gatewayRefund.status === RefundStatus.SUCCEEDED) {
        const previousStatus = payment.status;
        const newRefundedAmount = this.roundMoney(payment.refundedAmount + requestedAmount);
        const nextStatus = newRefundedAmount >= payment.amount ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;

        if (payment.status !== nextStatus) {
          this.assertCanTransition(payment.status, nextStatus);
        }

        payment.refundedAmount = newRefundedAmount;
        payment.status = nextStatus;
        updatedPayment = await this.paymentRepository.save(payment, manager);

        if (previousStatus !== nextStatus) {
          await this.paymentStatusHistoryRepository.save(
            {
              paymentId: updatedPayment.id,
              fromStatus: previousStatus,
              toStatus: nextStatus,
              changedBy: user.userId,
              changedByRole: user.role,
              reason: dto.reason ?? 'Refund processed'
            },
            manager
          );
        }

        await this.enqueueStatusEvent(manager, updatedPayment, user, requestId);
      }

      await this.paymentAuditLogRepository.save(
        {
          paymentId: payment.id,
          action: 'PAYMENT_REFUND_REQUESTED',
          actorId: user.userId,
          actorRole: user.role,
          requestId,
          metadata: {
            refundId: refund.id,
            amount: requestedAmount,
            status: refund.status,
            reason: dto.reason ?? null
          }
        },
        manager
      );

      return {
        payment: this.toPaymentResponse(updatedPayment),
        refund: this.toRefundResponse(refund)
      };
    });
  }

  async listRefunds(user: AuthenticatedUserContext, paymentId: string): Promise<Record<string, unknown>> {
    const payment = await this.paymentRepository.findById(paymentId);

    if (!payment) {
      throw new NotFoundException({
        code: ErrorCode.PAYMENT_NOT_FOUND,
        message: 'Payment not found'
      });
    }

    this.assertCanReadPayment(user, payment);

    const refunds = await this.refundRepository.listByPaymentId(paymentId);

    return {
      paymentId,
      items: refunds.map((refund) => this.toRefundResponse(refund))
    };
  }

  async handleProviderWebhook(requestId: string, provider: string, dto: PaymentWebhookDto): Promise<Record<string, unknown>> {
    const normalizedProvider = provider.trim().toLowerCase();
    if (!normalizedProvider) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Invalid provider'
      });
    }
    if (normalizedProvider !== this.gatewayProvider) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `Webhook provider ${normalizedProvider} is not enabled. Active provider is ${this.gatewayProvider}`
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
        const payment = await this.resolvePaymentForWebhook(dto, manager);

        if (!payment) {
          throw new NotFoundException({
            code: ErrorCode.PAYMENT_NOT_FOUND,
            message: 'Payment not found for webhook payload'
          });
        }

        const parsedWebhook = await this.paymentGatewayProvider.parseWebhook({
          provider: normalizedProvider,
          providerEventId: dto.providerEventId,
          status: dto.status,
          signature: dto.signature,
          amount: dto.amount,
          currency: dto.currency,
          paymentId: dto.paymentId,
          orderId: dto.orderId,
          gatewayTransactionId: dto.gatewayTransactionId,
          providerPaymentId: dto.providerPaymentId,
          metadata: dto.metadata,
          rawPayload: dto.rawPayload
        });

        if (!parsedWebhook.isValid) {
          throw new BadRequestException({
            code: ErrorCode.GATEWAY_CALLBACK_INVALID_SIGNATURE,
            message: parsedWebhook.reason ?? 'Invalid webhook signature'
          });
        }

        if (parsedWebhook.amount !== undefined && this.roundMoney(parsedWebhook.amount) !== payment.amount) {
          throw new UnprocessableEntityException({
            code: ErrorCode.PAYMENT_AMOUNT_MISMATCH,
            message: 'Webhook amount does not match payment amount'
          });
        }

        let updatedPayment = payment;
        const systemActor: AuthenticatedUserContext = {
          userId: SYSTEM_ACTOR_ID,
          email: 'system@payment.local',
          role: Role.SUPPORT
        };

        if (payment.status !== parsedWebhook.status) {
          this.assertCanTransition(payment.status, parsedWebhook.status);

          const previousStatus = payment.status;
          payment.status = parsedWebhook.status;

          if (parsedWebhook.status === PaymentStatus.REFUNDED) {
            payment.refundedAmount = payment.amount;
          }

          updatedPayment = await this.paymentRepository.save(payment, manager);

          await this.paymentStatusHistoryRepository.save(
            {
              paymentId: updatedPayment.id,
              fromStatus: previousStatus,
              toStatus: parsedWebhook.status,
              changedBy: SYSTEM_ACTOR_ID,
              changedByRole: Role.SUPPORT,
              reason: `Webhook status sync from provider ${normalizedProvider}`
            },
            manager
          );

          await this.enqueueStatusEvent(manager, updatedPayment, systemActor, requestId);
        }

        await this.paymentTransactionRepository.save(
          {
            paymentId: updatedPayment.id,
            transactionType: this.mapStatusToTransactionType(parsedWebhook.status),
            gatewayTransactionId: parsedWebhook.gatewayTransactionId ?? dto.gatewayTransactionId ?? null,
            amount: parsedWebhook.amount !== undefined ? this.roundMoney(parsedWebhook.amount) : updatedPayment.amount,
            currency: parsedWebhook.currency ?? updatedPayment.currency,
            status: parsedWebhook.status,
            requestId,
            rawPayload: parsedWebhook.rawPayload ?? dto.rawPayload ?? null
          },
          manager
        );

        await this.paymentAuditLogRepository.save(
          {
            paymentId: updatedPayment.id,
            action: 'PROVIDER_WEBHOOK_RECEIVED',
            actorId: SYSTEM_ACTOR_ID,
            actorRole: Role.SUPPORT,
            requestId,
            metadata: {
              provider: normalizedProvider,
              providerEventId: dto.providerEventId,
              eventType: dto.eventType,
              status: parsedWebhook.status
            }
          },
          manager
        );

        const responseBody = {
          processed: true,
          provider: normalizedProvider,
          payment: this.toPaymentResponse(updatedPayment)
        };

        const expiresAt = new Date(Date.now() + this.webhookIdempotencyTtlMinutes * 60 * 1000);

        await this.webhookIdempotencyRecordRepository.save(
          {
            provider: normalizedProvider,
            providerEventId: dto.providerEventId,
            requestHash,
            paymentId: updatedPayment.id,
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

  private async resolvePaymentForWebhook(dto: PaymentWebhookDto, manager: EntityManager): Promise<PaymentEntity | null> {
    if (dto.paymentId) {
      return this.paymentRepository.findByIdForUpdate(dto.paymentId, manager);
    }

    if (dto.orderId) {
      const payment = await this.paymentRepository.findByOrderId(dto.orderId, manager);
      if (payment) {
        return this.paymentRepository.findByIdForUpdate(payment.id, manager);
      }
    }

    if (dto.providerPaymentId) {
      const payment = await this.paymentRepository.findByProviderPaymentId(dto.providerPaymentId, manager);
      if (payment) {
        return this.paymentRepository.findByIdForUpdate(payment.id, manager);
      }
    }

    if (dto.gatewayTransactionId) {
      const transaction = await this.paymentTransactionRepository.findByGatewayTransactionId(dto.gatewayTransactionId, manager);
      if (transaction) {
        return this.paymentRepository.findByIdForUpdate(transaction.paymentId, manager);
      }
    }

    throw new AppException(HttpStatus.BAD_REQUEST, {
      code: ErrorCode.BAD_REQUEST,
      message: 'Webhook payload must include paymentId or orderId or providerPaymentId or gatewayTransactionId'
    });
  }

  private async enqueueStatusEvent(
    manager: EntityManager,
    payment: PaymentEntity,
    actor: AuthenticatedUserContext,
    requestId: string
  ): Promise<void> {
    const eventType = this.mapStatusToEventType(payment.status);

    if (!eventType) {
      return;
    }

    await this.enqueuePaymentEvent(manager, eventType, payment, actor, requestId);
  }

  private async enqueuePaymentEvent(
    manager: EntityManager,
    eventType: PaymentEventType,
    payment: PaymentEntity,
    actor: AuthenticatedUserContext,
    requestId: string
  ): Promise<void> {
    const payload: PaymentEventPayload = {
      paymentId: payment.id,
      orderId: payment.orderId,
      userId: payment.userId,
      sellerId: payment.sellerId,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      status: payment.status,
      amount: payment.amount,
      refundedAmount: payment.refundedAmount,
      currency: payment.currency,
      metadata: {
        requestId,
        occurredAt: new Date().toISOString(),
        actorId: actor.userId,
        actorRole: actor.role
      }
    };

    await this.outboxEventRepository.save(
      {
        aggregateType: 'payment',
        aggregateId: payment.id,
        eventType,
        payload
      },
      manager
    );
  }

  private assertCanReadPayment(user: AuthenticatedUserContext, payment: PaymentEntity): void {
    if (user.role === Role.CUSTOMER && payment.userId !== user.userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Access denied for this payment'
      });
    }

    if (user.role === Role.SELLER && payment.sellerId !== user.userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Access denied for this payment'
      });
    }
  }

  private assertCanRefundPayment(user: AuthenticatedUserContext, payment: PaymentEntity): void {
    if (user.role === Role.CUSTOMER && payment.userId !== user.userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Access denied for this payment'
      });
    }

    const isStaff = [Role.ADMIN, Role.SUPPORT, Role.SUPER_ADMIN].includes(user.role);
    if (user.role !== Role.CUSTOMER && !isStaff) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Not allowed to refund this payment'
      });
    }
  }

  private assertRefundableStatus(status: PaymentStatus): void {
    const refundableStatuses = [PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED];
    if (!refundableStatuses.includes(status)) {
      throw new UnprocessableEntityException({
        code: ErrorCode.INVALID_PAYMENT_STATUS_TRANSITION,
        message: `Cannot refund payment in status ${status}`
      });
    }
  }

  private assertCanTransition(currentStatus: PaymentStatus, nextStatus: PaymentStatus): void {
    const allowed = PAYMENT_STATUS_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(nextStatus)) {
      throw new UnprocessableEntityException({
        code: ErrorCode.INVALID_PAYMENT_STATUS_TRANSITION,
        message: `Cannot transition payment status from ${currentStatus} to ${nextStatus}`
      });
    }
  }

  private toPaymentResponse(payment: PaymentEntity, requiresActionUrl?: string): PaymentResponse {
    const actionUrlFromMetadata =
      payment.metadata && 'requiresActionUrl' in payment.metadata
        ? (payment.metadata.requiresActionUrl as string | null)
        : null;

    const response: PaymentResponse = {
      id: payment.id,
      orderId: payment.orderId,
      userId: payment.userId,
      sellerId: payment.sellerId,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      status: payment.status,
      currency: payment.currency,
      amount: payment.amount,
      refundedAmount: payment.refundedAmount,
      refundableAmount: this.roundMoney(Math.max(payment.amount - payment.refundedAmount, 0)),
      description: payment.description,
      metadata: payment.metadata,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString()
    };

    const resolvedActionUrl = requiresActionUrl ?? actionUrlFromMetadata ?? undefined;
    if (resolvedActionUrl) {
      response.requiresActionUrl = resolvedActionUrl;
    }

    return response;
  }

  private toRefundResponse(refund: {
    id: string;
    paymentId: string;
    providerRefundId: string | null;
    amount: number;
    currency: string;
    status: RefundStatus;
    reason: string | null;
    metadata: Record<string, unknown> | null;
    requestedBy: string;
    requestedByRole: Role;
    createdAt: Date;
    updatedAt: Date;
  }): RefundResponse {
    return {
      id: refund.id,
      paymentId: refund.paymentId,
      providerRefundId: refund.providerRefundId,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
      reason: refund.reason,
      metadata: refund.metadata,
      requestedBy: refund.requestedBy,
      requestedByRole: refund.requestedByRole,
      createdAt: refund.createdAt.toISOString(),
      updatedAt: refund.updatedAt.toISOString()
    };
  }

  private mapStatusToTransactionType(status: PaymentStatus): PaymentTransactionType {
    if (status === PaymentStatus.REQUIRES_ACTION) return PaymentTransactionType.REQUIRES_ACTION;
    if (status === PaymentStatus.AUTHORIZED) return PaymentTransactionType.AUTHORIZED;
    if (status === PaymentStatus.CAPTURED) return PaymentTransactionType.CAPTURED;
    if (status === PaymentStatus.FAILED) return PaymentTransactionType.FAILED;
    if (status === PaymentStatus.CANCELLED) return PaymentTransactionType.CANCELLED;
    if (status === PaymentStatus.CHARGEBACK) return PaymentTransactionType.CHARGEBACK;
    if (status === PaymentStatus.PARTIALLY_REFUNDED || status === PaymentStatus.REFUNDED) return PaymentTransactionType.REFUND_SUCCEEDED;
    return PaymentTransactionType.INTENT_CREATED;
  }

  private mapStatusToEventType(status: PaymentStatus): PaymentEventType | null {
    if (status === PaymentStatus.REQUIRES_ACTION) return PaymentEventType.PAYMENT_REQUIRES_ACTION;
    if (status === PaymentStatus.AUTHORIZED) return PaymentEventType.PAYMENT_AUTHORIZED;
    if (status === PaymentStatus.CAPTURED) return PaymentEventType.PAYMENT_CAPTURED;
    if (status === PaymentStatus.FAILED) return PaymentEventType.PAYMENT_FAILED;
    if (status === PaymentStatus.CANCELLED) return PaymentEventType.PAYMENT_CANCELLED;
    if (status === PaymentStatus.PARTIALLY_REFUNDED) return PaymentEventType.PAYMENT_PARTIALLY_REFUNDED;
    if (status === PaymentStatus.REFUNDED) return PaymentEventType.PAYMENT_REFUNDED;
    if (status === PaymentStatus.CHARGEBACK) return PaymentEventType.PAYMENT_CHARGEBACK;
    return null;
  }

  private hashWebhookPayload(provider: string, dto: PaymentWebhookDto): string {
    const canonicalValue = canonicalize({ provider, payload: dto });
    return createHash('sha256').update(canonicalValue).digest('hex');
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
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
