import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/moderator-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstreamEnvelope, serviceBaseUrls } from '@/lib/server/upstream-client';

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

export async function GET(request: Request, context: { params: Promise<{ segments: string[] }> }) {
  return proxyWalletRequest(request, context, 'GET');
}

export async function PATCH(request: Request, context: { params: Promise<{ segments: string[] }> }) {
  return proxyWalletRequest(request, context, 'PATCH');
}

export async function POST(request: Request, context: { params: Promise<{ segments: string[] }> }) {
  return proxyWalletRequest(request, context, 'POST');
}

async function proxyWalletRequest(request: Request, context: { params: Promise<{ segments: string[] }> }, method: 'GET' | 'PATCH' | 'POST') {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) return fail(401, 'UNAUTHORIZED', 'Missing bearer token');

  const claims = decodeAccessToken(accessToken);
  if (!claims) return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  if (!ADMIN_ROLES.has(claims.role)) return fail(403, 'FORBIDDEN', 'Only administrators can manage wallets');

  const segments = (await context.params).segments ?? [];
  if (!isAllowedPath(segments, method)) return fail(404, 'NOT_FOUND', 'Wallet administration route not found');

  const suffix = segments.map((segment) => encodeURIComponent(segment)).join('/');
  const search = new URL(request.url).search;

  try {
    const envelope = await requestUpstreamEnvelope<unknown>(`${serviceBaseUrls.wallet}/admin/wallets/${suffix}${search}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(method === 'PATCH' ? { 'Content-Type': 'application/json' } : {})
      },
      body: method === 'PATCH' ? await request.text() : undefined
    });
    const pagination = envelope.meta?.pagination;
    const response = ok(pagination && Array.isArray(envelope.data) ? { items: envelope.data, pagination } : envelope.data);
    if (method === 'POST' && segments[0] === 'payouts') response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}

function isAllowedPath(segments: string[], method: 'GET' | 'PATCH' | 'POST'): boolean {
  if (method === 'GET') {
    if (segments.length === 1 && ['summary', 'payouts', 'audit-logs'].includes(segments[0])) return true;
    if (segments.length === 1) return isUuid(segments[0]);
    return segments.length === 2 && isUuid(segments[0]) && segments[1] === 'transactions';
  }

  if (method === 'POST') {
    return segments.length === 3 && segments[0] === 'payouts' && isUuid(segments[1]) && segments[2] === 'prepare';
  }

  if (segments.length === 2 && segments[0] === 'payouts') return isUuid(segments[1]);
  if (segments.length === 2) return isUuid(segments[0]) && segments[1] === 'status';
  return segments.length === 3 && isUuid(segments[0]) && segments[1] === 'bank-account' && segments[2] === 'status';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
