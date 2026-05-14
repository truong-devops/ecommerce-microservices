import { randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { BUYER_ROLES, Role, SELLER_ROLES, STAFF_ROLES } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import {
  ConfirmVideoMediaDto,
  ConfirmVideoThumbnailDto,
  CreateProductVideoDto,
  ListProductVideosDto,
  TrackVideoEventDto,
  UpdateProductVideoDto,
  VideoProductInputDto
} from '../dto/product-video.dto';
import { ProductVideoDocument, VideoProductTag } from '../entities/product-video.schema';
import { ProductVideoStatus } from '../entities/product-video-status.enum';
import { ProductStatus } from '../entities/product-status.enum';
import { ProductDocument } from '../entities/product.schema';
import { ProductVideosRepository } from '../repositories/product-videos.repository';
import { ProductsRepository } from '../repositories/products.repository';

interface ProductVideoResponse {
  videoId: string;
  sellerId: string;
  title: string;
  description: string | null;
  status: ProductVideoStatus;
  mediaObjectKey: string | null;
  mediaUrl: string | null;
  thumbnailObjectKey: string | null;
  thumbnailUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationSec: number | null;
  products: Array<{
    productId: string;
    sku: string | null;
    name: string;
    image: string | null;
    price: number;
    currency: string;
    status: string;
    sortOrder: number;
    tagPosition: unknown | null;
  }>;
  seller: {
    sellerId: string;
    sellerCode: string;
    shopName: string;
  };
  metrics: {
    viewStartedCount: number;
    qualifiedViewCount: number;
    productClickCount: number;
    addToCartCount: number;
    ctr: number;
    addToCartRate: number;
    lastAggregatedAt: string | null;
  };
  publishedAt: string | null;
  hiddenAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ProductVideosService {
  private readonly mediaPublicBaseUrl: string;
  private readonly reviewRequired: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly productVideosRepository: ProductVideosRepository,
    private readonly productsRepository: ProductsRepository
  ) {
    this.mediaPublicBaseUrl = normalizeMediaPublicBaseUrl(
      this.configService.get<string>('media.publicBaseUrl', 'http://localhost:12030/ecommerce-media')
    );
    this.reviewRequired = this.configService.get<boolean>('video.reviewRequired', false);
  }

  async createVideo(user: AuthenticatedUserContext, dto: CreateProductVideoDto): Promise<ProductVideoResponse> {
    const sellerId = this.resolveSellerId(user, dto.sellerId);
    const products = await this.buildProductTags(sellerId, dto.products);

    const created = await this.productVideosRepository.createVideo({
      videoId: randomUUID(),
      sellerId,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      status: ProductVideoStatus.DRAFT,
      products
    });

    return this.toResponse(created);
  }

  async updateVideo(user: AuthenticatedUserContext, videoId: string, dto: UpdateProductVideoDto): Promise<ProductVideoResponse> {
    const existing = await this.requireVideo(videoId);
    this.assertCanManageVideo(user, existing);
    this.assertEditable(existing);

    const payload: Record<string, unknown> = {};
    if (dto.title !== undefined) {
      payload.title = dto.title.trim();
    }
    if (dto.description !== undefined) {
      payload.description = dto.description?.trim() || null;
    }
    if (dto.products !== undefined) {
      payload.products = await this.buildProductTags(existing.sellerId, dto.products);
    }

    const updated = await this.productVideosRepository.updateByVideoId(existing.videoId, payload);
    if (!updated) {
      throwVideoNotFound();
    }

    return this.toResponse(updated);
  }

  async confirmMedia(user: AuthenticatedUserContext, videoId: string, dto: ConfirmVideoMediaDto): Promise<ProductVideoResponse> {
    const existing = await this.requireVideo(videoId);
    this.assertCanManageVideo(user, existing);
    this.assertEditable(existing);

    const updated = await this.productVideosRepository.updateByVideoId(existing.videoId, {
      mediaObjectKey: dto.mediaObjectKey.trim(),
      mediaUrl: normalizeOptionalString(dto.mediaUrl),
      mimeType: dto.mimeType.trim().toLowerCase(),
      sizeBytes: dto.sizeBytes ?? null,
      durationSec: dto.durationSec ?? null,
      status: ProductVideoStatus.PROCESSING
    });
    if (!updated) {
      throwVideoNotFound();
    }

    return this.toResponse(updated);
  }

  async confirmThumbnail(user: AuthenticatedUserContext, videoId: string, dto: ConfirmVideoThumbnailDto): Promise<ProductVideoResponse> {
    const existing = await this.requireVideo(videoId);
    this.assertCanManageVideo(user, existing);
    this.assertEditable(existing);

    const updated = await this.productVideosRepository.updateByVideoId(existing.videoId, {
      thumbnailObjectKey: dto.thumbnailObjectKey.trim(),
      thumbnailUrl: normalizeOptionalString(dto.thumbnailUrl)
    });
    if (!updated) {
      throwVideoNotFound();
    }

    return this.toResponse(updated);
  }

  async submitReview(user: AuthenticatedUserContext, videoId: string): Promise<ProductVideoResponse> {
    const existing = await this.requireVideo(videoId);
    this.assertCanManageVideo(user, existing);
    this.assertReadyForPublish(existing);

    const status = this.reviewRequired ? ProductVideoStatus.REVIEW_PENDING : ProductVideoStatus.PUBLISHED;
    const now = new Date();
    const updated = await this.productVideosRepository.updateByVideoId(existing.videoId, {
      status,
      publishedAt: status === ProductVideoStatus.PUBLISHED ? existing.publishedAt ?? now : existing.publishedAt ?? null,
      moderation: {
        ...existing.moderation,
        submittedAt: now
      }
    });
    if (!updated) {
      throwVideoNotFound();
    }

    return this.toResponse(updated);
  }

  async publishVideo(user: AuthenticatedUserContext, videoId: string): Promise<ProductVideoResponse> {
    const existing = await this.requireVideo(videoId);
    this.assertCanManageVideo(user, existing);
    this.assertReadyForPublish(existing);

    const updated = await this.productVideosRepository.updateByVideoId(existing.videoId, {
      status: ProductVideoStatus.PUBLISHED,
      publishedAt: existing.publishedAt ?? new Date(),
      hiddenAt: null
    });
    if (!updated) {
      throwVideoNotFound();
    }

    return this.toResponse(updated);
  }

  async unpublishVideo(user: AuthenticatedUserContext, videoId: string): Promise<ProductVideoResponse> {
    const existing = await this.requireVideo(videoId);
    this.assertCanManageVideo(user, existing);

    if (existing.status !== ProductVideoStatus.PUBLISHED) {
      throw new UnprocessableEntityException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Only published videos can be unpublished'
      });
    }

    const updated = await this.productVideosRepository.updateByVideoId(existing.videoId, {
      status: ProductVideoStatus.HIDDEN,
      hiddenAt: new Date()
    });
    if (!updated) {
      throwVideoNotFound();
    }

    return this.toResponse(updated);
  }

  async archiveVideo(user: AuthenticatedUserContext, videoId: string): Promise<ProductVideoResponse> {
    const existing = await this.requireVideo(videoId);
    this.assertCanManageVideo(user, existing);

    const updated = await this.productVideosRepository.updateByVideoId(existing.videoId, {
      status: ProductVideoStatus.ARCHIVED,
      archivedAt: new Date()
    });
    if (!updated) {
      throwVideoNotFound();
    }

    return this.toResponse(updated);
  }

  async listManagedVideos(user: AuthenticatedUserContext, query: ListProductVideosDto): Promise<{ items: ProductVideoResponse[]; pagination: PaginationResponse }> {
    const normalized = normalizePagination(query);
    const sellerId = SELLER_ROLES.includes(user.role) ? user.userId : undefined;
    const { items, totalItems } = await this.productVideosRepository.listManaged(normalized, sellerId);

    return {
      items: items.map((item) => this.toResponse(item)),
      pagination: buildPagination(normalized.page!, normalized.pageSize!, totalItems)
    };
  }

  async listFeed(query: ListProductVideosDto): Promise<{ items: ProductVideoResponse[]; pagination: PaginationResponse }> {
    const normalized = normalizePagination(query);
    const { items, totalItems } = await this.productVideosRepository.listFeed(normalized);

    return {
      items: items.map((item) => this.toResponse(item)),
      pagination: buildPagination(normalized.page!, normalized.pageSize!, totalItems)
    };
  }

  async getPublicVideo(videoId: string): Promise<ProductVideoResponse> {
    const video = await this.requireVideo(videoId);
    if (video.status !== ProductVideoStatus.PUBLISHED) {
      throwVideoNotFound();
    }

    return this.toResponse(video);
  }

  async trackEvent(videoId: string, eventType: 'view-started' | 'view-qualified' | 'product-clicked' | 'add-to-cart', _dto: TrackVideoEventDto): Promise<{ accepted: true }> {
    const video = await this.requireVideo(videoId);
    if (video.status !== ProductVideoStatus.PUBLISHED) {
      throwVideoNotFound();
    }

    const increments = {
      'view-started': { viewStartedCount: 1 },
      'view-qualified': { qualifiedViewCount: 1 },
      'product-clicked': { productClickCount: 1 },
      'add-to-cart': { addToCartCount: 1 }
    }[eventType];

    await this.productVideosRepository.incrementMetrics(video.videoId, increments);
    return { accepted: true };
  }

  private async requireVideo(videoId: string): Promise<ProductVideoDocument> {
    const video = await this.productVideosRepository.findByVideoId(videoId);
    if (!video) {
      throwVideoNotFound();
    }
    return video;
  }

  private resolveSellerId(user: AuthenticatedUserContext, requestedSellerId?: string): string {
    if (SELLER_ROLES.includes(user.role)) {
      if (requestedSellerId && requestedSellerId !== user.userId) {
        throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'Seller cannot create videos for another seller' });
      }
      return user.userId;
    }

    if (isStaff(user.role)) {
      if (!requestedSellerId) {
        throw new UnprocessableEntityException({ code: ErrorCode.VALIDATION_FAILED, message: 'sellerId is required for staff-created videos' });
      }
      return requestedSellerId;
    }

    throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'Role cannot create videos' });
  }

  private assertCanManageVideo(user: AuthenticatedUserContext, video: ProductVideoDocument): void {
    if (isStaff(user.role)) {
      return;
    }

    if (SELLER_ROLES.includes(user.role) && video.sellerId === user.userId) {
      return;
    }

    if (BUYER_ROLES.includes(user.role)) {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'Buyer cannot manage videos' });
    }

    throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'Insufficient permission' });
  }

  private assertEditable(video: ProductVideoDocument): void {
    if ([ProductVideoStatus.ARCHIVED, ProductVideoStatus.REVIEW_PENDING].includes(video.status)) {
      throw new UnprocessableEntityException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Video cannot be edited in its current status'
      });
    }
  }

  private assertReadyForPublish(video: ProductVideoDocument): void {
    if (!video.mediaObjectKey || !video.mimeType || !isAllowedVideoMimeType(video.mimeType)) {
      throw new UnprocessableEntityException({ code: ErrorCode.VALIDATION_FAILED, message: 'Video media is required before publishing' });
    }

    if (!Array.isArray(video.products) || video.products.length === 0) {
      throw new UnprocessableEntityException({ code: ErrorCode.VALIDATION_FAILED, message: 'At least one product is required before publishing' });
    }

    const inactiveProduct = video.products.find((product) => product.statusSnapshot !== ProductStatus.ACTIVE);
    if (inactiveProduct) {
      throw new UnprocessableEntityException({ code: ErrorCode.VALIDATION_FAILED, message: 'Only active products can be published in video' });
    }
  }

  private async buildProductTags(sellerId: string, inputs: VideoProductInputDto[]): Promise<VideoProductTag[]> {
    const normalizedInputs = normalizeProductInputs(inputs);
    const productIds = normalizedInputs.map((input) => input.productId);
    const products = await this.productsRepository.findByIdsOrdered(productIds);

    if (products.length !== productIds.length) {
      throw new UnprocessableEntityException({ code: ErrorCode.VALIDATION_FAILED, message: 'One or more products do not exist' });
    }

    return normalizedInputs.map((input) => {
      const product = products.find((item) => item.id === input.productId);
      if (!product) {
        throw new UnprocessableEntityException({ code: ErrorCode.VALIDATION_FAILED, message: 'One or more products do not exist' });
      }

      if (product.sellerId !== sellerId) {
        throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'Seller can only attach own products to video' });
      }

      return toProductTag(product, input, this.mediaPublicBaseUrl);
    });
  }

  private toResponse(video: ProductVideoDocument): ProductVideoResponse {
    const metrics = video.metricsSnapshot ?? {
      viewStartedCount: 0,
      qualifiedViewCount: 0,
      productClickCount: 0,
      addToCartCount: 0,
      ctr: 0,
      addToCartRate: 0,
      lastAggregatedAt: null
    };

    const qualifiedViews = metrics.qualifiedViewCount ?? 0;
    const productClicks = metrics.productClickCount ?? 0;
    const addToCart = metrics.addToCartCount ?? 0;
    const ctr = qualifiedViews > 0 ? roundRate(productClicks / qualifiedViews) : 0;
    const addToCartRate = productClicks > 0 ? roundRate(addToCart / productClicks) : 0;

    return {
      videoId: video.videoId,
      sellerId: video.sellerId,
      title: video.title,
      description: video.description ?? null,
      status: video.status,
      mediaObjectKey: video.mediaObjectKey ?? null,
      mediaUrl: resolveMediaUrl(video.mediaUrl, video.mediaObjectKey, this.mediaPublicBaseUrl),
      thumbnailObjectKey: video.thumbnailObjectKey ?? null,
      thumbnailUrl: resolveMediaUrl(video.thumbnailUrl, video.thumbnailObjectKey, this.mediaPublicBaseUrl),
      mimeType: video.mimeType ?? null,
      sizeBytes: video.sizeBytes ?? null,
      durationSec: video.durationSec ?? null,
      products: (video.products ?? []).map((product) => ({
        productId: product.productId,
        sku: product.sku ?? null,
        name: product.nameSnapshot,
        image: resolveMediaUrl(product.imageSnapshot ?? null, product.imageSnapshot ?? null, this.mediaPublicBaseUrl),
        price: product.priceSnapshot,
        currency: product.currencySnapshot,
        status: product.statusSnapshot,
        sortOrder: product.sortOrder,
        tagPosition: product.tagPosition ?? null
      })),
      seller: {
        sellerId: video.sellerId,
        sellerCode: toDisplayCode(video.sellerId, 'SEL'),
        shopName: `Shop ${toDisplayCode(video.sellerId, 'SEL')}`
      },
      metrics: {
        viewStartedCount: metrics.viewStartedCount ?? 0,
        qualifiedViewCount: qualifiedViews,
        productClickCount: productClicks,
        addToCartCount: addToCart,
        ctr,
        addToCartRate,
        lastAggregatedAt: metrics.lastAggregatedAt ? metrics.lastAggregatedAt.toISOString() : null
      },
      publishedAt: video.publishedAt ? video.publishedAt.toISOString() : null,
      hiddenAt: video.hiddenAt ? video.hiddenAt.toISOString() : null,
      archivedAt: video.archivedAt ? video.archivedAt.toISOString() : null,
      createdAt: video.createdAt.toISOString(),
      updatedAt: video.updatedAt.toISOString()
    };
  }
}

