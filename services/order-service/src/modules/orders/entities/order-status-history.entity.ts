import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '../../../common/constants/role.enum';
import { OrderEntity } from './order.entity';
import { OrderStatus } from './order-status.enum';

@Entity({ name: 'order_status_histories' })
export class OrderStatusHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'from_status', type: 'enum', enum: OrderStatus, nullable: true })
  fromStatus!: OrderStatus | null;

  @Column({ name: 'to_status', type: 'enum', enum: OrderStatus })
  toStatus!: OrderStatus;

  @Column({ name: 'changed_by', type: 'uuid' })
  changedBy!: string;

  @Column({ name: 'changed_by_role', type: 'enum', enum: Role })
  changedByRole!: Role;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => OrderEntity, (order) => order.statusHistories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: OrderEntity;
}
