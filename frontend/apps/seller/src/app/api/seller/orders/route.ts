import type { SellerOrderListOutput, SellerOrderStatus } from '@/lib/api/types';
import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
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
    const orders = await requestUpstream<SellerOrderListOutput>(upstreamUrl, {
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
