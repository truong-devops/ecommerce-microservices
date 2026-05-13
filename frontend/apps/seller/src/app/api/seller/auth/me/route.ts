import { readBearerToken } from '@/lib/server/access-token';
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
    const profile = await requestUpstream<Record<string, unknown>>(`${serviceBaseUrls.auth}/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const user = (profile as { user?: { role?: unknown } }).user;
    const role = typeof user?.role === 'string' ? user.role : '';

    if (!DASHBOARD_ROLES.has(role)) {
      return fail(403, 'FORBIDDEN', 'Role is not allowed for seller dashboard');
    }

    return ok(profile, 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}
