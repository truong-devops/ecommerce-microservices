import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { ListReviewsDto, ReviewSortBy, SortOrder } from '../dto/list-reviews.dto';
import { ReviewDocument, ReviewEntity } from '../entities/review.entity';
import { ReviewStatus } from '../enums/review-status.enum';

interface ListFilters {
  userId?: string;
  isOwnView?: boolean;
  status?: ReviewStatus;
  query: ListReviewsDto;
}

@Injectable()
export class ReviewRepository {
  constructor(@InjectModel(ReviewEntity.name) private readonly reviewModel: Model<ReviewDocument>) {}

  async create(payload: Partial<ReviewEntity>): Promise<ReviewDocument> {
    const created = new this.reviewModel(payload);
    return created.save();
  }

  async findById(id: string): Promise<ReviewDocument | null> {
    return this.reviewModel.findById(id).exec();
  }

  async findActiveDuplicate(orderId: string, productId: string, buyerId: string): Promise<ReviewDocument | null> {
    return this.reviewModel
      .findOne({
        orderId,
        productId,
        buyerId,
        status: {
          $in: [ReviewStatus.PUBLISHED, ReviewStatus.HIDDEN, ReviewStatus.REJECTED]
        }
      })
      .exec();
  }

  async updateById(id: string, payload: Partial<ReviewEntity>): Promise<ReviewDocument | null> {
    return this.reviewModel.findByIdAndUpdate(id, payload, { new: true }).exec();
  }

  async list(filters: ListFilters): Promise<{ items: ReviewDocument[]; totalItems: number }> {
    const condition = this.buildCondition(filters);
    const page = filters.query.page ?? 1;
    const pageSize = filters.query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const totalItems = await this.reviewModel.countDocuments(condition).exec();

    const sortBy = filters.query.sortBy ?? ReviewSortBy.CREATED_AT;
    const sortOrder = (filters.query.sortOrder ?? SortOrder.DESC) === SortOrder.ASC ? 1 : -1;

    const items = await this.reviewModel
      .find(condition)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(pageSize)
      .exec();

    return {
      items,
      totalItems
    };
  }

  async getProductSummary(productId: string): Promise<{ averageRating: number; totalReviews: number; starDistribution: Record<string, number> }> {
    const matchCondition: FilterQuery<ReviewDocument> = {
      productId,
      status: ReviewStatus.PUBLISHED
    };

    const [aggregate] = await this.reviewModel
      .aggregate<{ _id: null; averageRating: number; totalReviews: number }>([
        {
          $match: matchCondition
        },
        {
          $group: {
            _id: null,
            averageRating: {
              $avg: '$rating'
            },
            totalReviews: {
              $sum: 1
            }
          }
        }
      ])
      .exec();

    const stars = await this.reviewModel
      .aggregate<{ _id: number; count: number }>([
        {
          $match: matchCondition
        },
        {
          $group: {
            _id: '$rating',
            count: {
              $sum: 1
            }
          }
        }
      ])
      .exec();

    const starDistribution: Record<string, number> = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0
    };

    for (const item of stars) {
      starDistribution[String(item._id)] = item.count;
    }

    if (!aggregate) {
      return {
        averageRating: 0,
        totalReviews: 0,
        starDistribution
      };
    }

    return {
      averageRating: Number(aggregate.averageRating.toFixed(2)),
      totalReviews: aggregate.totalReviews,
      starDistribution
    };
  }

  private buildCondition(filters: ListFilters): FilterQuery<ReviewDocument> {
    const condition: FilterQuery<ReviewDocument> = {
      status: filters.status ?? { $ne: ReviewStatus.DELETED }
    };

    if (filters.query.productId) {
      condition.productId = filters.query.productId;
    }

    if (filters.query.sellerId) {
      condition.sellerId = filters.query.sellerId;
    }

    if (filters.query.buyerId) {
      condition.buyerId = filters.query.buyerId;
    }

    if (filters.query.rating) {
      condition.rating = filters.query.rating;
    }

    const search = filters.query.search?.trim();
    if (search) {
      const regex = new RegExp(this.escapeRegex(search), 'i');
      condition.$or = [{ title: regex }, { content: regex }];
    }

    return condition;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
