import type { Payment } from '@/lib/api/types';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { UpstreamHttpError, requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

interface RouteContext {
  params: {
    orderId: string;
  };
}

const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: RouteContext) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const orderId = normalizeOrderId(context.params.orderId);
  if (!ORDER_ID_PATTERN.test(orderId)) {
    return fail(400, 'BAD_REQUEST', 'Invalid order id');
  }

  try {
    const payment = await requestUpstream<Payment>(
      `${serviceBaseUrls.payment}/payments/order/${encodeURIComponent(orderId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    return ok(payment, 'backend');
  } catch (error) {
    if (error instanceof UpstreamHttpError && error.status === 404) {
      return ok<Payment | null>(null, 'backend');
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
