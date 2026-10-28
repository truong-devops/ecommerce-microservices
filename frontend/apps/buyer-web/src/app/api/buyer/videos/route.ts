import type { BuyerVideoFeedOutput } from '@/lib/api/types';
import { ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { serviceBaseUrls, UpstreamHttpError } from '@/lib/server/upstream-client';

interface UpstreamPaginatedResponse<T> {
  success?: boolean;
  data?: T[];
  error?: {
    code?: string;
    message?: string;
  };
  meta?: {
    pagination?: BuyerVideoFeedOutput['pagination'];
  };
}

const MEDIA_PUBLIC_BASE_URL = (
  process.env.MEDIA_PUBLIC_BASE_URL ??
  process.env.NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL ??
  'https://media.truongam.tech/ecommerce-media'
).replace(/\/$/, '');

export async function GET(request: Request) {
  const input = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  query.set('page', String(normalizePositiveInt(input.get('page'), 1)));
  query.set('pageSize', String(normalizePositiveInt(input.get('pageSize'), 12, 50)));

  for (const key of ['productId', 'sellerId']) {
    const value = input.get(key)?.trim();
    if (value) {
      query.set(key, value);
    }
  }

  try {
    const payload = await requestPaginatedVideoFeed(`${serviceBaseUrls.gateway}/videos/feed?${query.toString()}`);
    // Normalize mediaUrl and thumbnailUrl so browser can play videos reliably
    const normalizedItems = payload.items.map((video) => ({
      ...video,
      mediaUrl: normalizeMediaUrl(video.mediaUrl),
      thumbnailUrl: normalizeMediaUrl(video.thumbnailUrl)
    }));

    return ok({
      ...payload,
      items: normalizedItems
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function normalizeMediaUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  if (!/^https?:\/\//i.test(value)) {
    const relative = value.replace(/^\/?(ecommerce-media\/)?/, '');
    return `${MEDIA_PUBLIC_BASE_URL}/${relative}`;
  }

  const legacyPrefixes = [
    'http://localhost:3003/',
    'http://127.0.0.1:3003/',
    'http://localhost:12030/',
    'http://127.0.0.1:12030/',
    'http://localhost:9000/',
    'http://127.0.0.1:9000/',
    'http://minio:9000/',
    'http://rustfs:9000/'
  ];

  for (const prefix of legacyPrefixes) {
    if (value.startsWith(prefix)) {
      const relativePath = value.slice(prefix.length).replace(/^ecommerce-media\//, '');
      return `${MEDIA_PUBLIC_BASE_URL}/${relativePath}`;
    }
  }

  if (value.startsWith('http://media.truongam.tech')) {
    return value.replace(/^http:\/\//i, 'https://');
  }

  return value;
}

async function requestPaginatedVideoFeed(url: string): Promise<BuyerVideoFeedOutput> {
  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', cache: 'no-store' });
  } catch {
    throw new UpstreamHttpError(503, 'UPSTREAM_UNAVAILABLE', 'Cannot connect to upstream service', true);
  }

  const payload = safeParseJson(await response.text()) as UpstreamPaginatedResponse<BuyerVideoFeedOutput['items'][number]> | null;
  if (!response.ok) {
    throw new UpstreamHttpError(
      response.status,
      payload?.error?.code ?? `HTTP_${response.status}`,
      payload?.error?.message ?? `Upstream request failed with status ${response.status}`
    );
  }

  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    throw new UpstreamHttpError(502, 'INVALID_UPSTREAM_RESPONSE', 'Invalid video feed response');
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
