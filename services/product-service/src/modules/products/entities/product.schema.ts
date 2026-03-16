import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { ProductStatus } from './product-status.enum';

@Schema({ _id: false, versionKey: false })
export class ProductVariant {
  @Prop({ required: true, trim: true })
  sku!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, min: 0 })
  price!: number;

  @Prop({ required: true, uppercase: true, minlength: 3, maxlength: 3 })
  currency!: string;

  @Prop({ type: Number, min: 0, default: null })
  compareAtPrice?: number | null;

  @Prop({ default: false })
  isDefault!: boolean;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata!: Record<string, unknown>;
}

export const ProductVariantSchema = SchemaFactory.createForClass(ProductVariant);

@Schema({
  collection: 'products',
  timestamps: {
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  },
  versionKey: false
})
export class Product {
  @Prop({ required: true, trim: true, index: true })
  sellerId!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  slug!: string;

  @Prop({ type: String, default: null })
  description?: string | null;

  @Prop({ required: true, trim: true, index: true })
  categoryId!: string;

  @Prop({ type: String, default: null, trim: true, index: true })
  brand?: string | null;

  @Prop({ type: String, enum: ProductStatus, default: ProductStatus.DRAFT, index: true })
  status!: ProductStatus;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  attributes!: Record<string, unknown>;

  @Prop({ type: [String], default: [] })
  images!: string[];

  @Prop({ type: [ProductVariantSchema], default: [] })
  variants!: ProductVariant[];

  @Prop({ type: Number, required: true, default: 0, index: true })
  minPrice!: number;

  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ProductDocument = HydratedDocument<Product>;
export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
ProductSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
ProductSchema.index({ status: 1, categoryId: 1, brand: 1, minPrice: 1, createdAt: -1 });
ProductSchema.index({ name: 'text', description: 'text', brand: 'text', slug: 'text' });
