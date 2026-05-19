import type { LiveMessagesOutput } from '@/lib/api/types';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { serviceBaseUrls, UpstreamHttpError } from '@/lib/server/upstream-client';
import { optionalAuthorizationHeader } from '../../../_utils';

interface RouteContext {
  params: {
    sessionId: string;
  };
}

interface UpstreamPaginatedResponse<T> {
  success?: boolean;
  data?: T[];
  error?: {
    code?: string;
    message?: string;
  };
  meta?: {
    pagination?: LiveMessagesOutput['pagination'];
  };
}

export async function GET(request: Request, context: RouteContext) {
  const sessionId = context.params.sessionId?.trim();
  if (!sessionId) {
    return fail(400, 'BAD_REQUEST', 'Missing session id');
  }

  const input = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  query.set('page', String(normalizePositiveInt(input.get('page'), 1)));
  query.set('pageSize', String(normalizePositiveInt(input.get('pageSize'), 50, 100)));

  try {
    const messages = await requestPaginatedLiveMessages(`${serviceBaseUrls.live}/live/sessions/${encodeURIComponent(sessionId)}/messages?${query.toString()}`, request);
    return ok(messages);
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function requestPaginatedLiveMessages(url: string, request: Request): Promise<LiveMessagesOutput> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: optionalAuthorizationHeader(request)
    });
  } catch {
    throw new UpstreamHttpError(503, 'UPSTREAM_UNAVAILABLE', 'Cannot connect to upstream service', true);
  }

  const payload = safeParseJson(await response.text()) as UpstreamPaginatedResponse<LiveMessagesOutput['items'][number]> | null;
  if (!response.ok) {
    throw new UpstreamHttpError(
      response.status,
      payload?.error?.code ?? `HTTP_${response.status}`,
      payload?.error?.message ?? `Upstream request failed with status ${response.status}`
    );
  }

  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    throw new UpstreamHttpError(502, 'INVALID_UPSTREAM_RESPONSE', 'Invalid live message history response');
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
