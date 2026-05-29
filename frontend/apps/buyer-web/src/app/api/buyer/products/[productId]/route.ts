import type { ProductDetail } from '@/lib/api/types';
import { formatSellerCode } from '@/lib/order-codes';
import { isValidProductId } from '@/lib/product-id';
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
  metadata?: Record<string, unknown> | null;
}

interface BackendProduct {
  id: string;
  sellerId: string;
  sellerCode?: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  brand: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED';
  attributes?: Record<string, unknown> | null;
  images: string[];
  minPrice: number;
  variants: ProductVariant[];
  createdAt?: string;
  updatedAt?: string;
}

interface RouteContext {
  params: Promise<{
    productId: string;
  }>;
}

const FALLBACK_IMAGE = 'https://picsum.photos/seed/product-fallback/800/800';

export async function GET(_request: Request, context: RouteContext) {
  let productId = '';
  try {
    productId = decodeURIComponent((await context.params).productId ?? '').trim();
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
  const currency = sanitizeCurrency(defaultVariant?.currency);
  const normalizedImages = product.images.length > 0 ? product.images : [FALLBACK_IMAGE];
  const variants = toVariants(product.variants, currency);

  return {
    id: product.id,
    title: product.name?.trim() || 'Unnamed product',
    description: product.description?.trim() || 'Product description is being updated.',
    brand: product.brand?.trim() || null,
    categoryId: product.categoryId?.trim() || 'uncategorized',
    slug: product.slug?.trim() || product.id,
    sellerId: product.sellerId?.trim() || '',
    sellerCode: normalizeSellerCode(product.sellerCode, product.sellerId),
    status: sanitizeStatus(product.status),
    image: normalizedImages[0] ?? FALLBACK_IMAGE,
    images: normalizedImages,
    price,
    currency,
    defaultSku: sanitizeSku(defaultVariant?.sku),
    compareAtPrice,
    discountPercent: calculateDiscountPercent(price, compareAtPrice),
    stock: extractStock(product.attributes),
    attributes: sanitizeFlatRecord(product.attributes),
    variants,
    createdAt: sanitizeIsoDate(product.createdAt),
    updatedAt: sanitizeIsoDate(product.updatedAt)
  };
}

function normalizeSellerCode(rawCode: string | undefined, sellerId: string): string {
  const normalized = (rawCode ?? '').trim().toUpperCase();
  if (/^SEL\d{7,}$/.test(normalized)) {
    return normalized;
  }
  return formatSellerCode(sellerId);
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

function sanitizeStatus(value: BackendProduct['status'] | undefined): ProductDetail['status'] {
  if (value === 'ACTIVE' || value === 'ARCHIVED' || value === 'DRAFT' || value === 'HIDDEN') {
    return value;
  }
  return 'ACTIVE';
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

function sanitizeIsoDate(value: string | undefined): string | null {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function sanitizeFlatRecord(
  source: Record<string, unknown> | null | undefined
): Record<string, string | number | boolean | null> {
  if (!source) {
    return {};
  }

  return Object.entries(source).reduce<Record<string, string | number | boolean | null>>((accumulator, [key, value]) => {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      return accumulator;
    }

    const normalizedValue = sanitizePrimitive(value);
    if (normalizedValue !== undefined) {
      accumulator[normalizedKey] = normalizedValue;
    }

    return accumulator;
  }, {});
}

function sanitizePrimitive(value: unknown): string | number | boolean | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return undefined;
}

function toVariants(
  variants: ProductVariant[],
  fallbackCurrency: string
): ProductDetail['variants'] {
  return variants.map((variant) => {
    const variantPrice = sanitizePrice(variant.price);
    const variantCompareAt = sanitizeCompareAtPrice(variant.compareAtPrice ?? null, variantPrice);

    return {
      sku: sanitizeSku(variant.sku) ?? 'N/A',
      name: variant.name?.trim() || 'Standard',
      price: variantPrice,
      currency: sanitizeCurrency(variant.currency) || fallbackCurrency,
      compareAtPrice: variantCompareAt,
      discountPercent: calculateDiscountPercent(variantPrice, variantCompareAt),
      isDefault: Boolean(variant.isDefault),
      metadata: sanitizeFlatRecord(variant.metadata)
    };
  });
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
