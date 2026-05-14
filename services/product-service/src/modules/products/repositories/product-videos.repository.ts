import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { ListProductVideosDto } from '../dto/product-video.dto';
import { ProductVideo, ProductVideoDocument, VideoProductTag } from '../entities/product-video.schema';
import { ProductVideoStatus } from '../entities/product-video-status.enum';

export interface ProductVideoPaginationResult {
  items: ProductVideoDocument[];
  totalItems: number;
}

export interface CreateProductVideoPayload {
  videoId: string;
  sellerId: string;
  title: string;
  description: string | null;
  status: ProductVideoStatus;
  products: VideoProductTag[];
}

export interface UpdateProductVideoPayload {
  title?: string;
  description?: string | null;
  status?: ProductVideoStatus;
  mediaObjectKey?: string | null;
  mediaUrl?: string | null;
  thumbnailObjectKey?: string | null;
  thumbnailUrl?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationSec?: number | null;
  products?: VideoProductTag[];
  publishedAt?: Date | null;
  hiddenAt?: Date | null;
  archivedAt?: Date | null;
  moderation?: Record<string, unknown>;
}

@Injectable()
export class ProductVideosRepository {
  constructor(
    @InjectModel(ProductVideo.name)
    private readonly productVideoModel: Model<ProductVideo>
  ) {}

  async createVideo(payload: CreateProductVideoPayload): Promise<ProductVideoDocument> {
    const document = new this.productVideoModel({
      ...payload,
      mediaObjectKey: null,
      mediaUrl: null,
      thumbnailObjectKey: null,
      thumbnailUrl: null,
      mimeType: null,
      sizeBytes: null,
      durationSec: null,
      publishedAt: null,
      hiddenAt: null,
      archivedAt: null,
      moderation: { policyFlags: [] },
      metricsSnapshot: {
        viewStartedCount: 0,
        qualifiedViewCount: 0,
        productClickCount: 0,
        addToCartCount: 0,
        ctr: 0,
        addToCartRate: 0,
        lastAggregatedAt: null
      },
      recentEventKeys: []
    });

    return document.save();
  }

  async findByVideoId(videoId: string, includeArchived = false): Promise<ProductVideoDocument | null> {
    const query: FilterQuery<ProductVideo> = { videoId: videoId.trim() };
    if (!includeArchived) {
      query.archivedAt = null;
    }

    return this.productVideoModel.findOne(query).exec() as Promise<ProductVideoDocument | null>;
  }

  async updateByVideoId(videoId: string, payload: UpdateProductVideoPayload): Promise<ProductVideoDocument | null> {
    return this.productVideoModel
      .findOneAndUpdate(
        {
          videoId: videoId.trim(),
          archivedAt: null
        },
        payload,
        { new: true }
      )
      .exec() as Promise<ProductVideoDocument | null>;
  }

  async listManaged(queryDto: ListProductVideosDto, sellerId?: string): Promise<ProductVideoPaginationResult> {
    const query = this.buildBaseQuery(queryDto);
    if (sellerId) {
      query.sellerId = sellerId;
    } else if (queryDto.sellerId) {
      query.sellerId = queryDto.sellerId.trim();
    }

    return this.list(query, queryDto);
  }

  async listFeed(queryDto: ListProductVideosDto): Promise<ProductVideoPaginationResult> {
    const query = this.buildBaseQuery(queryDto);
    query.status = ProductVideoStatus.PUBLISHED;
    query.publishedAt = { $ne: null };

    return this.list(query, queryDto, { publishedAt: -1, createdAt: -1 });
  }

  async incrementMetrics(videoId: string, increments: Partial<Record<'viewStartedCount' | 'qualifiedViewCount' | 'productClickCount' | 'addToCartCount', number>>): Promise<void> {
    const update: Record<string, number> = {};
    for (const [key, value] of Object.entries(increments)) {
      if (value && value > 0) {
        update[`metricsSnapshot.${key}`] = value;
      }
    }

    if (Object.keys(update).length === 0) {
      return;
    }

    await this.productVideoModel
      .updateOne(
        {
          videoId: videoId.trim(),
          status: ProductVideoStatus.PUBLISHED,
          archivedAt: null
        },
        {
          $inc: update,
          $set: {
            'metricsSnapshot.lastAggregatedAt': new Date()
          }
        }
      )
      .exec();
  }

  async incrementMetricsOnce(
    videoId: string,
    eventKey: string,
    increments: Partial<Record<'viewStartedCount' | 'qualifiedViewCount' | 'productClickCount' | 'addToCartCount', number>>
  ): Promise<boolean> {
    const update: Record<string, number> = {};
    for (const [key, value] of Object.entries(increments)) {
      if (value && value > 0) {
        update[`metricsSnapshot.${key}`] = value;
      }
    }

    if (Object.keys(update).length === 0) {
      return false;
    }

    const result = await this.productVideoModel
      .updateOne(
        {
          videoId: videoId.trim(),
          status: ProductVideoStatus.PUBLISHED,
          archivedAt: null,
          recentEventKeys: { $ne: eventKey }
        },
        {
          $inc: update,
          $set: {
            'metricsSnapshot.lastAggregatedAt': new Date()
          },
          $push: {
            recentEventKeys: {
              $each: [eventKey],
              $slice: -500
            }
          }
        }
      )
      .exec();

    return result.modifiedCount > 0;
  }

  private buildBaseQuery(queryDto: ListProductVideosDto): FilterQuery<ProductVideo> {
    const query: FilterQuery<ProductVideo> = {
      archivedAt: null
    };

    if (queryDto.status) {
      query.status = queryDto.status;
    }

    if (queryDto.productId) {
      query['products.productId'] = queryDto.productId.trim();
    }

    if (queryDto.search?.trim()) {
      query.title = new RegExp(escapeRegex(queryDto.search.trim()), 'i');
    }

    return query;
  }

  private async list(
    query: FilterQuery<ProductVideo>,
    queryDto: ListProductVideosDto,
    sort: Record<string, 1 | -1> = { updatedAt: -1, createdAt: -1 }
  ): Promise<ProductVideoPaginationResult> {
    const page = queryDto.page ?? 1;
    const pageSize = queryDto.pageSize ?? 20;
    const totalItems = await this.productVideoModel.countDocuments(query).exec();
    const items = (await this.productVideoModel
      .find(query)
      .sort(sort)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .exec()) as ProductVideoDocument[];

    return { items, totalItems };
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
