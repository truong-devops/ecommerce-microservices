import type { SellerOrder } from '@/lib/api/types';
import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { enrichOrderWithProductImages } from '@/lib/server/order-product-images';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const ORDER_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT']);

interface RouteContext {
  params: {
    orderId: string;
  };
}

export async function GET(request: Request, context: RouteContext) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!ORDER_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to get order detail');
  }

  const orderId = normalizeOrderId(context.params.orderId);
  if (!orderId) {
    return fail(400, 'BAD_REQUEST', 'Invalid order id');
  }

  try {
    const order = await requestUpstream<SellerOrder>(`${serviceBaseUrls.order}/orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const enriched = await enrichOrderWithProductImages(order, accessToken);
    return ok(enriched, 'backend');
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
