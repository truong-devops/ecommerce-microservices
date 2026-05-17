import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { fail } from '@/lib/server/seller-api-response';

const LIVE_MANAGE_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN']);

export function authorizeLiveSeller(request: Request): { accessToken: string } | Response {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!LIVE_MANAGE_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to manage livestreams');
  }

  return { accessToken };
}

export function parseObjectBody(body: unknown): body is Record<string, unknown> {
  return Boolean(body && typeof body === 'object' && !Array.isArray(body));
}

export function normalizePositiveInt(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}
