import type { ReturnRequest } from '@/lib/api/types';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

interface RouteContext { params: Promise<{ returnId: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const [type, token] = request.headers.get('authorization')?.split(' ') ?? [];
  if (type?.toLowerCase() !== 'bearer' || !token) return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  const returnId = decodeURIComponent((await context.params).returnId ?? '').trim();
  if (!returnId) return fail(400, 'BAD_REQUEST', 'Invalid return id');
  try {
    const result = await requestUpstream<ReturnRequest>(`${serviceBaseUrls.order}/returns/${encodeURIComponent(returnId)}/cancel`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
    return ok(result, 'backend');
  } catch (error) { return toErrorResponse(error); }
}
