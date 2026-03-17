import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { DecimalTransformer } from './decimal.transformer';
import { CartItemRecordEntity } from './cart-item-record.entity';

@Entity({ name: 'carts' })
@Index('idx_carts_user_id_unique', ['userId'], { unique: true })
export class CartRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: DecimalTransformer, default: 0 })
  subtotal!: number;

  @Column({ name: 'discount_total', type: 'numeric', precision: 12, scale: 2, transformer: DecimalTransformer, default: 0 })
  discountTotal!: number;

  @Column({ name: 'grand_total', type: 'numeric', precision: 12, scale: 2, transformer: DecimalTransformer, default: 0 })
  grandTotal!: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => CartItemRecordEntity, (item) => item.cart, { cascade: false })
  items!: CartItemRecordEntity[];
}
