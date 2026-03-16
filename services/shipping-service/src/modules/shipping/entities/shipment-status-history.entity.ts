import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '../../../common/constants/role.enum';
import { ShipmentEntity } from './shipment.entity';
import { ShipmentStatus } from './shipment-status.enum';

@Entity({ name: 'shipment_status_histories' })
export class ShipmentStatusHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'shipment_id', type: 'uuid' })
  shipmentId!: string;

  @Column({ name: 'from_status', type: 'enum', enum: ShipmentStatus, nullable: true })
  fromStatus!: ShipmentStatus | null;

  @Column({ name: 'to_status', type: 'enum', enum: ShipmentStatus })
  toStatus!: ShipmentStatus;

  @Column({ name: 'changed_by', type: 'uuid' })
  changedBy!: string;

  @Column({ name: 'changed_by_role', type: 'enum', enum: Role })
  changedByRole!: Role;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => ShipmentEntity, (shipment) => shipment.statusHistories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shipment_id' })
  shipment!: ShipmentEntity;
}
