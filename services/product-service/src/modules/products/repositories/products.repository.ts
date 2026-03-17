import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, SortOrder as MongooseSortOrder, Types, isValidObjectId } from 'mongoose';
import { ListProductsDto, ProductSortBy, SortOrder } from '../dto/list-products.dto';
import { Product, ProductDocument, ProductVariant } from '../entities/product.schema';
import { ProductStatus } from '../entities/product-status.enum';

export interface ProductPaginationResult {
  items: ProductDocument[];
  totalItems: number;
}

export interface CreateProductPayload {
  sellerId: string;
  name: string;
  slug: string;
  description?: string | null;
  categoryId: string;
  brand?: string | null;
  status: ProductStatus;
  attributes: Record<string, unknown>;
  images: string[];
  variants: ProductVariant[];
  minPrice: number;
}

export interface UpdateProductPayload {
  sellerId?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  categoryId?: string;
  brand?: string | null;
  status?: ProductStatus;
  attributes?: Record<string, unknown>;
  images?: string[];
  variants?: ProductVariant[];
  minPrice?: number;
  deletedAt?: Date | null;
}

@Injectable()
export class ProductsRepository {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<Product>
  ) {}

  async createProduct(payload: CreateProductPayload): Promise<ProductDocument> {
    const document = new this.productModel({
      ...payload,
      deletedAt: null
    });

    return document.save();
  }

  async findById(id: string, includeDeleted = false): Promise<ProductDocument | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const query: FilterQuery<Product> = { _id: new Types.ObjectId(id) };
    if (!includeDeleted) {
      query.deletedAt = null;
    }

    return this.productModel.findOne(query).exec() as Promise<ProductDocument | null>;
  }

  async findBySlug(slug: string, excludeId?: string): Promise<ProductDocument | null> {
    const query: FilterQuery<Product> = {
      slug,
      deletedAt: null
    };

    if (excludeId && isValidObjectId(excludeId)) {
      query._id = {
        $ne: new Types.ObjectId(excludeId)
      };
    }

    return this.productModel.findOne(query).exec() as Promise<ProductDocument | null>;
  }

  async findFirstBySkus(skus: string[], excludeId?: string): Promise<ProductDocument | null> {
    const query: FilterQuery<Product> = {
      deletedAt: null,
      'variants.sku': {
        $in: skus
      }
    };

    if (excludeId && isValidObjectId(excludeId)) {
      query._id = {
        $ne: new Types.ObjectId(excludeId)
      };
    }

    return this.productModel.findOne(query).exec() as Promise<ProductDocument | null>;
  }

  async listProducts(
    queryDto: ListProductsDto,
    fixed: {
      status?: ProductStatus;
      sellerId?: string;
      ids?: string[];
    } = {}
  ): Promise<ProductPaginationResult> {
    const page = queryDto.page ?? 1;
    const pageSize = queryDto.pageSize ?? 20;

    const query: FilterQuery<Product> = {
      deletedAt: null
    };

    if (fixed.status) {
      query.status = fixed.status;
    } else if (queryDto.status) {
      query.status = queryDto.status;
    }

    if (fixed.sellerId) {
      query.sellerId = fixed.sellerId;
    } else if (queryDto.sellerId) {
      query.sellerId = queryDto.sellerId;
    }

    if (queryDto.categoryId) {
      query.categoryId = queryDto.categoryId;
    }

    if (queryDto.brand) {
      query.brand = queryDto.brand;
    }

    if (queryDto.search) {
      const pattern = new RegExp(escapeRegex(queryDto.search.trim()), 'i');
      query.$or = [{ name: pattern }, { slug: pattern }, { brand: pattern }, { 'variants.sku': pattern }];
    }

    if (fixed.ids && fixed.ids.length > 0) {
      query._id = {
        $in: fixed.ids
          .filter((id) => isValidObjectId(id))
          .map((id) => new Types.ObjectId(id))
      };
    }

    const totalItems = await this.productModel.countDocuments(query).exec();

    const sort = this.resolveSort(queryDto.sortBy, queryDto.sortOrder);
    const items = (await this.productModel
      .find(query)
      .sort(sort)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .exec()) as ProductDocument[];

    return {
      items,
      totalItems
    };
  }

  async findByIdsOrdered(ids: string[]): Promise<ProductDocument[]> {
    const validIds = ids.filter((id) => isValidObjectId(id)).map((id) => new Types.ObjectId(id));
    if (validIds.length === 0) {
      return [];
    }

    const documents = (await this.productModel
      .find({
        _id: { $in: validIds },
        deletedAt: null
      })
      .exec()) as ProductDocument[];

    const index = new Map<string, ProductDocument>();
    documents.forEach((document) => {
      index.set(document.id, document);
    });

    return ids.map((id) => index.get(id)).filter((value): value is ProductDocument => Boolean(value));
  }

  async updateById(id: string, payload: UpdateProductPayload): Promise<ProductDocument | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    return this.productModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          deletedAt: null
        },
        payload,
        {
          new: true
        }
      )
      .exec() as Promise<ProductDocument | null>;
  }

  async softDelete(id: string): Promise<ProductDocument | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    return this.productModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          deletedAt: null
        },
        {
          deletedAt: new Date(),
          status: ProductStatus.ARCHIVED
        },
        {
          new: true
        }
      )
      .exec() as Promise<ProductDocument | null>;
  }

  private resolveSort(sortBy?: ProductSortBy, sortOrder?: SortOrder): Record<string, MongooseSortOrder> {
    const order: MongooseSortOrder = (sortOrder ?? SortOrder.DESC) === SortOrder.ASC ? 1 : -1;

    if (sortBy === ProductSortBy.NAME) {
      return { name: order };
    }

    if (sortBy === ProductSortBy.MIN_PRICE) {
      return { minPrice: order };
    }

    if (sortBy === ProductSortBy.UPDATED_AT) {
      return { updatedAt: order };
    }

    return { createdAt: order };
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
