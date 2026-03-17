import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Role } from '../../../common/constants/role.enum';
import { DecimalTransformer } from './decimal.transformer';
import { PaymentEntity } from './payment.entity';
import { RefundStatus } from './refund-status.enum';

@Entity({ name: 'refunds' })
export class RefundEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @Index({ unique: true })
  @Column({ name: 'provider_refund_id', type: 'varchar', length: 128, nullable: true })
  providerRefundId!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: DecimalTransformer })
  amount!: number;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Index()
  @Column({ type: 'enum', enum: RefundStatus })
  status!: RefundStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ name: 'requested_by', type: 'uuid' })
  requestedBy!: string;

  @Column({ name: 'requested_by_role', type: 'enum', enum: Role })
  requestedByRole!: Role;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @JoinColumn({ name: 'payment_id' })
  @ManyToOne(() => PaymentEntity, (payment) => payment.refunds, { onDelete: 'CASCADE' })
  payment!: PaymentEntity;
}
