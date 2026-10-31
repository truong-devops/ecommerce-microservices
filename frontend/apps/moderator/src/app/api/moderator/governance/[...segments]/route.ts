import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/moderator-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const STAFF_ROLES = new Set(['MODERATOR', 'ADMIN', 'SUPER_ADMIN']);

export async function GET(request: Request, context: { params: Promise<{ segments: string[] }> }) {
  return proxyGovernanceRequest(request, context, 'GET');
}

export async function POST(request: Request, context: { params: Promise<{ segments: string[] }> }) {
  return proxyGovernanceRequest(request, context, 'POST');
}

export async function PATCH(request: Request, context: { params: Promise<{ segments: string[] }> }) {
  return proxyGovernanceRequest(request, context, 'PATCH');
}

async function proxyGovernanceRequest(request: Request, context: { params: Promise<{ segments: string[] }> }, method: 'GET' | 'POST' | 'PATCH') {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) return fail(401, 'UNAUTHORIZED', 'Missing bearer token');

  const claims = decodeAccessToken(accessToken);
  if (!claims) return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  if (!STAFF_ROLES.has(claims.role)) return fail(403, 'FORBIDDEN', 'Role is not allowed to access governance');

  const segments = (await context.params).segments ?? [];
  if (!isAllowedPath(segments, method)) return fail(404, 'NOT_FOUND', 'Governance route not found');

  const suffix = segments.map((segment) => encodeURIComponent(segment)).join('/');
  const search = new URL(request.url).search;
  try {
    const payload = await requestUpstream<unknown>(`${serviceBaseUrls.auth}/auth/governance/${suffix}${search}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {})
      },
      body: method !== 'GET' ? await request.text() : undefined
    });
    return ok(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}

function isAllowedPath(segments: string[], method: 'GET' | 'POST' | 'PATCH'): boolean {
  if (method === 'GET') {
    return segments.length === 1 && ['summary', 'policies', 'action-logs', 'system-logs', 'team'].includes(segments[0]);
  }
  if (method === 'POST') {
    return segments.length === 1 && ['policies', 'action-logs'].includes(segments[0]);
  }
  return segments.length === 2 && ['policies', 'team'].includes(segments[0]) && isUuid(segments[1]);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
