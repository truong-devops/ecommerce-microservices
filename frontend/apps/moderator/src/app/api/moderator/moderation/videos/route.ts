import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/moderator-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { serviceBaseUrls, UpstreamHttpError } from '@/lib/server/upstream-client';
import type { ModerationVideoListOutput } from '@/lib/api/types';

const MODERATION_ROLES = new Set(['MODERATOR', 'ADMIN', 'SUPER_ADMIN']);
const ALLOWED_STATUSES = new Set(['draft', 'processing', 'review_pending', 'published', 'hidden', 'rejected', 'archived']);

interface UpstreamPaginatedResponse<T> {
  success?: boolean;
  data?: T[];
  error?: {
    code?: string;
    message?: string;
  };
  meta?: {
    pagination?: ModerationVideoListOutput['pagination'];
  };
}

export async function GET(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!MODERATION_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed for video moderation');
  }

  const params = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  query.set('page', params.get('page') ?? '1');
  query.set('pageSize', params.get('pageSize') ?? '20');
  const status = params.get('status')?.trim() ?? '';
  if (ALLOWED_STATUSES.has(status)) {
    query.set('status', status);
  }

  try {
    const payload = await requestPaginatedModerationVideos(`${serviceBaseUrls.product}/moderation/videos?${query.toString()}`, accessToken);
    return ok(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function requestPaginatedModerationVideos(url: string, accessToken: string): Promise<ModerationVideoListOutput> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  } catch {
    throw new UpstreamHttpError(503, 'UPSTREAM_UNAVAILABLE', 'Cannot connect to upstream service', true);
  }

  const payload = safeParseJson(await response.text()) as UpstreamPaginatedResponse<ModerationVideoListOutput['items'][number]> | null;
  if (!response.ok) {
    throw new UpstreamHttpError(
      response.status,
      payload?.error?.code ?? `HTTP_${response.status}`,
      payload?.error?.message ?? `Upstream request failed with status ${response.status}`
    );
  }

  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    throw new UpstreamHttpError(502, 'INVALID_UPSTREAM_RESPONSE', 'Invalid video moderation response');
  }

  return {
    items: payload.data,
    pagination: payload.meta?.pagination ?? {
      page: 1,
      pageSize: payload.data.length,
      totalItems: payload.data.length,
      totalPages: 1
    }
  };
}

function safeParseJson(raw: string): unknown | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
