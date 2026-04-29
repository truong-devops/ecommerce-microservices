import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/moderator-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';
import type { ModerationProductStatus } from '@/lib/api/types';

const MODERATION_ROLES = new Set(['MODERATOR', 'ADMIN', 'SUPER_ADMIN']);
const ALLOWED_STATUSES = new Set<ModerationProductStatus>(['DRAFT', 'ACTIVE', 'HIDDEN', 'ARCHIVED']);

interface ProductListItem {
  id: string;
  sellerId: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  brand: string | null;
  status: ModerationProductStatus;
  attributes: Record<string, unknown>;
  images: string[];
  variants: Array<{
    sku: string;
    name: string;
    price: number;
    currency: string;
    compareAtPrice: number | null;
    isDefault: boolean;
    metadata: Record<string, unknown>;
  }>;
  minPrice: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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
    return fail(403, 'FORBIDDEN', 'Role is not allowed for moderation');
  }

  const params = new URL(request.url).searchParams;
  const page = normalizePositiveInt(params.get('page'), 1);
  const pageSize = normalizePositiveInt(params.get('pageSize'), 20, 100);
  const statusRaw = params.get('status');
  const search = params.get('search')?.trim() || '';

  const status = statusRaw && ALLOWED_STATUSES.has(statusRaw as ModerationProductStatus) ? (statusRaw as ModerationProductStatus) : null;

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('pageSize', String(pageSize));
  queryParams.set('sortBy', 'createdAt');
  queryParams.set('sortOrder', 'DESC');

  if (status) {
    queryParams.set('status', status);
  }

  if (search) {
    queryParams.set('search', search);
  }

  try {
    const payload = await requestUpstream<unknown>(`${serviceBaseUrls.product}/products/my?${queryParams.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const parsed = normalizeManagedProductsPayload(payload);
    const totalItems = parsed.totalItems ?? parsed.items.length;
    const totalPages = parsed.totalPages ?? Math.max(1, Math.ceil(totalItems / pageSize));

    return ok({
      items: parsed.items,
      page,
      pageSize,
      hasNext: page < totalPages,
      totalItems,
      totalPages
    });
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

function normalizeManagedProductsPayload(input: unknown): {
  items: ProductListItem[];
  totalItems?: number;
  totalPages?: number;
} {
  if (Array.isArray(input)) {
    return {
      items: input as ProductListItem[]
    };
  }

  if (!input || typeof input !== 'object') {
    return {
      items: []
    };
  }

  const source = input as {
    items?: unknown;
    pagination?: {
      totalItems?: unknown;
      totalPages?: unknown;
    };
  };

  const items = Array.isArray(source.items) ? (source.items as ProductListItem[]) : [];
  const totalItems = typeof source.pagination?.totalItems === 'number' ? source.pagination.totalItems : undefined;
  const totalPages = typeof source.pagination?.totalPages === 'number' ? source.pagination.totalPages : undefined;

  return {
    items,
    totalItems,
    totalPages
  };
}
