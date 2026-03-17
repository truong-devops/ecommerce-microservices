import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { NotificationCategory } from './notification-category.enum';
import { NotificationChannel } from './notification-channel.enum';
import { NotificationStatus } from './notification-status.enum';

@Entity({ name: 'notifications' })
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @Column({ type: 'enum', enum: NotificationChannel })
  channel!: NotificationChannel;

  @Column({ type: 'enum', enum: NotificationCategory })
  category!: NotificationCategory;

  @Index()
  @Column({ name: 'event_type', type: 'varchar', length: 128, nullable: true })
  eventType!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subject!: string | null;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @Index()
  @Column({ type: 'enum', enum: NotificationStatus, default: NotificationStatus.PENDING })
  status!: NotificationStatus;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount!: number;

  @Index()
  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt!: Date | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
