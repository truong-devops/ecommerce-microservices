import type { Order, OrderItem, OrderListOutput, OrderStatus } from '@/lib/api/types';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const validOrderStatuses: Set<OrderStatus> = new Set([
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'FAILED'
]);

const validSortBy = new Set(['createdAt', 'totalAmount', 'orderNumber']);
const validSortOrder = new Set(['ASC', 'DESC']);

export async function GET(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
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
  if (status && validOrderStatuses.has(status as OrderStatus)) {
    query.set('status', status);
  }

  const sortBy = input.get('sortBy');
  if (sortBy && validSortBy.has(sortBy)) {
    query.set('sortBy', sortBy);
  }

  const sortOrder = input.get('sortOrder');
  if (sortOrder && validSortOrder.has(sortOrder)) {
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

    return ok(normalizeOrderListOutput(orders, page ?? 1, Math.min(100, pageSize ?? 20)), 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const idempotencyKey = request.headers.get('idempotency-key')?.trim() ?? '';
  if (!idempotencyKey) {
    return fail(400, 'BAD_REQUEST', 'Missing Idempotency-Key header');
  }

  let payload: unknown;
  try {
    payload = (await request.json()) as unknown;
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fail(400, 'BAD_REQUEST', 'Invalid order payload');
  }

  try {
    const created = await requestUpstream<Record<string, unknown>>(`${serviceBaseUrls.order}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(payload)
    });

    return ok(created, 'backend', 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}

function readBearerToken(value: string | null): string {
  if (!value) {
    return '';
  }

  const [type, token] = value.split(' ');
  if (!type || !token || type.toLowerCase() !== 'bearer') {
    return '';
  }

  return token;
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

function normalizeOrderListOutput(payload: unknown, page: number, pageSize: number): OrderListOutput {
  if (isOrderListOutput(payload)) {
    const items = payload.items.map(sanitizeOrder).filter((item): item is Order => item !== null);
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
    const items = payload.map(sanitizeOrder).filter((item): item is Order => item !== null);
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

function sanitizeOrder(order: unknown): Order | null {
  if (!isRecord(order)) {
    return null;
  }

  const id = asString(order.id);
  const orderNumber = asString(order.orderNumber);
  const userId = asString(order.userId);
  const sellerId = asString(order.sellerId);
  const status = asOrderStatus(order.status);
  const currency = asString(order.currency);
  const createdAt = asString(order.createdAt);
  const updatedAt = asString(order.updatedAt);
  if (!id || !orderNumber || !userId || !sellerId || !status || !currency || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    orderNumber,
    userId,
    sellerId,
    status,
    currency,
    subtotalAmount: asNumber(order.subtotalAmount),
    shippingAmount: asNumber(order.shippingAmount),
    discountAmount: asNumber(order.discountAmount),
    totalAmount: asNumber(order.totalAmount),
    note: asNullableString(order.note),
    paymentMethod: order.paymentMethod === 'ONLINE' ? 'ONLINE' : 'COD',
    recipientName: asString(order.recipientName),
    recipientPhone: asString(order.recipientPhone),
    recipientAddress: asString(order.recipientAddress),
    recipientWard: asNullableString(order.recipientWard),
    recipientDistrict: asNullableString(order.recipientDistrict),
    recipientProvince: asNullableString(order.recipientProvince),
    createdAt,
    updatedAt,
    items: Array.isArray(order.items)
      ? order.items.map(sanitizeOrderItem).filter((item): item is OrderItem => item !== null)
      : []
  };
}

function sanitizeOrderItem(item: unknown): OrderItem | null {
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

function isOrderListOutput(value: unknown): value is OrderListOutput {
  if (!isRecord(value)) {
    return false;
  }

  return Array.isArray(value.items) && isRecord(value.pagination);
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

function asOrderStatus(value: unknown): OrderStatus | null {
  if (typeof value !== 'string') {
    return null;
  }

  const status = value.trim().toUpperCase();
  return validOrderStatuses.has(status as OrderStatus) ? (status as OrderStatus) : null;
}
