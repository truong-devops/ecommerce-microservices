import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThanOrEqual, Repository, SelectQueryBuilder } from 'typeorm';
import { ListNotificationsDto, NotificationSortBy, SortOrder } from '../dto/list-notifications.dto';
import { NotificationEntity } from '../entities/notification.entity';
import { NotificationStatus } from '../entities/notification-status.enum';

@Injectable()
export class NotificationRepository {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly repository: Repository<NotificationEntity>
  ) {}

  async save(notification: Partial<NotificationEntity>, manager?: EntityManager): Promise<NotificationEntity> {
    const repo = manager ? manager.getRepository(NotificationEntity) : this.repository;
    return repo.save(notification);
  }

  async saveMany(notifications: Partial<NotificationEntity>[], manager?: EntityManager): Promise<NotificationEntity[]> {
    const repo = manager ? manager.getRepository(NotificationEntity) : this.repository;
    return repo.save(notifications);
  }

  async findById(notificationId: string): Promise<NotificationEntity | null> {
    return this.repository.findOne({
      where: { id: notificationId }
    });
  }

  async findByIdForUpdate(notificationId: string, manager: EntityManager): Promise<NotificationEntity | null> {
    return manager.getRepository(NotificationEntity).findOne({
      where: { id: notificationId },
      lock: {
        mode: 'pessimistic_write'
      }
    });
  }

  async list(query: ListNotificationsDto, forcedRecipientId?: string): Promise<{ items: NotificationEntity[]; totalItems: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy ?? NotificationSortBy.CREATED_AT;
    const sortOrder = query.sortOrder ?? SortOrder.DESC;

    const qb = this.repository.createQueryBuilder('notification');

    this.applyFilters(qb, query, forcedRecipientId);

    const orderByMap: Record<NotificationSortBy, string> = {
      [NotificationSortBy.CREATED_AT]: 'notification.created_at',
      [NotificationSortBy.SENT_AT]: 'notification.sent_at',
      [NotificationSortBy.STATUS]: 'notification.status'
    };

    qb.orderBy(orderByMap[sortBy], sortOrder).skip((page - 1) * pageSize).take(pageSize);

    const [items, totalItems] = await qb.getManyAndCount();

    return { items, totalItems };
  }

  async findDispatchable(batchSize: number): Promise<NotificationEntity[]> {
    return this.repository.find({
      where: [
        {
          status: NotificationStatus.PENDING
        },
        {
          status: NotificationStatus.FAILED,
          nextRetryAt: LessThanOrEqual(new Date())
        }
      ],
      order: {
        createdAt: 'ASC'
      },
      take: batchSize
    });
  }

  async markSent(id: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(NotificationEntity) : this.repository;
    await repo.update(
      { id },
      {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        nextRetryAt: null
      }
    );
  }

  async markFailed(id: string, retryCount: number, nextRetryAt: Date | null, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(NotificationEntity) : this.repository;
    await repo.update(
      { id },
      {
        status: NotificationStatus.FAILED,
        retryCount,
        nextRetryAt
      }
    );
  }

  private applyFilters(qb: SelectQueryBuilder<NotificationEntity>, query: ListNotificationsDto, forcedRecipientId?: string): void {
    qb.where('1=1');

    if (query.status) {
      qb.andWhere('notification.status = :status', { status: query.status });
    }

    if (query.channel) {
      qb.andWhere('notification.channel = :channel', { channel: query.channel });
    }

    if (query.category) {
      qb.andWhere('notification.category = :category', { category: query.category });
    }

    if (query.eventType) {
      qb.andWhere('notification.event_type = :eventType', { eventType: query.eventType });
    }

    if (forcedRecipientId) {
      qb.andWhere('notification.recipient_id = :recipientId', { recipientId: forcedRecipientId });
    } else if (query.recipientId) {
      qb.andWhere('notification.recipient_id = :recipientId', { recipientId: query.recipientId });
    }

    if (query.search) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere('(notification.subject ILIKE :search OR notification.content ILIKE :search)', { search });
    }
  }
}
