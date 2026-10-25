import { readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

export async function GET(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  try {
    return ok(
      await requestUpstream(`${serviceBaseUrls.wallet}/wallets/me`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
