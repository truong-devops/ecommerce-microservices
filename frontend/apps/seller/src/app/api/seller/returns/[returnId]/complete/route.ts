import type { SellerReturnRequest } from '@/lib/api/types';
import { fail, ok } from '@/lib/server/seller-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

interface Context { params: Promise<{ returnId: string }> }
export async function PATCH(request: Request, context: Context) {
  const [type, token] = request.headers.get('authorization')?.split(' ') ?? []; if (type?.toLowerCase() !== 'bearer' || !token) return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  const returnId = decodeURIComponent((await context.params).returnId ?? '').trim(); if (!returnId) return fail(400, 'BAD_REQUEST', 'Invalid return id');
  let body: unknown = {}; try { body = await request.json(); } catch {}
  try { return ok(await requestUpstream<SellerReturnRequest>(`${serviceBaseUrls.order}/returns/${encodeURIComponent(returnId)}/complete`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })); }
  catch (error) { return toErrorResponse(error); }
}
