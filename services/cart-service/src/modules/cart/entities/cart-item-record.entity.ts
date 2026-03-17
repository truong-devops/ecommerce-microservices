import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { DecimalTransformer } from './decimal.transformer';
import { CartRecordEntity } from './cart-record.entity';

@Entity({ name: 'cart_items' })
@Index('idx_cart_items_cart_id', ['cartId'])
@Index('idx_cart_items_merge_key', ['cartId', 'productId', 'variantId', 'sellerId'])
export class CartItemRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'cart_id', type: 'uuid' })
  cartId!: string;

  @ManyToOne(() => CartRecordEntity, (cart) => cart.items, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'cart_id' })
  cart!: CartRecordEntity;

  @Column({ name: 'product_id', type: 'varchar', length: 64 })
  productId!: string;

  @Column({ name: 'variant_id', type: 'varchar', length: 64, nullable: true })
  variantId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  sku!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  image!: string | null;

  @Column({ name: 'unit_price', type: 'numeric', precision: 12, scale: 2, transformer: DecimalTransformer })
  unitPrice!: number;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ name: 'line_total', type: 'numeric', precision: 12, scale: 2, transformer: DecimalTransformer })
  lineTotal!: number;

  @Column({ name: 'seller_id', type: 'varchar', length: 64 })
  sellerId!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
