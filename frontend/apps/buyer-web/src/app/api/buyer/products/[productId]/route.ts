import type { ProductDetail } from '@/lib/api/types';
import { ok, fail } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

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
  description: string | null;
  categoryId: string;
  brand: string | null;
  attributes?: Record<string, unknown> | null;
  images: string[];
  minPrice: number;
  variants: ProductVariant[];
}

interface RouteContext {
  params: {
    productId: string;
  };
}

const FALLBACK_IMAGE = 'https://picsum.photos/seed/product-fallback/800/800';

export async function GET(_request: Request, context: RouteContext) {
  let productId = '';
  try {
    productId = decodeURIComponent(context.params.productId ?? '').trim();
  } catch {
    return fail(400, 'INVALID_PRODUCT_ID', 'Invalid product identifier');
  }

  if (!isValidProductId(productId)) {
    return fail(400, 'INVALID_PRODUCT_ID', 'Invalid product identifier');
  }

  try {
    const product = await requestUpstream<BackendProduct>(
      `${serviceBaseUrls.product}/products/${encodeURIComponent(productId)}`
    );

    return ok(toProductDetail(product), 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

function toProductDetail(product: BackendProduct): ProductDetail {
  const defaultVariant = product.variants.find((variant) => variant.isDefault) ?? product.variants[0] ?? null;
  const price = sanitizePrice(defaultVariant?.price ?? product.minPrice);
  const compareAtPrice = sanitizeCompareAtPrice(defaultVariant?.compareAtPrice ?? null, price);

  return {
    id: product.id,
    title: product.name?.trim() || 'Unnamed product',
    description: product.description?.trim() || 'Product description is being updated.',
    brand: product.brand?.trim() || null,
    categoryId: product.categoryId?.trim() || 'uncategorized',
    image: product.images[0] ?? FALLBACK_IMAGE,
    images: product.images.length > 0 ? product.images : [FALLBACK_IMAGE],
    price,
    currency: sanitizeCurrency(defaultVariant?.currency),
    defaultSku: sanitizeSku(defaultVariant?.sku),
    compareAtPrice,
    discountPercent: calculateDiscountPercent(price, compareAtPrice),
    stock: extractStock(product.attributes)
  };
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

function sanitizeSku(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function calculateDiscountPercent(price: number, compareAtPrice: number | null): number {
  if (!compareAtPrice || compareAtPrice <= 0 || compareAtPrice <= price) {
    return 0;
  }

  return Math.max(0, Math.round(((compareAtPrice - price) / compareAtPrice) * 100));
}

function extractStock(attributes?: Record<string, unknown> | null): number | null {
  if (!attributes) {
    return null;
  }

  const candidates = [
    attributes.stock,
    attributes.inventory,
    attributes.inStock,
    attributes.availableStock,
    attributes.availableQuantity,
    attributes.quantity
  ];

  for (const candidate of candidates) {
    const parsed = toNonNegativeInt(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function toNonNegativeInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }

  return null;
}

function isValidProductId(value: string): boolean {
  return /^[A-Za-z0-9-]{6,80}$/.test(value);
}
