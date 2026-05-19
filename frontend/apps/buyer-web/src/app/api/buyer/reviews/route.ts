import type { Order, ReviewListOutput } from '@/lib/api/types';
import { readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const validSortBy = new Set(['createdAt', 'updatedAt', 'rating']);
const validSortOrder = new Set(['ASC', 'DESC']);

export async function GET(request: Request) {
  const input = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  const productId = input.get('productId')?.trim() ?? '';

  const page = parsePositiveInt(input.get('page'));
  if (page !== null) {
    query.set('page', String(page));
  }

  const pageSize = parsePositiveInt(input.get('pageSize'));
  if (pageSize !== null) {
    query.set('pageSize', String(Math.min(100, pageSize)));
  }

  if (productId.length > 0) {
    query.set('productId', productId);
  }

  const rating = parseRating(input.get('rating'));
  if (rating !== null) {
    query.set('rating', String(rating));
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

  const suffix = query.toString();
  const upstreamUrl = `${serviceBaseUrls.review}/reviews${suffix ? `?${suffix}` : ''}`;

  try {
    const result = await requestUpstream<ReviewListOutput>(upstreamUrl, {
      method: 'GET',
      cache: 'no-store'
    });

    return ok(result, 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  let payload: unknown;
  try {
    payload = (await request.json()) as unknown;
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fail(400, 'BAD_REQUEST', 'Invalid review payload');
  }

  try {
    const eligibility = await assertReviewEligibility(accessToken, payload as Record<string, unknown>);
    if (!eligibility.ok) {
      return fail(eligibility.status, eligibility.code, eligibility.message);
    }

    const created = await requestUpstream<Record<string, unknown>>(`${serviceBaseUrls.review}/reviews`, {
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

type ReviewEligibilityResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

async function assertReviewEligibility(
  accessToken: string,
  payload: Record<string, unknown>
): Promise<ReviewEligibilityResult> {
  const orderId = asString(payload.orderId);
  const productId = asString(payload.productId);

  if (!orderId || !productId) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_REVIEW_ORDER',
      message: 'Order and product are required to submit a review'
    };
  }

  const order = await requestUpstream<Order>(`${serviceBaseUrls.order}/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });

  if (order.status !== 'DELIVERED') {
    return {
      ok: false,
      status: 403,
      code: 'ORDER_NOT_DELIVERED',
      message: 'You can only review products after confirming the order was received'
    };
  }

  if (!Array.isArray(order.items) || !order.items.some((item) => item.productId === productId)) {
    return {
      ok: false,
      status: 403,
      code: 'PRODUCT_NOT_IN_ORDER',
      message: 'You can only review products included in this order'
    };
  }

  return { ok: true };
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

function parseRating(raw: string | null): number | null {
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1 || value > 5) {
    return null;
  }

  return Math.floor(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