interface PaginationResponse {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

function normalizePagination(query: ListProductVideosDto): ListProductVideosDto {
  return {
    ...query,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20
  };
}

function buildPagination(page: number, pageSize: number, totalItems: number): PaginationResponse {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize))
  };
}

function normalizeProductInputs(inputs: VideoProductInputDto[]): VideoProductInputDto[] {
  const seen = new Set<string>();
  return inputs.map((input, index) => {
    const productId = input.productId.trim();
    if (seen.has(productId)) {
      throw new UnprocessableEntityException({ code: ErrorCode.VALIDATION_FAILED, message: 'Duplicate product in video' });
    }
    seen.add(productId);

    return {
      ...input,
      productId,
      sortOrder: input.sortOrder ?? index + 1
    };
  });
}

function toProductTag(product: ProductDocument, input: VideoProductInputDto, mediaPublicBaseUrl: string): VideoProductTag {
  const defaultVariant = product.variants?.find((variant) => variant.isDefault) ?? product.variants?.[0];
  return {
    productId: product.id,
    sku: defaultVariant?.sku ?? null,
    nameSnapshot: product.name,
    imageSnapshot: product.images?.[0] ? resolveMediaUrl(null, product.images[0], mediaPublicBaseUrl) : null,
    priceSnapshot: product.minPrice,
    currencySnapshot: defaultVariant?.currency ?? 'VND',
    statusSnapshot: product.status,
    sortOrder: input.sortOrder ?? 1,
    tagPosition: input.tagPosition ?? null
  } as VideoProductTag;
}

