import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const VIDEO_EDIT_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN']);

export async function POST(request: Request, context: { params: { videoId: string } }) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!VIDEO_EDIT_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to publish videos');
  }

  const videoId = context.params.videoId?.trim();
  if (!videoId) {
    return fail(400, 'BAD_REQUEST', 'Missing video id');
  }

  try {
    const updated = await requestUpstream<unknown>(`${serviceBaseUrls.product}/videos/${videoId}/publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return ok(updated);
  } catch (error) {
    return toErrorResponse(error);
  }
}
