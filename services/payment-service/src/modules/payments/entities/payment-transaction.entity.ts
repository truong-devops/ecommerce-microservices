import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PaymentEntity } from './payment.entity';
import { DecimalTransformer } from './decimal.transformer';
import { PaymentTransactionType } from './payment-transaction-type.enum';

@Entity({ name: 'payment_transactions' })
export class PaymentTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @Column({ name: 'transaction_type', type: 'enum', enum: PaymentTransactionType })
  transactionType!: PaymentTransactionType;

  @Index({ unique: true })
  @Column({ name: 'gateway_transaction_id', type: 'varchar', length: 128, nullable: true })
  gatewayTransactionId!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: DecimalTransformer })
  amount!: number;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 64 })
  status!: string;

  @Column({ name: 'request_id', type: 'varchar', length: 64 })
  requestId!: string;

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @JoinColumn({ name: 'payment_id' })
  @ManyToOne(() => PaymentEntity, (payment) => payment.transactions, { onDelete: 'CASCADE' })
  payment!: PaymentEntity;
}
