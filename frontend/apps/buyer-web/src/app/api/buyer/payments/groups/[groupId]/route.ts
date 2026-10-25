import type { PaymentGroup } from '@/lib/api/types';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

interface RouteContext { params: Promise<{ groupId: string }> }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: RouteContext) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  const groupId = decodeURIComponent((await context.params).groupId ?? '').trim();
  if (!UUID_PATTERN.test(groupId)) return fail(400, 'BAD_REQUEST', 'Invalid payment group id');

  try {
    const group = await requestUpstream<PaymentGroup>(
      `${serviceBaseUrls.payment}/payments/groups/${encodeURIComponent(groupId)}`,
      { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return ok(group, 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

function readBearerToken(value: string | null): string {
  if (!value) return '';
  const [type, token] = value.split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token : '';
}
