import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { BUYER_ROLES, Role, SELLER_ROLES, STAFF_ROLES } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { AppException } from '../../../common/utils/app-exception.util';
import { CreateProductDto, ProductVariantDto } from '../dto/create-product.dto';
import { ListProductsDto } from '../dto/list-products.dto';
import { UpdateProductStatusDto } from '../dto/update-product-status.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { ProductDocument, ProductVariant } from '../entities/product.schema';
import { ProductStatus } from '../entities/product-status.enum';
import {
  CreateProductPayload,
  ProductsRepository,
  UpdateProductPayload
} from '../repositories/products.repository';
import { ProductEventsPublisherService } from './product-events-publisher.service';
import { ProductSearchService } from './product-search.service';

interface ProductResponse {
  id: string;
  productCode: string;
  sellerId: string;
  sellerCode: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  brand: string | null;
  status: ProductStatus;
  attributes: Record<string, unknown>;
  images: string[];
  variants: Array<{
    sku: string;
    name: string;
    price: number;
    currency: string;
    compareAtPrice: number | null;
    isDefault: boolean;
    metadata: Record<string, unknown>;
  }>;
  minPrice: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

@Injectable()
export class ProductsService {
  private readonly mediaPublicBaseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly productsRepository: ProductsRepository,
    private readonly productSearchService: ProductSearchService,
    private readonly productEventsPublisherService: ProductEventsPublisherService
  ) {
    this.mediaPublicBaseUrl = normalizeMediaPublicBaseUrl(
      this.configService.get<string>('media.publicBaseUrl', 'http://localhost:12030/ecommerce-media')
    );
  }

  async createProduct(
    user: AuthenticatedUserContext,
    requestId: string,
    dto: CreateProductDto
  ): Promise<ProductResponse> {
    const sellerId = this.resolveSellerIdForCreate(user, dto.sellerId);
    const slug = normalizeSlug(dto.slug ?? dto.name);

    await this.assertSlugAvailable(slug);

    const variants = normalizeVariants(dto.variants);
    await this.assertSkusAvailable(variants.map((variant) => variant.sku));

    const status = this.resolveCreateStatus(user, dto.status);

    const payload: CreateProductPayload = {
      sellerId,
      name: dto.name.trim(),
      slug,
      description: dto.description?.trim() ?? null,
      categoryId: dto.categoryId.trim(),
      brand: dto.brand?.trim() ?? null,
      status,
      attributes: dto.attributes ?? {},
      images: normalizeImagesForStorage(dto.images ?? [], this.mediaPublicBaseUrl),
      variants,
      minPrice: computeMinPrice(variants)
    };

    const created = await this.productsRepository.createProduct(payload);
    const response = toProductResponse(created, this.mediaPublicBaseUrl);

    await Promise.all([
      this.productSearchService.indexProduct(toSearchableProduct(response)),
      this.productEventsPublisherService.publishProductCreated(response, user, requestId)
    ]);

    return response;
  }

  async listPublicProducts(query: ListProductsDto): Promise<{
    items: ProductResponse[];
    pagination: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    const normalized = normalizePagination(query);

    const searchResult = await this.productSearchService.searchProducts(normalized, ProductStatus.ACTIVE);
    if (searchResult) {
      const documents = await this.productsRepository.findByIdsOrdered(searchResult.ids);
      return {
        items: documents.map((product) => toProductResponse(product, this.mediaPublicBaseUrl)),
        pagination: buildPagination(normalized.page!, normalized.pageSize!, searchResult.totalItems)
      };
    }

    const { items, totalItems } = await this.productsRepository.listProducts(
      {
        ...normalized,
        status: ProductStatus.ACTIVE
      },
      {
        status: ProductStatus.ACTIVE
      }
    );

    return {
      items: items.map((product) => toProductResponse(product, this.mediaPublicBaseUrl)),
      pagination: buildPagination(normalized.page!, normalized.pageSize!, totalItems)
    };
  }

  async listManagedProducts(
    user: AuthenticatedUserContext,
    query: ListProductsDto
  ): Promise<{
    items: ProductResponse[];
    pagination: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    const normalized = normalizePagination(query);

    const isSeller = SELLER_ROLES.includes(user.role);
    const sellerId = isSeller ? user.userId : query.sellerId;
    const status = normalized.status;

    const searchResult = await this.productSearchService.searchProducts(normalized, status, sellerId);
    if (searchResult) {
      const documents = await this.productsRepository.findByIdsOrdered(searchResult.ids);
      return {
        items: documents.map((product) => toProductResponse(product, this.mediaPublicBaseUrl)),
        pagination: buildPagination(normalized.page!, normalized.pageSize!, searchResult.totalItems)
      };
    }

    const { items, totalItems } = await this.productsRepository.listProducts(normalized, {
      sellerId
    });

    return {
      items: items.map((product) => toProductResponse(product, this.mediaPublicBaseUrl)),
      pagination: buildPagination(normalized.page!, normalized.pageSize!, totalItems)
    };
  }

