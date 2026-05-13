import { readBearerToken } from '@/lib/server/access-token';
import { ok, fail } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

export async function GET(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  try {
    const profile = await requestUpstream<Record<string, unknown>>(`${serviceBaseUrls.auth}/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return ok(profile, 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}
