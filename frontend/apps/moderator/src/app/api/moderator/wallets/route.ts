import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/moderator-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstreamEnvelope, serviceBaseUrls } from '@/lib/server/upstream-client';

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

export async function GET(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) return fail(401, 'UNAUTHORIZED', 'Missing bearer token');

  const claims = decodeAccessToken(accessToken);
  if (!claims) return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  if (!ADMIN_ROLES.has(claims.role)) return fail(403, 'FORBIDDEN', 'Only administrators can manage wallets');

  try {
    const search = new URL(request.url).search;
    const envelope = await requestUpstreamEnvelope<unknown>(`${serviceBaseUrls.wallet}/admin/wallets${search}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return ok(withPagination(envelope.data, envelope.meta));
  } catch (error) {
    return toErrorResponse(error);
  }
}

function withPagination(data: unknown, meta?: Record<string, unknown>): unknown {
  const pagination = meta?.pagination;
  return pagination && Array.isArray(data) ? { items: data, pagination } : data;
}
