import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { ListProductsDto } from '../dto/list-products.dto';
import { ProductStatus } from '../entities/product-status.enum';

interface SearchResult {
  ids: string[];
  totalItems: number;
}

interface SearchableProduct {
  id: string;
  sellerId: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  brand: string | null;
  status: ProductStatus;
  minPrice: number;
  variants: Array<{
    sku: string;
    name: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ProductSearchService implements OnModuleInit {
  private readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly indexName: string;
  private readonly username: string;
  private readonly password: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger
  ) {
    this.enabled = this.configService.get<boolean>('search.enabled', false);
    this.baseUrl = this.configService.get<string>('search.url', '');
    this.indexName = this.configService.get<string>('search.index', 'products');
    this.username = this.configService.get<string>('search.username', '');
    this.password = this.configService.get<string>('search.password', '');
    this.timeoutMs = this.configService.get<number>('search.timeoutMs', 5000);
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled || !this.baseUrl) {
      return;
    }

    await this.ensureIndex();
  }

  async indexProduct(product: SearchableProduct): Promise<void> {
    if (!this.enabled || !this.baseUrl) {
      return;
    }

    await this.request('PUT', `/${this.indexName}/_doc/${product.id}`, {
      sellerId: product.sellerId,
      name: product.name,
      slug: product.slug,
      description: product.description,
      categoryId: product.categoryId,
      brand: product.brand,
      status: product.status,
      minPrice: product.minPrice,
      variants: product.variants,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    });
  }

  async deleteProduct(productId: string): Promise<void> {
    if (!this.enabled || !this.baseUrl) {
      return;
    }

    await this.request('DELETE', `/${this.indexName}/_doc/${productId}`);
  }

  async searchProducts(query: ListProductsDto, forcedStatus?: ProductStatus, forcedSellerId?: string): Promise<SearchResult | null> {
    if (!this.enabled || !this.baseUrl) {
      return null;
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const from = (page - 1) * pageSize;

    const filters: Array<Record<string, unknown>> = [];
    const status = forcedStatus ?? query.status;
    if (status) {
      filters.push({ term: { status } });
    }

    const sellerId = forcedSellerId ?? query.sellerId;
    if (sellerId) {
      filters.push({ term: { sellerId } });
    }

    if (query.categoryId) {
      filters.push({ term: { categoryId: query.categoryId } });
    }

    if (query.brand) {
      filters.push({ term: { brand: query.brand } });
    }

    const must: Array<Record<string, unknown>> = [];
    if (query.search?.trim()) {
      must.push({
        multi_match: {
          query: query.search.trim(),
          fields: ['name^3', 'slug^2', 'description', 'brand', 'variants.sku', 'variants.name'],
          fuzziness: 'AUTO'
        }
      });
    }

    if (must.length === 0) {
      must.push({ match_all: {} });
    }

    const sortField = resolveSortField(query.sortBy);
    const sortOrder = (query.sortOrder ?? 'DESC').toLowerCase();

    const body = {
      from,
      size: pageSize,
      query: {
        bool: {
          must,
          filter: filters
        }
      },
      sort: [{ [sortField]: sortOrder }]
    };

    try {
      const response = await this.request('POST', `/${this.indexName}/_search`, body);
      const hits = (response?.hits?.hits ?? []) as Array<{ _id: string }>;
      const totalValue = Number(response?.hits?.total?.value ?? hits.length);

      return {
        ids: hits.map((hit) => hit._id),
        totalItems: totalValue
      };
    } catch (error) {
      this.logger.warn(
        `OpenSearch query failed, fallback to MongoDB. reason=${String(error)}`,
        ProductSearchService.name
      );
      return null;
    }
  }

  private async ensureIndex(): Promise<void> {
    try {
      await this.request('PUT', `/${this.indexName}`, {
        mappings: {
          properties: {
            sellerId: { type: 'keyword' },
            name: { type: 'text' },
            slug: { type: 'keyword' },
            description: { type: 'text' },
            categoryId: { type: 'keyword' },
            brand: { type: 'keyword' },
            status: { type: 'keyword' },
            minPrice: { type: 'float' },
            createdAt: { type: 'date' },
            updatedAt: { type: 'date' },
            variants: {
              type: 'nested',
              properties: {
                sku: { type: 'keyword' },
                name: { type: 'text' }
              }
            }
          }
        }
      });
    } catch (error) {
      const message = String(error);
      if (!message.includes('resource_already_exists_exception')) {
        this.logger.warn(`OpenSearch index ensure failed: ${message}`, ProductSearchService.name);
      }
    }
  }

  private async request(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.username && this.password) {
        headers.Authorization = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
      }

      const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      const text = await response.text();
      const payload = text ? (JSON.parse(text) as any) : undefined;

      if (!response.ok) {
        const reason = payload?.error?.type ?? payload?.error?.reason ?? response.statusText;
        throw new Error(reason);
      }

      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function resolveSortField(sortBy?: string): string {
  if (sortBy === 'name') return 'name.keyword';
  if (sortBy === 'minPrice') return 'minPrice';
  if (sortBy === 'updatedAt') return 'updatedAt';
  return 'createdAt';
}