function isAllowedVideoMimeType(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'video/mp4' || normalized === 'video/webm';
}

function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role) || role === Role.ADMIN;
}

function normalizeOptionalString(value?: string): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function resolveMediaUrl(urlValue: string | null | undefined, objectKey: string | null | undefined, mediaPublicBaseUrl: string): string | null {
  const directUrl = urlValue?.trim();
  if (directUrl) {
    return directUrl;
  }

  const key = objectKey?.trim();
  if (!key) {
    return null;
  }

  if (/^https?:\/\//i.test(key)) {
    return key;
  }

  return `${mediaPublicBaseUrl}/${key}`;
}

function normalizeMediaPublicBaseUrl(value: string): string {
  const fallback = 'http://localhost:12030/ecommerce-media';
  return (value?.trim() || fallback).replace(/\/+$/, '');
}

function roundRate(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function toDisplayCode(raw: string, prefix: string): string {
  const normalized = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const digits = normalized.replace(/\D/g, '');
  if (digits.length >= 7) {
    return `${prefix}${digits.slice(-7)}`;
  }
  return `${prefix}${String(stableHash(raw)).padStart(7, '0')}`;
}

function stableHash(value: string): number {
  const modulo = 10_000_000;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % modulo;
  }
  return hash;
}

function throwVideoNotFound(): never {
  throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Video not found' });
}
