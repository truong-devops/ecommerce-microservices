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
    return ok(await requestUpstream(`${serviceBaseUrls.wallet}/wallets/me/bank-account`, { headers: { Authorization: `Bearer ${accessToken}` } }));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  const accessToken = token(request);
  if (!accessToken) return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  try {
    const body = await request.text();
    return ok(
      await requestUpstream(`${serviceBaseUrls.wallet}/wallets/me/bank-account`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body
      })
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
