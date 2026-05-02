import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const CHAT_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT']);

export async function GET(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!CHAT_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to access chat');
  }

  const input = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  const page = sanitizePositiveInt(input.get('page'), 1, 1, 100000);
  const pageSize = sanitizePositiveInt(input.get('pageSize'), 20, 1, 100);
  query.set('page', String(page));
  query.set('pageSize', String(pageSize));

  const upstreamUrl = `${serviceBaseUrls.chat}/chat/conversations?${query.toString()}`;
  try {
    const payload = await requestUpstream<unknown>(upstreamUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return ok(payload, 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!CHAT_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to access chat');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  const upstreamUrl = `${serviceBaseUrls.chat}/chat/conversations`;
  try {
    const payload = await requestUpstream<unknown>(upstreamUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body ?? {})
    });

    return ok(payload, 'backend', 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}

function sanitizePositiveInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const normalized = Math.floor(n);
  if (normalized < min) return min;
  if (normalized > max) return max;
  return normalized;
}
