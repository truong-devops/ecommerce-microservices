import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const PRODUCT_CREATE_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN']);
const PRODUCT_MANAGE_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'MODERATOR']);
const PRODUCT_STATUSES = new Set(['DRAFT', 'ACTIVE', 'HIDDEN', 'ARCHIVED']);

interface ProductVariantPayload {
  sku: string;
  name: string;
  price: number;
  currency: string;
  compareAtPrice?: number;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
}

interface CreateProductPayload {
  sellerId?: string;
  name: string;
  slug?: string;
  description?: string;
  categoryId: string;
  brand?: string;
  attributes?: Record<string, unknown>;
  images?: string[];
  variants: ProductVariantPayload[];
  status?: 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED';
}

interface ProductListItem {
  id: string;
  sellerId: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  brand: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED';
  attributes: Record<string, unknown>;
  images: string[];
  variants: ProductVariantPayload[];
  minPrice: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export async function GET(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!PRODUCT_MANAGE_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to list products');
  }

  const params = new URL(request.url).searchParams;
  const page = normalizePositiveInt(params.get('page'), 1);
  const pageSize = normalizePositiveInt(params.get('pageSize'), 20, 100);
  const search = params.get('search')?.trim() || '';
  const statusRaw = params.get('status')?.trim().toUpperCase() || '';
  const status = PRODUCT_STATUSES.has(statusRaw) ? statusRaw : '';

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('pageSize', String(pageSize));
  queryParams.set('sortBy', 'createdAt');
  queryParams.set('sortOrder', 'DESC');

  if (search) {
    queryParams.set('search', search);
  }

  if (status) {
    queryParams.set('status', status);
  }

  try {
    const items = await requestUpstream<ProductListItem[]>(`${serviceBaseUrls.product}/products/my?${queryParams.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return ok({
      items,
      page,
      pageSize,
      hasNext: items.length >= pageSize
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!PRODUCT_CREATE_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to create product');
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  const payload = sanitizeCreateProductPayload(body);
  if (!payload) {
    return fail(400, 'BAD_REQUEST', 'Invalid product payload');
  }

  try {
    const created = await requestUpstream<unknown>(`${serviceBaseUrls.product}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });

    return ok(created, 'backend', 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}

function sanitizeCreateProductPayload(input: unknown): CreateProductPayload | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const source = input as Record<string, unknown>;

  const name = typeof source.name === 'string' ? source.name.trim() : '';
  const categoryId = typeof source.categoryId === 'string' ? source.categoryId.trim() : '';

  if (!name || !categoryId) {
    return null;
  }

  const variants = sanitizeVariants(source.variants);
  if (!variants || variants.length === 0) {
    return null;
  }

  const payload: CreateProductPayload = {
    name,
    categoryId,
    variants
  };

  if (typeof source.sellerId === 'string' && source.sellerId.trim()) {
    payload.sellerId = source.sellerId.trim();
  }

  if (typeof source.slug === 'string' && source.slug.trim()) {
    payload.slug = source.slug.trim();
  }

  if (typeof source.description === 'string' && source.description.trim()) {
    payload.description = source.description.trim();
  }

  if (typeof source.brand === 'string' && source.brand.trim()) {
    payload.brand = source.brand.trim();
  }

  if (source.attributes && typeof source.attributes === 'object' && !Array.isArray(source.attributes)) {
    payload.attributes = source.attributes as Record<string, unknown>;
  }

  if (Array.isArray(source.images)) {
    const images = source.images
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean);

    if (images.length > 0) {
      payload.images = images;
    }
  }

  if (typeof source.status === 'string' && PRODUCT_STATUSES.has(source.status)) {
    payload.status = source.status as CreateProductPayload['status'];
  }

  return payload;
}

function normalizePositiveInt(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function sanitizeVariants(input: unknown): ProductVariantPayload[] | null {
  if (!Array.isArray(input)) {
    return null;
  }

  const sanitized: ProductVariantPayload[] = [];

  for (const item of input) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as Record<string, unknown>;

    const sku = typeof source.sku === 'string' ? source.sku.trim() : '';
    const name = typeof source.name === 'string' ? source.name.trim() : '';
    const currency = typeof source.currency === 'string' ? source.currency.trim().toUpperCase() : '';
    const price = typeof source.price === 'number' ? source.price : Number(source.price);

    if (!sku || !name || !currency || !Number.isFinite(price) || price < 0) {
      return null;
    }

    const variant: ProductVariantPayload = {
      sku,
      name,
      price,
      currency
    };

    if (source.compareAtPrice !== undefined && source.compareAtPrice !== null && source.compareAtPrice !== '') {
      const compareAtPrice = typeof source.compareAtPrice === 'number' ? source.compareAtPrice : Number(source.compareAtPrice);
      if (!Number.isFinite(compareAtPrice) || compareAtPrice < 0) {
        return null;
      }
      variant.compareAtPrice = compareAtPrice;
    }

    if (typeof source.isDefault === 'boolean') {
      variant.isDefault = source.isDefault;
    }

    if (source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)) {
      variant.metadata = source.metadata as Record<string, unknown>;
    }

    sanitized.push(variant);
  }

  return sanitized;
}