  async getPublicProductById(id: string): Promise<ProductResponse> {
    const product = await this.productsRepository.findById(id);
    if (!product || product.status !== ProductStatus.ACTIVE) {
      throw new NotFoundException({
        code: ErrorCode.PRODUCT_NOT_FOUND,
        message: 'Product not found'
      });
    }

    return toProductResponse(product, this.mediaPublicBaseUrl);
  }

  async updateProduct(
    user: AuthenticatedUserContext,
    requestId: string,
    id: string,
    dto: UpdateProductDto
  ): Promise<ProductResponse> {
    const existing = await this.requireProduct(id);
    this.assertCanManageProduct(user, existing);

    if (dto.status && dto.status !== ProductStatus.DRAFT) {
      throw new UnprocessableEntityException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Use status endpoint to update product status'
      });
    }

    if (dto.sellerId && dto.sellerId !== existing.sellerId && !isStaff(user.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Seller cannot reassign product owner'
      });
    }

    const payload: UpdateProductPayload = {};

    if (dto.name) {
      payload.name = dto.name.trim();
    }

    if (dto.slug || dto.name) {
      const slug = normalizeSlug(dto.slug ?? dto.name ?? existing.name);
      await this.assertSlugAvailable(slug, existing.id);
      payload.slug = slug;
    }

    if (dto.description !== undefined) {
      payload.description = dto.description?.trim() ?? null;
    }

    if (dto.categoryId) {
      payload.categoryId = dto.categoryId.trim();
    }

    if (dto.brand !== undefined) {
      payload.brand = dto.brand?.trim() ?? null;
    }

    if (dto.attributes) {
      payload.attributes = dto.attributes;
    }

    if (dto.images) {
      payload.images = normalizeImagesForStorage(dto.images, this.mediaPublicBaseUrl);
    }

    if (dto.sellerId && isStaff(user.role)) {
      payload.sellerId = dto.sellerId;
    }

    if (dto.status === ProductStatus.DRAFT) {
      payload.status = ProductStatus.DRAFT;
    }

    if (dto.variants) {
      const variants = normalizeVariants(dto.variants as ProductVariantDto[]);
      await this.assertSkusAvailable(
        variants.map((variant) => variant.sku),
        existing.id
      );
      payload.variants = variants;
      payload.minPrice = computeMinPrice(variants);
    }

    const updated = await this.productsRepository.updateById(id, payload);
    if (!updated) {
      throw new NotFoundException({
        code: ErrorCode.PRODUCT_NOT_FOUND,
        message: 'Product not found'
      });
    }

    const response = toProductResponse(updated, this.mediaPublicBaseUrl);

    await Promise.all([
      this.productSearchService.indexProduct(toSearchableProduct(response)),
      this.productEventsPublisherService.publishProductUpdated(response, user, requestId)
    ]);

    return response;
  }

  async updateProductStatus(
    user: AuthenticatedUserContext,
    requestId: string,
    id: string,
    dto: UpdateProductStatusDto
  ): Promise<ProductResponse> {
    if (!isStaff(user.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only admin or moderator can update status'
      });
    }

    await this.requireProduct(id);

    const updated = await this.productsRepository.updateById(id, {
      status: dto.status
    });

    if (!updated) {
      throw new NotFoundException({
        code: ErrorCode.PRODUCT_NOT_FOUND,
        message: 'Product not found'
      });
    }

    const response = toProductResponse(updated, this.mediaPublicBaseUrl);

    await Promise.all([
      this.productSearchService.indexProduct(toSearchableProduct(response)),
      this.productEventsPublisherService.publishProductStatusChanged(response, user, requestId, dto.reason)
    ]);

    return response;
  }

  async deleteProduct(
    user: AuthenticatedUserContext,
    requestId: string,
    id: string
  ): Promise<ProductResponse> {
    const existing = await this.requireProduct(id);
    this.assertCanManageProduct(user, existing);

    const deleted = await this.productsRepository.softDelete(id);
    if (!deleted) {
      throw new NotFoundException({
        code: ErrorCode.PRODUCT_NOT_FOUND,
        message: 'Product not found'
      });
    }

    const response = toProductResponse(deleted, this.mediaPublicBaseUrl);

    await Promise.all([
      this.productSearchService.deleteProduct(response.id),
      this.productEventsPublisherService.publishProductDeleted(response, user, requestId)
    ]);

    return response;
  }

  private async requireProduct(id: string): Promise<ProductDocument> {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException({
        code: ErrorCode.PRODUCT_NOT_FOUND,
        message: 'Product not found'
      });
    }

    return product;
  }

  private assertCanManageProduct(user: AuthenticatedUserContext, product: ProductDocument): void {
    if (isStaff(user.role)) {
      return;
    }

    if (SELLER_ROLES.includes(user.role) && product.sellerId === user.userId) {
      return;
    }

    if (BUYER_ROLES.includes(user.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Buyer cannot manage products'
      });
    }

    throw new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: 'Insufficient permission'
    });
  }

  private resolveSellerIdForCreate(user: AuthenticatedUserContext, requestedSellerId?: string): string {
    if (SELLER_ROLES.includes(user.role)) {
      if (requestedSellerId && requestedSellerId !== user.userId) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'Seller cannot create products for another seller'
        });
      }

      return user.userId;
    }

    if (isStaff(user.role) || user.role === Role.ADMIN) {
      if (!requestedSellerId) {
        throw new AppException(HttpStatus.BAD_REQUEST, {
          code: ErrorCode.BAD_REQUEST,
          message: 'sellerId is required for staff-created products'
        });
      }

      return requestedSellerId;
    }

    throw new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: 'Role cannot create products'
    });
  }

  private resolveCreateStatus(user: AuthenticatedUserContext, requested?: ProductStatus): ProductStatus {
    if (SELLER_ROLES.includes(user.role)) {
      if (requested && requested !== ProductStatus.DRAFT) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'Seller can only create draft products'
        });
      }

      return ProductStatus.DRAFT;
    }

    return requested ?? ProductStatus.DRAFT;
  }

  private async assertSlugAvailable(slug: string, excludeProductId?: string): Promise<void> {
    const existing = await this.productsRepository.findBySlug(slug, excludeProductId);
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.PRODUCT_SLUG_EXISTS,
        message: 'Product slug already exists'
      });
    }
  }

  private async assertSkusAvailable(skus: string[], excludeProductId?: string): Promise<void> {
    const duplicateInRequest = findDuplicate(skus.map((sku) => sku.toUpperCase()));
    if (duplicateInRequest) {
      throw new ConflictException({
        code: ErrorCode.PRODUCT_SKU_CONFLICT,
        message: `Duplicate SKU in payload: ${duplicateInRequest}`
      });
    }

    const existing = await this.productsRepository.findFirstBySkus(
      skus.map((sku) => sku.toUpperCase()),
      excludeProductId
    );

    if (existing) {
      throw new ConflictException({
        code: ErrorCode.PRODUCT_SKU_CONFLICT,
        message: 'One or more SKUs already exist'
      });
    }
  }
}

