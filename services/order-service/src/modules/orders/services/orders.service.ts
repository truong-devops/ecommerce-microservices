import { ForbiddenException, HttpStatus, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { Role, STAFF_ROLES } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { AppException } from '../../../common/utils/app-exception.util';
import { CancelOrderDto, CreateOrderDto, ListOrdersDto, UpdateOrderStatusDto } from '../dto';
import { OrderEventType } from '../events/order-event-type.enum';
import { OrderItemEntity } from '../entities/order-item.entity';
import { OrderStatus, ORDER_STATUS_TRANSITIONS } from '../entities/order-status.enum';
import { OrderEntity } from '../entities/order.entity';
import { OrderAuditLogRepository } from '../repositories/order-audit-log.repository';
import { OrderItemRepository } from '../repositories/order-item.repository';
import { OrderRepository } from '../repositories/order.repository';
import { OrderStatusHistoryRepository } from '../repositories/order-status-history.repository';
import { OutboxEventRepository } from '../repositories/outbox-event.repository';
import { IdempotencyService } from './idempotency.service';
import { OrderNumberService } from './order-number.service';

interface OrderResponse {
  [key: string]: unknown;
  id: string;
  orderNumber: string;
  userId: string;
  status: string;
  currency: string;
  subtotalAmount: number;
  shippingAmount: number;
  discountAmount: number;
  totalAmount: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    productId: string;
    sku: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
}

interface OrderListResponse {
  [key: string]: unknown;
  items: OrderResponse[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orderRepository: OrderRepository,
    private readonly orderItemRepository: OrderItemRepository,
    private readonly orderStatusHistoryRepository: OrderStatusHistoryRepository,
    private readonly orderAuditLogRepository: OrderAuditLogRepository,
    private readonly outboxEventRepository: OutboxEventRepository,
    private readonly idempotencyService: IdempotencyService,
    private readonly orderNumberService: OrderNumberService
  ) {}

  async createOrder(
    user: AuthenticatedUserContext,
    requestId: string,
    idempotencyKey: string | undefined,
    dto: CreateOrderDto
  ): Promise<Record<string, unknown>> {
    if (!idempotencyKey) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        code: ErrorCode.BAD_REQUEST,
        message: 'Missing Idempotency-Key header'
      });
    }

    const acquireResult = await this.idempotencyService.acquireForCreateOrder(user.userId, idempotencyKey, dto);
    if (acquireResult.replay && acquireResult.responseBody) {
      return acquireResult.responseBody;
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const shippingAmount = dto.shippingAmount ?? 0;
        const discountAmount = dto.discountAmount ?? 0;

        const normalizedItems = dto.items.map((item) => {
          const lineTotal = this.roundMoney(item.quantity * item.unitPrice);
          return {
            ...item,
            lineTotal
          };
        });

        const subtotalAmount = this.roundMoney(normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0));
        const totalAmount = this.roundMoney(subtotalAmount + shippingAmount - discountAmount);

        if (totalAmount < 0) {
          throw new UnprocessableEntityException({
            code: ErrorCode.VALIDATION_FAILED,
            message: 'Total amount must be greater than or equal to zero'
          });
        }

        const order = await this.orderRepository.save(
          {
            orderNumber: this.orderNumberService.generate(),
            userId: user.userId,
            status: OrderStatus.PENDING,
            currency: dto.currency,
            subtotalAmount,
            shippingAmount: this.roundMoney(shippingAmount),
            discountAmount: this.roundMoney(discountAmount),
            totalAmount,
            note: dto.note ?? null
          },
          manager
        );

        const items = await this.orderItemRepository.saveMany(
          normalizedItems.map((item) => ({
            orderId: order.id,
            productId: item.productId,
            sku: item.sku,
            productNameSnapshot: item.productName,
            quantity: item.quantity,
            unitPrice: this.roundMoney(item.unitPrice),
            totalPrice: item.lineTotal
          })),
          manager
        );

        await this.orderStatusHistoryRepository.save(
          {
            orderId: order.id,
            fromStatus: null,
            toStatus: OrderStatus.PENDING,
            changedBy: user.userId,
            changedByRole: user.role,
            reason: 'Order created'
          },
          manager
        );

        await this.orderAuditLogRepository.save(
          {
            orderId: order.id,
            action: 'ORDER_CREATED',
            actorId: user.userId,
            actorRole: user.role,
            requestId,
            metadata: {
              itemCount: items.length,
              totalAmount
            }
          },
          manager
        );

        const hydratedOrder: OrderEntity = {
          ...order,
          items
        } as OrderEntity;

        await this.enqueueOrderEvent(manager, OrderEventType.ORDER_CREATED, hydratedOrder, user, requestId);

        const response = this.toOrderResponse(hydratedOrder);

        await this.idempotencyService.persistResult(
          user.userId,
          idempotencyKey,
          acquireResult.requestHash,
          HttpStatus.CREATED,
          response,
          order.id,
          manager
        );

        return response;
      });
    } finally {
      await this.idempotencyService.releaseLock(acquireResult.lockKey);
    }
  }

  async listOrders(user: AuthenticatedUserContext, query: ListOrdersDto): Promise<OrderListResponse> {
    const customerScopedUserId = user.role === Role.CUSTOMER ? user.userId : undefined;
    const { items, totalItems } = await this.orderRepository.list(query, customerScopedUserId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    return {
      items: items.map((item) => this.toOrderResponse(item)),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize)
      }
    };
  }

  async getOrderById(user: AuthenticatedUserContext, orderId: string): Promise<Record<string, unknown>> {
    const order = await this.orderRepository.findById(orderId);

    if (!order) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Order not found'
      });
    }

    this.assertCanReadOrder(user, order);

    return this.toOrderResponse(order);
  }

  async cancelOrder(user: AuthenticatedUserContext, requestId: string, orderId: string, dto: CancelOrderDto): Promise<Record<string, unknown>> {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.orderRepository.findByIdForUpdate(orderId, manager);

      if (!order) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Order not found'
        });
      }

      this.assertCanCancelOrder(user, order);
      this.assertCanTransition(order.status, OrderStatus.CANCELLED);

      const previousStatus = order.status;
      order.status = OrderStatus.CANCELLED;
      const updatedOrder = await this.orderRepository.save(order, manager);

      await this.orderStatusHistoryRepository.save(
        {
          orderId: updatedOrder.id,
          fromStatus: previousStatus,
          toStatus: OrderStatus.CANCELLED,
          changedBy: user.userId,
          changedByRole: user.role,
          reason: dto.reason ?? null
        },
        manager
      );

      await this.orderAuditLogRepository.save(
        {
          orderId: updatedOrder.id,
          action: 'ORDER_CANCELLED',
          actorId: user.userId,
          actorRole: user.role,
          requestId,
          metadata: {
            fromStatus: previousStatus,
            toStatus: OrderStatus.CANCELLED,
            reason: dto.reason ?? null
          }
        },
        manager
      );

      await this.enqueueOrderEvent(manager, OrderEventType.ORDER_CANCELLED, updatedOrder, user, requestId);
      await this.enqueueOrderEvent(manager, OrderEventType.ORDER_STATUS_UPDATED, updatedOrder, user, requestId);

      return this.toOrderResponse(updatedOrder);
    });
  }

  async confirmReceived(user: AuthenticatedUserContext, requestId: string, orderId: string): Promise<Record<string, unknown>> {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.orderRepository.findByIdForUpdate(orderId, manager);

      if (!order) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Order not found'
        });
      }

      if (user.role !== Role.CUSTOMER) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'Only customer can confirm received'
        });
      }

      this.assertOrderOwner(user, order);
      this.assertCanTransition(order.status, OrderStatus.DELIVERED);

      const previousStatus = order.status;
      order.status = OrderStatus.DELIVERED;
      const updatedOrder = await this.orderRepository.save(order, manager);

      await this.orderStatusHistoryRepository.save(
        {
          orderId: updatedOrder.id,
          fromStatus: previousStatus,
          toStatus: OrderStatus.DELIVERED,
          changedBy: user.userId,
          changedByRole: user.role,
          reason: 'Customer confirmed received'
        },
        manager
      );

      await this.orderAuditLogRepository.save(
        {
          orderId: updatedOrder.id,
          action: 'ORDER_CONFIRMED_RECEIVED',
          actorId: user.userId,
          actorRole: user.role,
          requestId,
          metadata: {
            fromStatus: previousStatus,
            toStatus: OrderStatus.DELIVERED
          }
        },
        manager
      );

      await this.enqueueOrderEvent(manager, OrderEventType.ORDER_DELIVERED, updatedOrder, user, requestId);
      await this.enqueueOrderEvent(manager, OrderEventType.ORDER_STATUS_UPDATED, updatedOrder, user, requestId);

      return this.toOrderResponse(updatedOrder);
    });
  }

  async updateOrderStatus(
    user: AuthenticatedUserContext,
    requestId: string,
    orderId: string,
    dto: UpdateOrderStatusDto
  ): Promise<Record<string, unknown>> {
    if (!STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only staff roles can update order status'
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const order = await this.orderRepository.findByIdForUpdate(orderId, manager);

      if (!order) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Order not found'
        });
      }

      this.assertCanTransition(order.status, dto.status);

      const previousStatus = order.status;
      order.status = dto.status;
      const updatedOrder = await this.orderRepository.save(order, manager);

      await this.orderStatusHistoryRepository.save(
        {
          orderId: updatedOrder.id,
          fromStatus: previousStatus,
          toStatus: dto.status,
          changedBy: user.userId,
          changedByRole: user.role,
          reason: dto.reason ?? null
        },
        manager
      );

      await this.orderAuditLogRepository.save(
        {
          orderId: updatedOrder.id,
          action: 'ORDER_STATUS_UPDATED',
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

      await this.enqueueOrderEvent(manager, OrderEventType.ORDER_STATUS_UPDATED, updatedOrder, user, requestId);

      if (dto.status === OrderStatus.DELIVERED) {
        await this.enqueueOrderEvent(manager, OrderEventType.ORDER_DELIVERED, updatedOrder, user, requestId);
      }

      return this.toOrderResponse(updatedOrder);
    });
  }

  async getOrderStatusHistory(user: AuthenticatedUserContext, orderId: string): Promise<Record<string, unknown>> {
    const order = await this.orderRepository.findById(orderId);

    if (!order) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Order not found'
      });
    }

    this.assertCanReadOrder(user, order);

    const histories = await this.orderStatusHistoryRepository.listByOrderId(orderId);

    return {
      orderId,
      histories: histories.map((history) => ({
        id: history.id,
        fromStatus: history.fromStatus,
        toStatus: history.toStatus,
        changedBy: history.changedBy,
        changedByRole: history.changedByRole,
        reason: history.reason,
        createdAt: history.createdAt.toISOString()
      }))
    };
  }

  private assertCanReadOrder(user: AuthenticatedUserContext, order: OrderEntity): void {
    if (user.role === Role.CUSTOMER) {
      this.assertOrderOwner(user, order);
    }
  }

  private assertCanCancelOrder(user: AuthenticatedUserContext, order: OrderEntity): void {
    if (user.role === Role.CUSTOMER) {
      this.assertOrderOwner(user, order);
      return;
    }

    if (!STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Not allowed to cancel order'
      });
    }
  }

  private assertOrderOwner(user: AuthenticatedUserContext, order: OrderEntity): void {
    if (order.userId !== user.userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Access denied for this order'
      });
    }
  }

  private assertCanTransition(currentStatus: OrderStatus, nextStatus: OrderStatus): void {
    const allowed = ORDER_STATUS_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(nextStatus)) {
      throw new UnprocessableEntityException({
        code: ErrorCode.INVALID_ORDER_STATUS_TRANSITION,
        message: `Cannot transition order status from ${currentStatus} to ${nextStatus}`
      });
    }
  }

  private async enqueueOrderEvent(
    manager: EntityManager,
    eventType: OrderEventType,
    order: OrderEntity,
    actor: AuthenticatedUserContext,
    requestId: string
  ): Promise<void> {
    await this.outboxEventRepository.save(
      {
        aggregateType: 'order',
        aggregateId: order.id,
        eventType,
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          status: order.status,
          totalAmount: order.totalAmount,
          currency: order.currency,
          metadata: {
            requestId,
            occurredAt: new Date().toISOString(),
            actorId: actor.userId,
            actorRole: actor.role
          }
        }
      },
      manager
    );
  }

  private toOrderResponse(order: OrderEntity): OrderResponse {
    const items = (order.items ?? []).map((item: OrderItemEntity) => ({
      id: item.id,
      productId: item.productId,
      sku: item.sku,
      productName: item.productNameSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice
    }));

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: order.status,
      currency: order.currency,
      subtotalAmount: order.subtotalAmount,
      shippingAmount: order.shippingAmount,
      discountAmount: order.discountAmount,
      totalAmount: order.totalAmount,
      note: order.note,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items
    };
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
