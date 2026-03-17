import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '../../../common/constants/role.enum';
import { InventoryMovementType } from './inventory-movement-type.enum';

@Entity({ name: 'inventory_movements' })
export class InventoryMovementEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  sku!: string;

  @Column({ type: 'uuid', name: 'order_id', nullable: true })
  orderId!: string | null;

  @Column({
    type: 'enum',
    enum: InventoryMovementType,
    name: 'movement_type'
  })
  movementType!: InventoryMovementType;

  @Column({ type: 'integer', name: 'delta_on_hand' })
  deltaOnHand!: number;

  @Column({ type: 'integer', name: 'delta_reserved' })
  deltaReserved!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;

  @Column({ type: 'uuid', name: 'actor_id' })
  actorId!: string;

  @Column({
    type: 'enum',
    enum: Role,
    name: 'actor_role'
  })
  actorRole!: Role;

  @Column({ type: 'varchar', length: 64, name: 'request_id' })
  requestId!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
