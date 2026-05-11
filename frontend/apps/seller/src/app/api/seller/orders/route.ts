import type { SellerOrder, SellerOrderItem, SellerOrderListOutput, SellerOrderStatus } from '@/lib/api/types';
import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { enrichOrderListWithProductImages } from '@/lib/server/order-product-images';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const ORDER_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT']);
const VALID_STATUSES: Set<SellerOrderStatus> = new Set(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'FAILED']);
const VALID_SORT_BY = new Set(['createdAt', 'totalAmount', 'orderNumber']);
const VALID_SORT_ORDER = new Set(['ASC', 'DESC']);

export async function GET(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!ORDER_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to list orders');
  }

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

  const status = input.get('status');
  if (status && VALID_STATUSES.has(status as SellerOrderStatus)) {
    query.set('status', status);
  }

  const sortBy = input.get('sortBy');
  if (sortBy && VALID_SORT_BY.has(sortBy)) {
    query.set('sortBy', sortBy);
  }

  const sortOrder = input.get('sortOrder');
  if (sortOrder && VALID_SORT_ORDER.has(sortOrder)) {
    query.set('sortOrder', sortOrder);
  }

  const search = input.get('search')?.trim() ?? '';
  if (search.length > 0) {
    query.set('search', search.slice(0, 255));
  }

  const suffix = query.toString();
  const upstreamUrl = `${serviceBaseUrls.order}/orders${suffix ? `?${suffix}` : ''}`;

  try {
    const orders = await requestUpstream<unknown>(upstreamUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const normalized = normalizeOrderListOutput(orders, page ?? 1, Math.min(100, pageSize ?? 20));
    const enrichedItems = await enrichOrderListWithProductImages(normalized.items, accessToken);

    return ok(
      {
        ...normalized,
        items: enrichedItems
      },
      'backend'
    );
  } catch (error) {
    return toErrorResponse(error);
  }
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

function normalizeOrderListOutput(payload: unknown, page: number, pageSize: number): SellerOrderListOutput {
  if (isOrderListOutput(payload)) {
    const items = payload.items.map(sanitizeOrder).filter((item): item is SellerOrder => item !== null);
    return {
      items,
      pagination: {
        page: sanitizePositiveInt(payload.pagination.page, page),
        pageSize: sanitizePositiveInt(payload.pagination.pageSize, pageSize),
        totalItems: sanitizeNonNegativeInt(payload.pagination.totalItems, items.length),
        totalPages: sanitizePositiveInt(payload.pagination.totalPages, computeTotalPages(items.length, pageSize))
      }
    };
  }

  if (Array.isArray(payload)) {
    const items = payload.map((item) => sanitizeOrder(item)).filter((item): item is SellerOrder => item !== null);
    const totalItems = items.length;
    return {
      items,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: computeTotalPages(totalItems, pageSize)
      }
    };
  }

  return {
    items: [],
    pagination: {
      page,
      pageSize,
      totalItems: 0,
      totalPages: 0
    }
  };
}

function sanitizeOrder(order: unknown): SellerOrder | null {
  if (!isRecord(order)) {
    return null;
  }

  const id = asString(order.id);
  const orderNumber = asString(order.orderNumber);
  const userId = asString(order.userId);
  const status = asOrderStatus(order.status);
  const currency = asString(order.currency);
  const createdAt = asString(order.createdAt);
  const updatedAt = asString(order.updatedAt);
  if (!id || !orderNumber || !userId || !status || !currency || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    orderNumber,
    userId,
    status,
    currency,
    subtotalAmount: asNumber(order.subtotalAmount),
    shippingAmount: asNumber(order.shippingAmount),
    discountAmount: asNumber(order.discountAmount),
    totalAmount: asNumber(order.totalAmount),
    note: asNullableString(order.note),
    createdAt,
    updatedAt,
    items: Array.isArray(order.items)
      ? order.items.map(sanitizeOrderItem).filter((item): item is SellerOrderItem => item !== null)
      : []
  };
}

function sanitizeOrderItem(item: unknown): SellerOrderItem | null {
  if (!isRecord(item)) {
    return null;
  }

  const id = asString(item.id);
  const productId = asString(item.productId);
  const sku = asString(item.sku);
  const productName = asString(item.productName);
  if (!id || !productId || !sku || !productName) {
    return null;
  }

  return {
    id,
    productId,
    sku,
    productName,
    quantity: asNumber(item.quantity),
    unitPrice: asNumber(item.unitPrice),
    totalPrice: asNumber(item.totalPrice)
  };
}

function isOrderListOutput(value: unknown): value is SellerOrderListOutput {
  if (!isRecord(value)) {
    return false;
  }

  const items = value.items;
  const pagination = value.pagination;

  return Array.isArray(items) && isRecord(pagination);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return Math.floor(value);
}

function sanitizeNonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

function computeTotalPages(totalItems: number, pageSize: number): number {
  if (pageSize <= 0 || totalItems <= 0) {
    return 0;
  }

  return Math.ceil(totalItems / pageSize);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  const normalized = asString(value);
  return normalized ? normalized : null;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asOrderStatus(value: unknown): SellerOrderStatus | null {
  if (typeof value !== 'string') {
    return null;
  }

  const status = value.trim().toUpperCase();
  return VALID_STATUSES.has(status as SellerOrderStatus) ? (status as SellerOrderStatus) : null;
}
