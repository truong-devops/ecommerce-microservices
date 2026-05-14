import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const VIDEO_CREATE_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN']);
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);

export async function POST(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!VIDEO_CREATE_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to upload videos');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(400, 'BAD_REQUEST', 'Invalid presign payload');
  }

  const source = body as Record<string, unknown>;
  const videoId = typeof source.videoId === 'string' ? source.videoId.trim() : '';
  const fileName = typeof source.fileName === 'string' ? source.fileName.trim() : '';
  const contentType = typeof source.contentType === 'string' ? source.contentType.trim().toLowerCase() : '';

  if (!videoId || !fileName || !ALLOWED_VIDEO_TYPES.has(contentType)) {
    return fail(400, 'BAD_REQUEST', 'videoId, fileName and supported contentType are required');
  }

  try {
    const presigned = await requestUpstream<unknown>(`${serviceBaseUrls.media}/media/presign-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        entityType: 'video',
        entityId: videoId,
        fileName,
        contentType,
        expiresInSeconds: 900
      })
    });

    return ok(presigned, 'backend', 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
