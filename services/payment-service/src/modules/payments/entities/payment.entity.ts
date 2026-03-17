import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DecimalTransformer } from './decimal.transformer';
import { PaymentStatus } from './payment-status.enum';
import { PaymentTransactionEntity } from './payment-transaction.entity';
import { PaymentStatusHistoryEntity } from './payment-status-history.entity';
import { RefundEntity } from './refund.entity';

@Entity({ name: 'payments' })
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ name: 'seller_id', type: 'uuid', nullable: true })
  sellerId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @Index({ unique: true })
  @Column({ name: 'provider_payment_id', type: 'varchar', length: 128, nullable: true })
  providerPaymentId!: string | null;

  @Index()
  @Column({ type: 'enum', enum: PaymentStatus })
  status!: PaymentStatus;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: DecimalTransformer })
  amount!: number;

  @Column({ name: 'refunded_amount', type: 'numeric', precision: 14, scale: 2, transformer: DecimalTransformer, default: 0 })
  refundedAmount!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => PaymentTransactionEntity, (transaction) => transaction.payment, { cascade: false })
  transactions!: PaymentTransactionEntity[];

  @OneToMany(() => PaymentStatusHistoryEntity, (statusHistory) => statusHistory.payment, { cascade: false })
  statusHistories!: PaymentStatusHistoryEntity[];

  @OneToMany(() => RefundEntity, (refund) => refund.payment, { cascade: false })
  refunds!: RefundEntity[];
}
