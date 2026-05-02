import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const CHAT_ROLES = new Set(['CUSTOMER', 'BUYER', 'ADMIN', 'SUPPORT', 'SUPER_ADMIN']);

export async function GET(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeJwtClaims(accessToken);
  if (!claims || !CHAT_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to access chat');
  }

  const input = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  const page = sanitizePositiveInt(input.get('page'), 1, 1, 100000);
  const pageSize = sanitizePositiveInt(input.get('pageSize'), 20, 1, 100);
  query.set('page', String(page));
  query.set('pageSize', String(pageSize));

  const upstreamUrl = `${serviceBaseUrls.chat}/chat/conversations?${query.toString()}`;
  try {
    const payload = await requestUpstream<unknown>(upstreamUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return ok(payload, 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeJwtClaims(accessToken);
  if (!claims || !CHAT_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to access chat');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  const upstreamUrl = `${serviceBaseUrls.chat}/chat/conversations`;
  try {
    const payload = await requestUpstream<unknown>(upstreamUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body ?? {})
    });

    return ok(payload, 'backend', 201);
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

function sanitizePositiveInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const normalized = Math.floor(n);
  if (normalized < min) return min;
  if (normalized > max) return max;
  return normalized;
}
