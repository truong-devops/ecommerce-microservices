import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
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
  sellerId: string;
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
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly productSearchService: ProductSearchService,
    private readonly productEventsPublisherService: ProductEventsPublisherService
  ) {}

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
      images: (dto.images ?? []).map((value) => value.trim()),
      variants,
      minPrice: computeMinPrice(variants)
    };

    const created = await this.productsRepository.createProduct(payload);
    const response = toProductResponse(created);

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
        items: documents.map(toProductResponse),
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
      items: items.map(toProductResponse),
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
        items: documents.map(toProductResponse),
        pagination: buildPagination(normalized.page!, normalized.pageSize!, searchResult.totalItems)
      };
    }

    const { items, totalItems } = await this.productsRepository.listProducts(normalized, {
      sellerId
    });

    return {
      items: items.map(toProductResponse),
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

    return toProductResponse(product);
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
      payload.images = dto.images.map((value) => value.trim());
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

    const response = toProductResponse(updated);

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

    const response = toProductResponse(updated);

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

    const response = toProductResponse(deleted);

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

function toProductResponse(product: ProductDocument | ProductResponse): ProductResponse {
  if ('id' in product && typeof product.id === 'string' && 'variants' in product && Array.isArray(product.variants)) {
    if ((product as ProductResponse).createdAt && typeof (product as ProductResponse).createdAt === 'string') {
      return product as ProductResponse;
    }
  }

  const document = product as ProductDocument;
  return {
    id: document.id,
    sellerId: document.sellerId,
    name: document.name,
    slug: document.slug,
    description: document.description ?? null,
    categoryId: document.categoryId,
    brand: document.brand ?? null,
    status: document.status,
    attributes: document.attributes ?? {},
    images: document.images ?? [],
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
  };
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
