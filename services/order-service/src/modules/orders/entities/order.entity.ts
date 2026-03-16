import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DecimalTransformer } from './decimal.transformer';
import { OrderItemEntity } from './order-item.entity';
import { OrderStatusHistoryEntity } from './order-status-history.entity';
import { OrderStatus } from './order-status.enum';

@Entity({ name: 'orders' })
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'order_number', type: 'varchar', length: 32 })
  orderNumber!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'enum', enum: OrderStatus })
  status!: OrderStatus;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'subtotal_amount', type: 'numeric', precision: 14, scale: 2, transformer: DecimalTransformer })
  subtotalAmount!: number;

  @Column({ name: 'shipping_amount', type: 'numeric', precision: 14, scale: 2, transformer: DecimalTransformer })
  shippingAmount!: number;

  @Column({ name: 'discount_amount', type: 'numeric', precision: 14, scale: 2, transformer: DecimalTransformer })
  discountAmount!: number;

  @Column({ name: 'total_amount', type: 'numeric', precision: 14, scale: 2, transformer: DecimalTransformer })
  totalAmount!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => OrderItemEntity, (item) => item.order, { cascade: false })
  items!: OrderItemEntity[];

  @OneToMany(() => OrderStatusHistoryEntity, (history) => history.order, { cascade: false })
  statusHistories!: OrderStatusHistoryEntity[];
}
