import type { SellerShipmentListOutput, SellerShipmentStatus } from '@/lib/api/types';
import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const SHIPMENT_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT']);
const VALID_STATUSES: Set<SellerShipmentStatus> = new Set([
  'PENDING',
  'AWB_CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
  'RETURNED'
]);
const VALID_SORT_BY = new Set(['createdAt', 'shippingFee', 'status']);
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

  if (!SHIPMENT_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to list shipments');
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
  if (status && VALID_STATUSES.has(status as SellerShipmentStatus)) {
    query.set('status', status);
  }

  const provider = input.get('provider')?.trim() ?? '';
  if (provider) {
    query.set('provider', provider.slice(0, 64));
  }

  const orderId = input.get('orderId')?.trim() ?? '';
  if (orderId) {
    query.set('orderId', orderId);
  }

  const search = input.get('search')?.trim() ?? '';
  if (search) {
    query.set('search', search.slice(0, 255));
  }

  const sortBy = input.get('sortBy');
  if (sortBy && VALID_SORT_BY.has(sortBy)) {
    query.set('sortBy', sortBy);
  }

  const sortOrder = input.get('sortOrder');
  if (sortOrder && VALID_SORT_ORDER.has(sortOrder)) {
    query.set('sortOrder', sortOrder);
  }

  const suffix = query.toString();
  const upstreamUrl = `${serviceBaseUrls.shipping}/shipments${suffix ? `?${suffix}` : ''}`;

  try {
    const shipments = await requestUpstream<SellerShipmentListOutput>(upstreamUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return ok(shipments, 'backend');
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
