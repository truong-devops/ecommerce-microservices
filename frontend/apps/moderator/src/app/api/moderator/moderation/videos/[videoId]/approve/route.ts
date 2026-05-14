import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/moderator-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const MODERATION_ROLES = new Set(['MODERATOR', 'ADMIN', 'SUPER_ADMIN']);

export async function POST(request: Request, context: { params: { videoId: string } }) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  const claims = decodeAccessToken(accessToken);
  if (!claims) return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  if (!MODERATION_ROLES.has(claims.role)) return fail(403, 'FORBIDDEN', 'Role is not allowed for video moderation');

  try {
    const payload = await requestUpstream<unknown>(`${serviceBaseUrls.product}/moderation/videos/${context.params.videoId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return ok(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
