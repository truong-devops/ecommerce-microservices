import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Role } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { NotificationCategory } from '../entities/notification-category.enum';
import { NotificationChannel } from '../entities/notification-channel.enum';
import { NotificationStatus } from '../entities/notification-status.enum';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const manager = {} as EntityManager;

  const dataSource = {
    transaction: jest.fn(async (cb: (entityManager: EntityManager) => Promise<unknown>) => cb(manager))
  } as unknown as DataSource;

  const notificationRepository = {
    saveMany: jest.fn(),
    list: jest.fn(),
    findById: jest.fn(),
    findByIdForUpdate: jest.fn(),
    save: jest.fn()
  };

  const inboxEventRepository = {
    save: jest.fn()
  };

  const service = new NotificationsService(dataSource, notificationRepository as never, inboxEventRepository as never);

  const adminUser: AuthenticatedUserContext = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'admin@example.com',
    role: Role.ADMIN
  };

  const customerUser: AuthenticatedUserContext = {
    userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    email: 'buyer@example.com',
    role: Role.CUSTOMER
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates manual notifications on happy path', async () => {
    notificationRepository.saveMany.mockResolvedValue([
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        recipientId: customerUser.userId,
        channel: NotificationChannel.IN_APP,
        category: NotificationCategory.CAMPAIGN,
        eventType: 'notification.manual.campaign',
        subject: 'Promo',
        content: 'New campaign',
        payload: null,
        status: NotificationStatus.PENDING,
        retryCount: 0,
        sentAt: null,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      }
    ]);

    const response = await service.createManualNotifications(adminUser, 'request-1', {
      recipientIds: [customerUser.userId],
      content: 'New campaign',
      subject: 'Promo'
    });

    expect(response.totalCreated).toBe(1);
    expect(notificationRepository.saveMany).toHaveBeenCalledTimes(1);
  });

  it('throws conflict for duplicate recipients', async () => {
    await expect(
      service.createManualNotifications(adminUser, 'request-1', {
        recipientIds: [customerUser.userId, customerUser.userId],
        content: 'Duplicate'
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws forbidden for customer manual send', async () => {
    await expect(
      service.createManualNotifications(customerUser, 'request-1', {
        recipientIds: [customerUser.userId],
        content: 'Hello'
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws not found when notification does not exist', async () => {
    notificationRepository.findById.mockResolvedValue(null);
    await expect(service.getNotificationById(adminUser, 'missing-id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks own notification as read', async () => {
    notificationRepository.findByIdForUpdate.mockResolvedValue({
      id: 'notification-id',
      recipientId: customerUser.userId,
      channel: NotificationChannel.IN_APP,
      category: NotificationCategory.ORDER,
      eventType: 'order.created',
      subject: null,
      content: 'Order created',
      payload: null,
      status: NotificationStatus.PENDING,
      retryCount: 0,
      sentAt: null,
      readAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    });
    notificationRepository.save.mockImplementation(async (notification: Record<string, unknown>) => ({
      ...notification,
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    }));

    const response = await service.markAsRead(customerUser, 'notification-id');
    expect(response.readAt).toBeTruthy();
  });

  it('throws forbidden when customer reads another user notification', async () => {
    notificationRepository.findByIdForUpdate.mockResolvedValue({
      id: 'notification-id',
      recipientId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      channel: NotificationChannel.IN_APP,
      category: NotificationCategory.ORDER,
      eventType: 'order.created',
      subject: null,
      content: 'Order created',
      payload: null,
      status: NotificationStatus.PENDING,
      retryCount: 0,
      sentAt: null,
      readAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    });

    await expect(service.markAsRead(customerUser, 'notification-id')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('treats duplicate inbox event as replay', async () => {
    inboxEventRepository.save.mockRejectedValue({ code: '23505' });
    const result = await service.handleIncomingEvent('order.created', { userId: customerUser.userId }, 'event-key');
    expect(result.duplicate).toBe(true);
  });
});
