import type { OrderListOutput, OrderStatus } from '@/lib/api/types';
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
    const orders = await requestUpstream<OrderListOutput>(upstreamUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return ok(orders, 'backend');
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
