import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '../../../common/constants/role.enum';

@Entity({ name: 'payment_audit_logs' })
export class PaymentAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @Column({ name: 'actor_role', type: 'enum', enum: Role })
  actorRole!: Role;

  @Column({ name: 'request_id', type: 'varchar', length: 64 })
  requestId!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
