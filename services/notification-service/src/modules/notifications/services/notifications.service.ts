import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { MANAGE_NOTIFICATION_ROLES, Role } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { CreateNotificationDto, ListNotificationsDto } from '../dto';
import { NotificationCategory } from '../entities/notification-category.enum';
import { NotificationChannel } from '../entities/notification-channel.enum';
import { NotificationEntity } from '../entities/notification.entity';
import { InboxEventRepository } from '../repositories/inbox-event.repository';
import { NotificationRepository } from '../repositories/notification.repository';

interface NotificationResponse {
  [key: string]: unknown;
  id: string;
  recipientId: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  eventType: string | null;
  subject: string | null;
  content: string;
  payload: Record<string, unknown> | null;
  status: string;
  retryCount: number;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface NotificationListResponse {
  [key: string]: unknown;
  items: NotificationResponse[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationRepository: NotificationRepository,
    private readonly inboxEventRepository: InboxEventRepository
  ) {}

  async createManualNotifications(
    user: AuthenticatedUserContext,
    requestId: string,
    dto: CreateNotificationDto
  ): Promise<Record<string, unknown>> {
    if (!MANAGE_NOTIFICATION_ROLES.includes(user.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only staff roles can create manual notifications'
      });
    }

    if (new Set(dto.recipientIds).size !== dto.recipientIds.length) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'Duplicate recipient ids are not allowed'
      });
    }

    const notifications = await this.dataSource.transaction(async (manager) => {
      const records = dto.recipientIds.map((recipientId) => ({
        recipientId,
        channel: dto.channel ?? NotificationChannel.IN_APP,
        category: dto.category ?? NotificationCategory.CAMPAIGN,
        eventType: dto.eventType ?? 'notification.manual.campaign',
        subject: dto.subject ?? null,
        content: dto.content,
        payload: {
          ...(dto.payload ?? {}),
          metadata: {
            requestId,
            actorId: user.userId,
            actorRole: user.role
          }
        }
      }));

      return this.notificationRepository.saveMany(records, manager);
    });

    return {
      totalCreated: notifications.length,
      items: notifications.map((notification) => this.toResponse(notification))
    };
  }

  async listNotifications(user: AuthenticatedUserContext, query: ListNotificationsDto): Promise<NotificationListResponse> {
    const forcedRecipientId = user.role === Role.CUSTOMER ? user.userId : undefined;
    const { items, totalItems } = await this.notificationRepository.list(query, forcedRecipientId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    return {
      items: items.map((item) => this.toResponse(item)),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize)
      }
    };
  }

  async getNotificationById(user: AuthenticatedUserContext, notificationId: string): Promise<Record<string, unknown>> {
    const notification = await this.notificationRepository.findById(notificationId);
    if (!notification) {
      throw new NotFoundException({
        code: ErrorCode.NOTIFICATION_NOT_FOUND,
        message: 'Notification not found'
      });
    }

    this.assertCanReadNotification(user, notification);
    return this.toResponse(notification);
  }

  async markAsRead(user: AuthenticatedUserContext, notificationId: string): Promise<Record<string, unknown>> {
    return this.dataSource.transaction(async (manager) => {
      const notification = await this.notificationRepository.findByIdForUpdate(notificationId, manager);
      if (!notification) {
        throw new NotFoundException({
          code: ErrorCode.NOTIFICATION_NOT_FOUND,
          message: 'Notification not found'
        });
      }

      this.assertCanReadNotification(user, notification);

      if (notification.readAt) {
        return this.toResponse(notification);
      }

      notification.readAt = new Date();
      const updated = await this.notificationRepository.save(notification, manager);
      return this.toResponse(updated);
    });
  }

  async handleIncomingEvent(eventType: string, payload: Record<string, unknown>, eventKey: string): Promise<Record<string, unknown>> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.inboxEventRepository.save(
          {
            eventKey,
            eventType,
            payload
          },
          manager
        );

        const mapped = this.mapEventToNotifications(eventType, payload);
        if (mapped.length === 0) {
          return {
            processed: true,
            duplicate: false,
            createdCount: 0
          };
        }

        await this.notificationRepository.saveMany(mapped, manager);

        return {
          processed: true,
          duplicate: false,
          createdCount: mapped.length
        };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return {
          processed: false,
          duplicate: true,
          createdCount: 0
        };
      }

      throw error;
    }
  }

  private mapEventToNotifications(eventType: string, payload: Record<string, unknown>): Array<Partial<NotificationEntity>> {
    const recipientId = this.resolveRecipientId(eventType, payload);
    if (!recipientId) {
      return [];
    }

    const orderNumber = this.getString(payload, 'orderNumber');
    const shipmentId = this.getString(payload, 'shipmentId');
    const status = this.getString(payload, 'status');

    switch (eventType) {
      case 'auth.email.verification.requested':
        return [
          {
            recipientId,
            channel: NotificationChannel.EMAIL,
            category: NotificationCategory.AUTH,
            eventType,
            subject: 'Verify your email',
            content: `Please verify your email using token ${this.getString(payload, 'token') ?? 'N/A'}.`,
            payload
          }
        ];
      case 'auth.password.reset.requested':
        return [
          {
            recipientId,
            channel: NotificationChannel.EMAIL,
            category: NotificationCategory.AUTH,
            eventType,
            subject: 'Reset your password',
            content: `Use token ${this.getString(payload, 'token') ?? 'N/A'} to reset your password.`,
            payload
          }
        ];
      case 'auth.email.verified':
        return [
          {
            recipientId,
            channel: NotificationChannel.IN_APP,
            category: NotificationCategory.AUTH,
            eventType,
            subject: 'Email verified',
            content: 'Your email address has been verified successfully.',
            payload
          }
        ];
      case 'auth.password.reset.completed':
        return [
          {
            recipientId,
            channel: NotificationChannel.IN_APP,
            category: NotificationCategory.AUTH,
            eventType,
            subject: 'Password reset completed',
            content: 'Your password has been changed successfully.',
            payload
          }
        ];
      case 'order.created':
        return [
          {
            recipientId,
            channel: NotificationChannel.IN_APP,
            category: NotificationCategory.ORDER,
            eventType,
            subject: 'Order created',
            content: `Your order ${orderNumber ?? ''} was created successfully.`,
            payload
          }
        ];
      case 'order.cancelled':
        return [
          {
            recipientId,
            channel: NotificationChannel.IN_APP,
            category: NotificationCategory.ORDER,
            eventType,
            subject: 'Order cancelled',
            content: `Your order ${orderNumber ?? ''} has been cancelled.`,
            payload
          }
        ];
      case 'order.status-updated':
        return [
          {
            recipientId,
            channel: NotificationChannel.IN_APP,
            category: NotificationCategory.ORDER,
            eventType,
            subject: 'Order status updated',
            content: `Your order ${orderNumber ?? ''} status is now ${status ?? 'UPDATED'}.`,
            payload
          }
        ];
      case 'order.delivered':
        return [
          {
            recipientId,
            channel: NotificationChannel.IN_APP,
            category: NotificationCategory.ORDER,
            eventType,
            subject: 'Order delivered',
            content: `Your order ${orderNumber ?? ''} has been delivered.`,
            payload
          }
        ];
      case 'shipment.created':
        return [
          {
            recipientId,
            channel: NotificationChannel.IN_APP,
            category: NotificationCategory.SHIPPING,
            eventType,
            subject: 'Shipment created',
            content: `Shipment ${shipmentId ?? ''} has been created.`,
            payload
          }
        ];
      case 'shipment.status-updated':
        return [
          {
            recipientId,
            channel: NotificationChannel.IN_APP,
            category: NotificationCategory.SHIPPING,
            eventType,
            subject: 'Shipment status updated',
            content: `Shipment ${shipmentId ?? ''} status is now ${status ?? 'UPDATED'}.`,
            payload
          }
        ];
      case 'shipment.delivered':
        return [
          {
            recipientId,
            channel: NotificationChannel.IN_APP,
            category: NotificationCategory.SHIPPING,
            eventType,
            subject: 'Shipment delivered',
            content: `Shipment ${shipmentId ?? ''} was delivered.`,
            payload
          }
        ];
      case 'shipment.failed':
        return [
          {
            recipientId,
            channel: NotificationChannel.IN_APP,
            category: NotificationCategory.SHIPPING,
            eventType,
            subject: 'Shipment failed',
            content: `Shipment ${shipmentId ?? ''} failed to deliver.`,
            payload
          }
        ];
      case 'shipment.cancelled':
        return [
          {
            recipientId,
            channel: NotificationChannel.IN_APP,
            category: NotificationCategory.SHIPPING,
            eventType,
            subject: 'Shipment cancelled',
            content: `Shipment ${shipmentId ?? ''} has been cancelled.`,
            payload
          }
        ];
      default:
        return [];
    }
  }

  private resolveRecipientId(eventType: string, payload: Record<string, unknown>): string | null {
    if (eventType.startsWith('auth.')) {
      return this.getString(payload, 'userId');
    }

    if (eventType.startsWith('order.')) {
      return this.getString(payload, 'userId');
    }

    if (eventType.startsWith('shipment.')) {
      return this.getString(payload, 'buyerId');
    }

    return null;
  }

  private getString(payload: Record<string, unknown>, key: string): string | null {
    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }

    return null;
  }

  private assertCanReadNotification(user: AuthenticatedUserContext, notification: NotificationEntity): void {
    if (user.role === Role.CUSTOMER && notification.recipientId !== user.userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Access denied for this notification'
      });
    }
  }

  private toResponse(notification: NotificationEntity): NotificationResponse {
    return {
      id: notification.id,
      recipientId: notification.recipientId,
      channel: notification.channel,
      category: notification.category,
      eventType: notification.eventType,
      subject: notification.subject,
      content: notification.content,
      payload: notification.payload,
      status: notification.status,
      retryCount: notification.retryCount,
      sentAt: notification.sentAt ? notification.sentAt.toISOString() : null,
      readAt: notification.readAt ? notification.readAt.toISOString() : null,
      createdAt: notification.createdAt.toISOString(),
      updatedAt: notification.updatedAt.toISOString()
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
  }
}
