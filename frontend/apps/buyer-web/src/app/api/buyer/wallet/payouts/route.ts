import { readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

function token(request: Request) {
  return readBearerToken(request.headers.get('authorization'));
}

export async function GET(request: Request) {
  const accessToken = token(request);
  if (!accessToken) return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  try {
    return ok(await requestUpstream(`${serviceBaseUrls.wallet}/payouts?page=1&pageSize=50`, { headers: { Authorization: `Bearer ${accessToken}` } }));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const accessToken = token(request);
  if (!accessToken) return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  const idempotencyKey = request.headers.get('idempotency-key')?.trim();
  if (!idempotencyKey) return fail(400, 'BAD_REQUEST', 'Missing Idempotency-Key header');
  try {
    const body = await request.text();
    return ok(
      await requestUpstream(`${serviceBaseUrls.wallet}/payouts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body
      }),
      'backend',
      201
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
