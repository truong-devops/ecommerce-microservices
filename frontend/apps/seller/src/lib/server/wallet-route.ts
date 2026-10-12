import { decodeAccessToken, readBearerToken } from './access-token';
import { fail } from './seller-api-response';

export function authorizeWalletSeller(request: Request): { accessToken: string } | Response {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) return fail(401, 'UNAUTHORIZED', 'Missing bearer token');

  const claims = decodeAccessToken(accessToken);
  if (!claims) return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  if (claims.role !== 'SELLER') return fail(403, 'FORBIDDEN', 'Only sellers can access wallet data');

  return { accessToken };
}

export function normalizePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!value || !Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function paginationFromMeta(meta: Record<string, unknown> | undefined, itemCount: number, page: number, pageSize: number) {
  const raw = meta?.pagination;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { page, pageSize, totalItems: itemCount, totalPages: itemCount === 0 ? 0 : Math.ceil(itemCount / pageSize) };
  }

  const candidate = raw as Record<string, unknown>;
  const totalItems = nonNegativeInt(candidate.totalItems, itemCount);
  return {
    page: positiveInt(candidate.page, page),
    pageSize: positiveInt(candidate.pageSize, pageSize),
    totalItems,
    totalPages: nonNegativeInt(candidate.totalPages, totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize))
  };
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}
