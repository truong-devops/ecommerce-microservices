import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '../../../common/constants/role.enum';
import { PaymentStatus } from './payment-status.enum';
import { PaymentEntity } from './payment.entity';

@Entity({ name: 'payment_status_histories' })
export class PaymentStatusHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @Column({ name: 'from_status', type: 'enum', enum: PaymentStatus, nullable: true })
  fromStatus!: PaymentStatus | null;

  @Column({ name: 'to_status', type: 'enum', enum: PaymentStatus })
  toStatus!: PaymentStatus;

  @Column({ name: 'changed_by', type: 'uuid' })
  changedBy!: string;

  @Column({ name: 'changed_by_role', type: 'enum', enum: Role })
  changedByRole!: Role;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @JoinColumn({ name: 'payment_id' })
  @ManyToOne(() => PaymentEntity, (payment) => payment.statusHistories, { onDelete: 'CASCADE' })
  payment!: PaymentEntity;
}