function normalizePagination(query: ListProductsDto): ListProductsDto {
  return {
    ...query,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20
  };
}

function buildPagination(page: number, pageSize: number, totalItems: number): {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
} {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize))
  };
}

function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role) || role === Role.ADMIN;
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function normalizeVariants(input: ProductVariantDto[]): ProductVariant[] {
  const normalized = input.map((variant) => ({
    sku: variant.sku.trim().toUpperCase(),
    name: variant.name.trim(),
    price: roundMoney(variant.price),
    currency: variant.currency.trim().toUpperCase(),
    compareAtPrice: variant.compareAtPrice !== undefined ? roundMoney(variant.compareAtPrice) : null,
    isDefault: variant.isDefault ?? false,
    metadata: variant.metadata ?? {}
  }));

  let defaultCount = normalized.filter((variant) => variant.isDefault).length;
  if (defaultCount === 0) {
    normalized[0].isDefault = true;
    defaultCount = 1;
  }

  if (defaultCount > 1) {
    throw new UnprocessableEntityException({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Only one variant can be default'
    });
  }

  return normalized;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeMinPrice(variants: ProductVariant[]): number {
  return variants.reduce((minimum, variant) => Math.min(minimum, variant.price), variants[0]?.price ?? 0);
}

function findDuplicate(values: string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
  }

  return null;
}

function normalizeImagesForStorage(images: string[], mediaPublicBaseUrl: string): string[] {
  const normalized: string[] = [];

  for (const rawImage of images) {
    const value = normalizeImageForStorage(rawImage, mediaPublicBaseUrl);
    if (!value) {
      continue;
    }

    normalized.push(value);
  }

  return normalized;
}

function normalizeImageForStorage(imageValue: string, mediaPublicBaseUrl: string): string {
  const value = imageValue.trim();
  if (!value) {
    return '';
  }

  if (isObjectKey(value)) {
    return value;
  }

  const objectKey = extractObjectKeyFromPublicUrl(value, mediaPublicBaseUrl);
  if (objectKey) {
    return objectKey;
  }

  return value;
}

function resolveImagesForResponse(images: string[], mediaPublicBaseUrl: string): string[] {
  return images.map((value) => resolveImageForResponse(value, mediaPublicBaseUrl)).filter((value) => value.length > 0);
}

