import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/seller-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const DASHBOARD_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT']);

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

    if (!DASHBOARD_ROLES.has(claims.role)) {
      return fail(403, 'FORBIDDEN', 'Role is not allowed for seller dashboard');
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
