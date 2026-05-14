import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const VIDEO_MANAGE_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'MODERATOR']);
const VIDEO_CREATE_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN']);
const VIDEO_STATUSES = new Set(['draft', 'processing', 'processing_failed', 'review_pending', 'published', 'hidden', 'rejected', 'archived']);

export async function GET(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!VIDEO_MANAGE_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to list videos');
  }

  const params = new URL(request.url).searchParams;
  const queryParams = new URLSearchParams();
  queryParams.set('page', String(normalizePositiveInt(params.get('page'), 1)));
  queryParams.set('pageSize', String(normalizePositiveInt(params.get('pageSize'), 20, 100)));

  const status = params.get('status')?.trim() ?? '';
  if (VIDEO_STATUSES.has(status)) {
    queryParams.set('status', status);
  }

  const search = params.get('search')?.trim() ?? '';
  if (search) {
    queryParams.set('search', search);
  }

  try {
    const videos = await requestUpstream<unknown>(`${serviceBaseUrls.product}/videos/me?${queryParams.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return ok(videos);
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

  if (!VIDEO_CREATE_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to create videos');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(400, 'BAD_REQUEST', 'Invalid video payload');
  }

  try {
    const created = await requestUpstream<unknown>(`${serviceBaseUrls.product}/videos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(body)
    });

    return ok(created, 'backend', 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}

function normalizePositiveInt(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}
