import type { BuyerVideoCommentsOutput } from '@/lib/api/types';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls, UpstreamHttpError } from '@/lib/server/upstream-client';

interface RouteContext {
  params: Promise<{
    videoId: string;
  }>;
}

interface UpstreamPaginatedResponse<T> {
  success?: boolean;
  data?: T[];
  error?: {
    code?: string;
    message?: string;
  };
  meta?: {
    pagination?: BuyerVideoCommentsOutput['pagination'];
  };
}

export async function GET(request: Request, context: RouteContext) {
  const videoId = (await context.params).videoId?.trim();
  if (!videoId) {
    return fail(400, 'BAD_REQUEST', 'Missing video id');
  }

  const input = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  query.set('page', String(normalizePositiveInt(input.get('page'), 1)));
  query.set('pageSize', String(normalizePositiveInt(input.get('pageSize'), 20, 100)));

  try {
    const comments = await requestPaginatedVideoComments(`${serviceBaseUrls.gateway}/videos/${encodeURIComponent(videoId)}/comments?${query.toString()}`);
    return ok(comments);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const videoId = (await context.params).videoId?.trim();
  if (!videoId) {
    return fail(400, 'BAD_REQUEST', 'Missing video id');
  }

  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(400, 'BAD_REQUEST', 'Invalid comment payload');
  }

  try {
    const created = await requestUpstream<unknown>(`${serviceBaseUrls.gateway}/videos/${encodeURIComponent(videoId)}/comments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    return ok(created, 'backend', 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function requestPaginatedVideoComments(url: string): Promise<BuyerVideoCommentsOutput> {
  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', cache: 'no-store' });
  } catch {
    throw new UpstreamHttpError(503, 'UPSTREAM_UNAVAILABLE', 'Cannot connect to upstream service', true);
  }

  const payload = safeParseJson(await response.text()) as UpstreamPaginatedResponse<BuyerVideoCommentsOutput['items'][number]> | null;
  if (!response.ok) {
    throw new UpstreamHttpError(
      response.status,
      payload?.error?.code ?? `HTTP_${response.status}`,
      payload?.error?.message ?? `Upstream request failed with status ${response.status}`
    );
  }

  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    throw new UpstreamHttpError(502, 'INVALID_UPSTREAM_RESPONSE', 'Invalid video comments response');
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

function readBearerToken(value: string | null): string {
  if (!value) return '';
  const [type, token] = value.split(' ');
  if (!type || !token || type.toLowerCase() !== 'bearer') {
    return '';
  }
  return token;
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
