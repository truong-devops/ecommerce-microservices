import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({
  collection: 'shop_decors',
  timestamps: {
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  },
  versionKey: false
})
export class ShopDecor {
  @Prop({ required: true, trim: true, unique: true, index: true })
  sellerId!: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  shopName!: string;

  @Prop({ type: String, default: '', trim: true, maxlength: 240 })
  slogan!: string;

  @Prop({ type: String, default: '', trim: true, maxlength: 500 })
  logoUrl!: string;

  @Prop({ type: String, default: '', trim: true, maxlength: 500 })
  bannerUrl!: string;

  @Prop({ type: String, default: '#ee4d2d', trim: true, maxlength: 20 })
  accentColor!: string;

  @Prop({ type: [String], default: [] })
  navItems!: string[];

  @Prop({ type: String, default: '', trim: true, maxlength: 180 })
  introTitle!: string;

  @Prop({ type: String, default: '', trim: true, maxlength: 500 })
  introDescription!: string;

  @Prop({ type: [String], default: [] })
  featuredCategories!: string[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type ShopDecorDocument = HydratedDocument<ShopDecor>;
export const ShopDecorSchema = SchemaFactory.createForClass(ShopDecor);

ShopDecorSchema.index({ sellerId: 1 }, { unique: true });
