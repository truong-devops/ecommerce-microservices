import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/moderator-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { serviceBaseUrls, UpstreamHttpError } from '@/lib/server/upstream-client';
import type { ChatViolationListOutput } from '@/lib/api/types';

const MODERATION_ROLES = new Set(['MODERATOR', 'ADMIN', 'SUPPORT', 'SUPER_ADMIN']);

interface UpstreamPaginatedResponse<T> {
  success?: boolean;
  data?: T[];
  error?: {
    code?: string;
    message?: string;
  };
  meta?: {
    pagination?: ChatViolationListOutput['pagination'];
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
    return fail(403, 'FORBIDDEN', 'Role is not allowed for chat violation review');
  }

  const params = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  query.set('page', params.get('page') ?? '1');
  query.set('pageSize', params.get('pageSize') ?? '50');
  for (const key of ['senderId', 'ruleId', 'conversationId', 'createdFrom', 'createdTo']) {
    const value = params.get(key)?.trim();
    if (value) {
      query.set(key, value);
    }
  }

  try {
    const payload = await requestPaginatedChatViolations(`${serviceBaseUrls.chat}/chat/violations?${query.toString()}`, accessToken);
    return ok(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function requestPaginatedChatViolations(url: string, accessToken: string): Promise<ChatViolationListOutput> {
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

  const payload = safeParseJson(await response.text()) as UpstreamPaginatedResponse<ChatViolationListOutput['items'][number]> | null;
  if (!response.ok) {
    throw new UpstreamHttpError(
      response.status,
      payload?.error?.code ?? `HTTP_${response.status}`,
      payload?.error?.message ?? `Upstream request failed with status ${response.status}`
    );
  }

  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    throw new UpstreamHttpError(502, 'INVALID_UPSTREAM_RESPONSE', 'Invalid chat violation response');
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
