import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { InventoryReservationStatus } from './inventory-reservation-status.enum';

@Entity({ name: 'inventory_reservations' })
export class InventoryReservationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string;

  @Column({ type: 'varchar', length: 64 })
  sku!: string;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({
    type: 'enum',
    enum: InventoryReservationStatus
  })
  status!: InventoryReservationStatus;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'varchar', length: 64, name: 'request_id' })
  requestId!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
