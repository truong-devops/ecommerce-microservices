import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { ProductVideoStatus } from './product-video-status.enum';

@Schema({ _id: false, versionKey: false })
export class VideoProductTagPosition {
  @Prop({ type: Number, min: 0, max: 100, default: null })
  x?: number | null;

  @Prop({ type: Number, min: 0, max: 100, default: null })
  y?: number | null;

  @Prop({ type: Number, min: 0, default: null })
  startSec?: number | null;

  @Prop({ type: Number, min: 0, default: null })
  endSec?: number | null;
}

export const VideoProductTagPositionSchema = SchemaFactory.createForClass(VideoProductTagPosition);

@Schema({ _id: false, versionKey: false })
export class VideoProductTag {
  @Prop({ required: true, trim: true, index: true })
  productId!: string;

  @Prop({ type: String, default: null, trim: true })
  sku?: string | null;

  @Prop({ required: true, trim: true })
  nameSnapshot!: string;

  @Prop({ type: String, default: null, trim: true })
  imageSnapshot?: string | null;

  @Prop({ type: Number, required: true, min: 0 })
  priceSnapshot!: number;

  @Prop({ required: true, uppercase: true, minlength: 3, maxlength: 3 })
  currencySnapshot!: string;

  @Prop({ required: true, trim: true })
  statusSnapshot!: string;

  @Prop({ type: Number, required: true, min: 1 })
  sortOrder!: number;

  @Prop({ type: VideoProductTagPositionSchema, default: null })
  tagPosition?: VideoProductTagPosition | null;
}

export const VideoProductTagSchema = SchemaFactory.createForClass(VideoProductTag);

@Schema({ _id: false, versionKey: false })
export class VideoModeration {
  @Prop({ type: Date, default: null })
  submittedAt?: Date | null;

  @Prop({ type: Date, default: null })
  reviewedAt?: Date | null;

  @Prop({ type: String, default: null, trim: true })
  reviewedBy?: string | null;

  @Prop({ type: String, default: null, trim: true })
  rejectionReason?: string | null;

  @Prop({ type: [String], default: [] })
  policyFlags!: string[];
}

export const VideoModerationSchema = SchemaFactory.createForClass(VideoModeration);

@Schema({ _id: false, versionKey: false })
export class VideoMetricsSnapshot {
  @Prop({ type: Number, default: 0, min: 0 })
  viewStartedCount!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  qualifiedViewCount!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  productClickCount!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  addToCartCount!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  ctr!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  addToCartRate!: number;

  @Prop({ type: Date, default: null })
  lastAggregatedAt?: Date | null;
}

export const VideoMetricsSnapshotSchema = SchemaFactory.createForClass(VideoMetricsSnapshot);

@Schema({
  collection: 'product_videos',
  timestamps: {
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  },
  versionKey: false
})
export class ProductVideo {
  @Prop({ required: true, trim: true, unique: true, index: true })
  videoId!: string;

  @Prop({ required: true, trim: true, index: true })
  sellerId!: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  title!: string;

  @Prop({ type: String, default: null, trim: true, maxlength: 1000 })
  description?: string | null;

  @Prop({ type: String, enum: ProductVideoStatus, default: ProductVideoStatus.DRAFT, index: true })
  status!: ProductVideoStatus;

  @Prop({ type: String, default: null, trim: true })
  mediaObjectKey?: string | null;

  @Prop({ type: String, default: null, trim: true })
  mediaUrl?: string | null;

  @Prop({ type: String, default: null, trim: true })
  thumbnailObjectKey?: string | null;

  @Prop({ type: String, default: null, trim: true })
  thumbnailUrl?: string | null;

  @Prop({ type: String, default: null, trim: true })
  mimeType?: string | null;

  @Prop({ type: Number, default: null, min: 0 })
  sizeBytes?: number | null;

  @Prop({ type: Number, default: null, min: 0 })
  durationSec?: number | null;

  @Prop({ type: [VideoProductTagSchema], default: [] })
  products!: VideoProductTag[];

  @Prop({ type: VideoModerationSchema, default: () => ({ policyFlags: [] }) })
  moderation!: VideoModeration;

  @Prop({ type: VideoMetricsSnapshotSchema, default: () => ({}) })
  metricsSnapshot!: VideoMetricsSnapshot;

  @Prop({ type: [String], default: [], select: false })
  recentEventKeys!: string[];

  @Prop({ type: Date, default: null, index: true })
  publishedAt?: Date | null;

  @Prop({ type: Date, default: null })
  hiddenAt?: Date | null;

  @Prop({ type: Date, default: null, index: true })
  archivedAt?: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ProductVideoDocument = HydratedDocument<ProductVideo>;
export const ProductVideoSchema = SchemaFactory.createForClass(ProductVideo);

ProductVideoSchema.index({ sellerId: 1, createdAt: -1 });
ProductVideoSchema.index({ sellerId: 1, status: 1, updatedAt: -1 });
ProductVideoSchema.index({ status: 1, publishedAt: -1 });
ProductVideoSchema.index({ 'products.productId': 1, status: 1 });
