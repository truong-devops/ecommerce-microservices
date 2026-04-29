import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/moderator-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const MODERATOR_ROLES = new Set(['MODERATOR', 'ADMIN', 'SUPER_ADMIN']);

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

    if (!MODERATOR_ROLES.has(claims.role)) {
      return fail(403, 'FORBIDDEN', 'Role is not allowed for moderator dashboard');
    }

    return ok({
      user: {
        id: claims.sub,
        email: claims.email,
        role: claims.role,
        isEmailVerified: true,
        mfaEnabled: false
      }
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
