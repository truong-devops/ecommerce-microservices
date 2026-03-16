import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DecimalTransformer } from './decimal.transformer';
import { ShipmentStatus } from './shipment-status.enum';
import { ShipmentTrackingEventEntity } from './shipment-tracking-event.entity';
import { ShipmentStatusHistoryEntity } from './shipment-status-history.entity';

@Entity({ name: 'shipments' })
export class ShipmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Index()
  @Column({ name: 'buyer_id', type: 'uuid' })
  buyerId!: string;

  @Index()
  @Column({ name: 'seller_id', type: 'uuid' })
  sellerId!: string;

  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  awb!: string | null;

  @Index()
  @Column({ name: 'tracking_number', type: 'varchar', length: 64, nullable: true })
  trackingNumber!: string | null;

  @Index()
  @Column({ type: 'enum', enum: ShipmentStatus })
  status!: ShipmentStatus;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'shipping_fee', type: 'numeric', precision: 14, scale: 2, transformer: DecimalTransformer })
  shippingFee!: number;

  @Column({ name: 'cod_amount', type: 'numeric', precision: 14, scale: 2, transformer: DecimalTransformer })
  codAmount!: number;

  @Column({ name: 'recipient_name', type: 'varchar', length: 255 })
  recipientName!: string;

  @Column({ name: 'recipient_phone', type: 'varchar', length: 32 })
  recipientPhone!: string;

  @Column({ name: 'recipient_address', type: 'varchar', length: 500 })
  recipientAddress!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => ShipmentTrackingEventEntity, (trackingEvent) => trackingEvent.shipment, { cascade: false })
  trackingEvents!: ShipmentTrackingEventEntity[];

  @OneToMany(() => ShipmentStatusHistoryEntity, (statusHistory) => statusHistory.shipment, { cascade: false })
  statusHistories!: ShipmentStatusHistoryEntity[];
}
