import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'inbox_events' })
export class InboxEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'event_key', type: 'varchar', length: 128 })
  eventKey!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 128 })
  eventType!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ name: 'consumed_at', type: 'timestamptz' })
  consumedAt!: Date;
}
