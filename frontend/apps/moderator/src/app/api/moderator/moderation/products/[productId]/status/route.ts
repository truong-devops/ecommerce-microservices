import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/moderator-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';
import type { ModerationProductStatus } from '@/lib/api/types';

const MODERATION_ROLES = new Set(['MODERATOR', 'ADMIN', 'SUPER_ADMIN']);
const ALLOWED_STATUSES = new Set<ModerationProductStatus>(['DRAFT', 'ACTIVE', 'HIDDEN', 'ARCHIVED']);

interface UpdateStatusBody {
  status?: unknown;
  reason?: unknown;
}

export async function PATCH(request: Request, context: { params: { productId: string } }) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!MODERATION_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to update product status');
  }

  const productId = context.params.productId;
  if (!productId) {
    return fail(400, 'BAD_REQUEST', 'Missing product id');
  }

  let body: UpdateStatusBody;

  try {
    body = (await request.json()) as UpdateStatusBody;
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  const status = typeof body.status === 'string' ? body.status.trim().toUpperCase() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : undefined;

  if (!status || !ALLOWED_STATUSES.has(status as ModerationProductStatus)) {
    return fail(400, 'BAD_REQUEST', 'Invalid status');
  }

  try {
    const updated = await requestUpstream<unknown>(`${serviceBaseUrls.product}/products/${productId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        status,
        reason: reason || undefined
      })
    });

    return ok(updated);
  } catch (error) {
    return toErrorResponse(error);
  }
}
