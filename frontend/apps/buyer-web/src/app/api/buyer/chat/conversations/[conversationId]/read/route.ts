import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const CHAT_ROLES = new Set(['CUSTOMER', 'BUYER', 'ADMIN', 'SUPPORT', 'SUPER_ADMIN']);

interface RouteContext {
  params: Promise<{ conversationId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeJwtClaims(accessToken);
  if (!claims || !CHAT_ROLES.has(claims.role)) {
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

function readBearerToken(value: string | null): string {
  if (!value) return '';
  const [type, token] = value.split(' ');
  if (!type || !token || type.toLowerCase() !== 'bearer') {
    return '';
  }
  return token;
}

function decodeJwtClaims(accessToken: string): { role: string } | null {
  const parts = accessToken.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { role?: unknown };
    if (typeof payload.role !== 'string') {
      return null;
    }
    return { role: payload.role.trim().toUpperCase() };
  } catch {
    return null;
  }
}