function resolveImageForResponse(imageValue: string, mediaPublicBaseUrl: string): string {
  const value = imageValue.trim();
  if (!value) {
    return '';
  }

  if (isObjectKey(value)) {
    return `${mediaPublicBaseUrl}/${value}`;
  }

  return value;
}

function isObjectKey(value: string): boolean {
  if (value.length < 3 || value.length > 1024) {
    return false;
  }

  return /^[A-Za-z0-9][A-Za-z0-9/_\-.]+$/.test(value);
}

function extractObjectKeyFromPublicUrl(urlValue: string, mediaPublicBaseUrl: string): string | null {
  try {
    const imageURL = new URL(urlValue);
    const baseURL = new URL(mediaPublicBaseUrl);

    if (imageURL.origin !== baseURL.origin) {
      return null;
    }

    const basePath = baseURL.pathname.replace(/\/+$/, '');
    const imagePath = imageURL.pathname.replace(/\/+$/, '');

    if (!basePath || !imagePath.startsWith(`${basePath}/`)) {
      return null;
    }

    const objectKey = decodeURIComponent(imagePath.slice(basePath.length + 1));
    if (!isObjectKey(objectKey)) {
      return null;
    }

    return objectKey;
  } catch {
    return null;
  }
}

function normalizeMediaPublicBaseUrl(value: string): string {
  const fallback = 'http://localhost:12030/ecommerce-media';
  const raw = value?.trim() || fallback;
  return raw.replace(/\/+$/, '');
}

function toProductResponse(product: ProductDocument | ProductResponse, mediaPublicBaseUrl: string): ProductResponse {
  if ('id' in product && typeof product.id === 'string' && 'variants' in product && Array.isArray(product.variants)) {
    if ((product as ProductResponse).createdAt && typeof (product as ProductResponse).createdAt === 'string') {
      return enrichProductResponse(product as ProductResponse, mediaPublicBaseUrl);
    }
  }

  const document = product as ProductDocument;
  return enrichProductResponse({
    id: document.id,
    sellerId: document.sellerId,
    name: document.name,
    slug: document.slug,
    description: document.description ?? null,
    categoryId: document.categoryId,
    brand: document.brand ?? null,
    status: document.status,
    attributes: document.attributes ?? {},
    images: resolveImagesForResponse(document.images ?? [], mediaPublicBaseUrl),
    variants: (document.variants ?? []).map((variant) => ({
      sku: variant.sku,
      name: variant.name,
      price: variant.price,
      currency: variant.currency,
      compareAtPrice: variant.compareAtPrice ?? null,
      isDefault: variant.isDefault,
      metadata: variant.metadata ?? {}
    })),
    minPrice: document.minPrice,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    deletedAt: document.deletedAt ? document.deletedAt.toISOString() : null
  }, mediaPublicBaseUrl);
}

function enrichProductResponse(
  input: Omit<ProductResponse, 'productCode' | 'sellerCode'> & Partial<Pick<ProductResponse, 'productCode' | 'sellerCode'>>,
  mediaPublicBaseUrl: string
): ProductResponse {
  const normalizedImages = resolveImagesForResponse(input.images ?? [], mediaPublicBaseUrl);

  return {
    ...input,
    images: normalizedImages,
    productCode: toDisplayCode(input.id, 'PRD'),
    sellerCode: toDisplayCode(input.sellerId, 'SEL')
  };
}

function toDisplayCode(raw: string, prefix: string): string {
  const source = raw.trim();
  if (!source) {
    return `${prefix}0000000`;
  }

  const normalized = source.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const exactPattern = new RegExp(`^${prefix}(\\d{7})$`);
  const exactMatch = normalized.match(exactPattern);
  if (exactMatch) {
    return `${prefix}${exactMatch[1]}`;
  }

  const digits = normalized.replace(/\D/g, '');
  if (digits.length >= 7) {
    return `${prefix}${digits.slice(-7)}`;
  }

  return `${prefix}${String(stableHash(source)).padStart(7, '0')}`;
}

function stableHash(value: string): number {
  const modulo = 10_000_000;
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % modulo;
  }

  return hash;
}

function toSearchableProduct(product: ProductResponse): {
  id: string;
  sellerId: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  brand: string | null;
  status: ProductStatus;
  minPrice: number;
  variants: Array<{ sku: string; name: string }>;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: product.id,
    sellerId: product.sellerId,
    name: product.name,
    slug: product.slug,
    description: product.description,
    categoryId: product.categoryId,
    brand: product.brand,
    status: product.status,
    minPrice: product.minPrice,
    variants: product.variants.map((variant) => ({
      sku: variant.sku,
      name: variant.name
    })),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}
