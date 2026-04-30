import type { SellerOrder, SellerOrderStatus } from '@/lib/api/types';
import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const ORDER_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT']);
const VALID_STATUSES: Set<SellerOrderStatus> = new Set(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'FAILED']);

interface RouteContext {
  params: {
    orderId: string;
  };
}

interface UpdateOrderStatusBody {
  status?: unknown;
  reason?: unknown;
}

export async function PATCH(request: Request, context: RouteContext) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!ORDER_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to update order status');
  }

  const orderId = normalizeOrderId(context.params.orderId);
  if (!orderId) {
    return fail(400, 'BAD_REQUEST', 'Invalid order id');
  }

  let body: UpdateOrderStatusBody;
  try {
    body = (await request.json()) as UpdateOrderStatusBody;
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  const status = typeof body.status === 'string' ? body.status.trim().toUpperCase() : '';
  if (!VALID_STATUSES.has(status as SellerOrderStatus)) {
    return fail(400, 'BAD_REQUEST', 'Invalid order status');
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : undefined;

  try {
    const updated = await requestUpstream<SellerOrder>(
      `${serviceBaseUrls.order}/orders/${encodeURIComponent(orderId)}/status`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(reason ? { status, reason } : { status })
      }
    );

    return ok(updated, 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

function normalizeOrderId(raw: string): string {
  try {
    return decodeURIComponent(raw ?? '').trim();
  } catch {
    return '';
  }
}
