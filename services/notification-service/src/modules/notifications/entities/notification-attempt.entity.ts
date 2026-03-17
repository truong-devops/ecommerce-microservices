import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'notification_attempts' })
export class NotificationAttemptEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'notification_id', type: 'uuid' })
  notificationId!: string;

  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: string;

  @Column({ name: 'response_message', type: 'varchar', length: 500, nullable: true })
  responseMessage!: string | null;

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'attempted_at', type: 'timestamptz' })
  attemptedAt!: Date;
}
