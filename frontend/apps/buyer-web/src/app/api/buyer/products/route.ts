import type { ProductSearchOutput } from '@/lib/api/types';
import { ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { serviceBaseUrls, UpstreamHttpError } from '@/lib/server/upstream-client';

interface ProductVariant {
  sku: string;
  name: string;
  price: number;
  currency: string;
  compareAtPrice: number | null;
  isDefault: boolean;
}

interface BackendProduct {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  brand: string | null;
  images: string[];
  minPrice: number;
  variants: ProductVariant[];
}

interface BackendProductListOutput {
  items: BackendProduct[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

const validSortBy = new Set(['createdAt', 'updatedAt', 'name', 'minPrice']);
const validSortOrder = new Set(['ASC', 'DESC']);
const FALLBACK_IMAGE = 'https://picsum.photos/seed/product-search-fallback/800/800';

export async function GET(request: Request) {
  const input = new URL(request.url).searchParams;
  const query = new URLSearchParams();

  const page = parsePositiveInt(input.get('page'));
  if (page !== null) {
    query.set('page', String(page));
  }

  const pageSize = parsePositiveInt(input.get('pageSize'));
  if (pageSize !== null) {
    query.set('pageSize', String(Math.min(100, pageSize)));
  }

  const search = input.get('search')?.trim() ?? '';
  if (search.length > 0) {
    query.set('search', search.slice(0, 255));
  }

  const sortBy = input.get('sortBy');
  if (sortBy && validSortBy.has(sortBy)) {
    query.set('sortBy', sortBy);
  }

  const sortOrder = input.get('sortOrder');
  if (sortOrder && validSortOrder.has(sortOrder)) {
    query.set('sortOrder', sortOrder);
  }

  const categoryId = input.get('categoryId')?.trim() ?? '';
  if (categoryId.length > 0) {
    query.set('categoryId', categoryId);
  }

  const brand = input.get('brand')?.trim() ?? '';
  if (brand.length > 0) {
    query.set('brand', brand);
  }

  const suffix = query.toString();
  const upstreamUrl = `${serviceBaseUrls.product}/products${suffix ? `?${suffix}` : ''}`;
  const fallbackPage = page ?? 1;
  const fallbackPageSize = pageSize !== null ? Math.min(100, pageSize) : 20;

  try {
    const result = await requestProductListUpstream(upstreamUrl, fallbackPage, fallbackPageSize);

    return ok(toProductSearchOutput(result), 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

function toProductSearchOutput(payload: BackendProductListOutput): ProductSearchOutput {
  return {
    items: payload.items.map((product) => {
      const defaultVariant = product.variants.find((variant) => variant.isDefault) ?? product.variants[0] ?? null;
      const price = sanitizePrice(defaultVariant?.price ?? product.minPrice);
      const compareAtPrice = sanitizeCompareAtPrice(defaultVariant?.compareAtPrice ?? null, price);

      return {
        id: product.id,
        title: product.name?.trim() || product.slug?.trim() || product.id,
        slug: product.slug?.trim() || '',
        categoryId: product.categoryId?.trim() || '',
        brand: product.brand?.trim() || null,
        image: product.images[0] ?? FALLBACK_IMAGE,
        price,
        currency: sanitizeCurrency(defaultVariant?.currency),
        compareAtPrice,
        discountPercent: calculateDiscountPercent(price, compareAtPrice)
      };
    }),
    pagination: payload.pagination
  };
}

function parsePositiveInt(raw: string | null): number | null {
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.floor(value);
}

function sanitizePrice(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function sanitizeCompareAtPrice(value: number | null, price: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= price) {
    return null;
  }

  return value;
}

function sanitizeCurrency(value: string | undefined): string {
  if (!value) {
    return 'USD';
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'USD';
}

function calculateDiscountPercent(price: number, compareAtPrice: number | null): number {
  if (!compareAtPrice || compareAtPrice <= 0 || compareAtPrice <= price) {
    return 0;
  }

  return Math.max(0, Math.round(((compareAtPrice - price) / compareAtPrice) * 100));
}

interface UpstreamPagination {
  page?: unknown;
  pageSize?: unknown;
  totalItems?: unknown;
  totalPages?: unknown;
}

interface UpstreamMeta {
  pagination?: UpstreamPagination;
}

interface UpstreamError {
  code?: unknown;
  message?: unknown;
}

interface UpstreamBody {
  success?: unknown;
  data?: unknown;
  meta?: UpstreamMeta;
  error?: UpstreamError;
}

async function requestProductListUpstream(
  url: string,
  fallbackPage: number,
  fallbackPageSize: number
): Promise<BackendProductListOutput> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: 'GET',
      cache: 'no-store'
    });
  } catch {
    throw new UpstreamHttpError(503, 'UPSTREAM_UNAVAILABLE', 'Cannot connect to upstream service', true);
  }

  const rawText = await response.text();
  const parsed = safeParseJson(rawText);

  if (!response.ok) {
    const code = isRecord(parsed?.error) && typeof parsed.error.code === 'string' ? parsed.error.code : `HTTP_${response.status}`;
    const message =
      isRecord(parsed?.error) && typeof parsed.error.message === 'string'
        ? parsed.error.message
        : `Upstream request failed with status ${response.status}`;
    throw new UpstreamHttpError(response.status, code, message);
  }

  if (!parsed || parsed.success !== true) {
    throw new UpstreamHttpError(502, 'INVALID_UPSTREAM_RESPONSE', 'Upstream returned invalid payload');
  }

  const items = resolveItems(parsed.data);
  const pagination = resolvePagination(parsed.data, parsed.meta, fallbackPage, fallbackPageSize, items.length);

  return {
    items,
    pagination
  };
}

function resolveItems(data: unknown): BackendProduct[] {
  if (Array.isArray(data)) {
    return data as BackendProduct[];
  }

  if (isRecord(data) && Array.isArray(data.items)) {
    return data.items as BackendProduct[];
  }

  return [];
}

function resolvePagination(
  data: unknown,
  meta: UpstreamMeta | undefined,
  fallbackPage: number,
  fallbackPageSize: number,
  fallbackTotalItems: number
): BackendProductListOutput['pagination'] {
  const fromData = isRecord(data) && isRecord(data.pagination) ? data.pagination : undefined;
  const source = fromData ?? meta?.pagination;

  const page = toPositiveInt(source?.page) ?? fallbackPage;
  const pageSize = toPositiveInt(source?.pageSize) ?? fallbackPageSize;
  const totalItems = toNonNegativeInt(source?.totalItems) ?? fallbackTotalItems;
  const totalPages = toPositiveInt(source?.totalPages) ?? Math.max(1, Math.ceil(totalItems / pageSize));

  return {
    page,
    pageSize,
    totalItems,
    totalPages
  };
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.floor(value);
}

function toNonNegativeInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
}

function safeParseJson(raw: string): UpstreamBody | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as UpstreamBody;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
