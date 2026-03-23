import type { Order } from '@/lib/api/types';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

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

  const orderId = normalizeOrderId(context.params.orderId);
  if (!orderId) {
    return fail(400, 'BAD_REQUEST', 'Invalid order id');
  }

  try {
    const order = await requestUpstream<Order>(`${serviceBaseUrls.order}/orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return ok(order, 'backend');
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
