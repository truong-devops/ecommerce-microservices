import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ReviewStatus } from '../enums/review-status.enum';

export interface ReviewReply {
  content: string;
  repliedBy: string;
  repliedAt: Date;
}

@Schema({
  collection: 'reviews',
  timestamps: true,
  versionKey: false
})
export class ReviewEntity {
  @Prop({ required: true })
  orderId!: string;

  @Prop({ required: true })
  productId!: string;

  @Prop({ required: true })
  sellerId!: string;

  @Prop({ required: true })
  buyerId!: string;

  @Prop({ required: true, min: 1, max: 5 })
  rating!: number;

  @Prop({ maxlength: 120 })
  title?: string;

  @Prop({ required: true, maxlength: 2000 })
  content!: string;

  @Prop({ type: [String], default: [] })
  images!: string[];

  @Prop({ type: String, required: true, enum: ReviewStatus, default: ReviewStatus.PUBLISHED })
  status!: ReviewStatus;

  @Prop({ maxlength: 500 })
  moderationReason?: string;

  @Prop()
  moderatedBy?: string;

  @Prop()
  moderatedAt?: Date;

  @Prop({ type: Object })
  reply?: ReviewReply;

  @Prop()
  deletedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ReviewDocument = HydratedDocument<ReviewEntity>;

export const ReviewSchema = SchemaFactory.createForClass(ReviewEntity);

ReviewSchema.index(
  { orderId: 1, productId: 1, buyerId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [ReviewStatus.PUBLISHED, ReviewStatus.HIDDEN, ReviewStatus.REJECTED]
      }
    }
  }
);
ReviewSchema.index({ productId: 1, status: 1, createdAt: -1 });
ReviewSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
