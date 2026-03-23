import type { Order } from '@/lib/api/types';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

interface RouteContext {
  params: {
    orderId: string;
  };
}

interface CancelBody {
  reason?: unknown;
}

export async function PATCH(request: Request, context: RouteContext) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const orderId = normalizeOrderId(context.params.orderId);
  if (!orderId) {
    return fail(400, 'BAD_REQUEST', 'Invalid order id');
  }

  let body: CancelBody;
  try {
    body = (await request.json()) as CancelBody;
  } catch {
    body = {};
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : undefined;

  try {
    const updated = await requestUpstream<Order>(`${serviceBaseUrls.order}/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(reason ? { reason } : {})
    });

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
