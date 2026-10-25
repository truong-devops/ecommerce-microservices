import type { PaymentGroup } from '@/lib/api/types';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

export async function POST(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  const idempotencyKey = request.headers.get('idempotency-key')?.trim() ?? '';
  if (!idempotencyKey) return fail(400, 'BAD_REQUEST', 'Missing Idempotency-Key header');

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fail(400, 'BAD_REQUEST', 'Invalid payment group payload');
  }

  try {
    const group = await requestUpstream<PaymentGroup>(`${serviceBaseUrls.payment}/payments/groups/intents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(payload)
    });
    return ok(group, 'backend', 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}

function readBearerToken(value: string | null): string {
  if (!value) return '';
  const [type, token] = value.split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token : '';
}
