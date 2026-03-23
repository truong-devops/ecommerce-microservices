import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { ok, fail } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

export async function GET(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  try {
    await requestUpstream<Record<string, unknown>>(`${serviceBaseUrls.auth}/auth/sessions`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const claims = decodeAccessToken(accessToken);
    if (!claims) {
      return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
    }

    return ok(
      {
        user: {
          id: claims.sub,
          email: claims.email,
          role: claims.role,
          isEmailVerified: true,
          // TODO(auth-service): replace default with real value when /auth/me endpoint exists.
          mfaEnabled: false
        }
      },
      'backend'
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
