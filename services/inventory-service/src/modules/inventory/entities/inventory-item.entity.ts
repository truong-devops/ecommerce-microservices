import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from 'typeorm';

@Entity({ name: 'inventory_items' })
export class InventoryItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  sku!: string;

  @Column({ type: 'uuid', name: 'product_id' })
  productId!: string;

  @Column({ type: 'uuid', name: 'seller_id' })
  sellerId!: string;

  @Column({ type: 'integer', name: 'on_hand' })
  onHand!: number;

  @Column({ type: 'integer', default: 0 })
  reserved!: number;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
