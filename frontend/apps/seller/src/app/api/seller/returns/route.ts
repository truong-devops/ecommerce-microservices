import type { SellerReturnListOutput, SellerReturnStatus } from '@/lib/api/types';
import { fail, ok } from '@/lib/server/seller-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const statuses = new Set<SellerReturnStatus>(['REQUESTED', 'APPROVED', 'RETURNING', 'REJECTED', 'REFUND_PENDING', 'REFUNDED', 'CANCELLED']);

export async function GET(request: Request) {
  const token = bearer(request); if (!token) return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  const input = new URL(request.url).searchParams; const query = new URLSearchParams();
  query.set('page', input.get('page') ?? '1'); query.set('pageSize', input.get('pageSize') ?? '100');
  const status = input.get('status') as SellerReturnStatus | null; if (status && statuses.has(status)) query.set('status', status);
  const search = input.get('search')?.trim(); if (search) query.set('search', search.slice(0, 255));
  try { return ok(await requestUpstream<SellerReturnListOutput>(`${serviceBaseUrls.order}/returns?${query}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })); }
  catch (error) { return toErrorResponse(error); }
}

function bearer(request: Request) { const [type, token] = request.headers.get('authorization')?.split(' ') ?? []; return type?.toLowerCase() === 'bearer' ? token : ''; }
