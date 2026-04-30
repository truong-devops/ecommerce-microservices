import type { SellerShipment } from '@/lib/api/types';
import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { UpstreamHttpError, requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const SHIPMENT_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT']);
const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  if (!SHIPMENT_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to get shipment');
  }

  const orderId = normalizeOrderId(context.params.orderId);
  if (!ORDER_ID_PATTERN.test(orderId)) {
    return fail(400, 'BAD_REQUEST', 'Invalid order id');
  }

  try {
    const shipment = await requestUpstream<SellerShipment>(`${serviceBaseUrls.shipping}/shipments/order/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return ok(shipment, 'backend');
  } catch (error) {
    if (error instanceof UpstreamHttpError && error.status === 404) {
      return ok<SellerShipment | null>(null, 'backend');
    }

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
