import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const CHAT_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT']);

interface RouteContext {
  params: Promise<{ conversationId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!CHAT_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to access chat');
  }

  const { conversationId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const upstreamUrl = `${serviceBaseUrls.chat}/chat/conversations/${encodeURIComponent(conversationId)}/read`;
  try {
    const payload = await requestUpstream<unknown>(upstreamUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body ?? {})
    });

    return ok(payload, 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}
