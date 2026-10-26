import type { CreateReturnRequestInput, ReturnRequest } from '@/lib/api/types';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

interface RouteContext { params: Promise<{ orderId: string }> }

export async function GET(request: Request, context: RouteContext) {
  return proxy(request, context, 'GET');
}

export async function POST(request: Request, context: RouteContext) {
  return proxy(request, context, 'POST');
}

async function proxy(request: Request, context: RouteContext, method: 'GET' | 'POST') {
  const token = readBearerToken(request.headers.get('authorization'));
  if (!token) return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  const orderId = decodeURIComponent((await context.params).orderId ?? '').trim();
  if (!orderId) return fail(400, 'BAD_REQUEST', 'Invalid order id');
  let body: CreateReturnRequestInput | undefined;
  if (method === 'POST') {
    try { body = (await request.json()) as CreateReturnRequestInput; } catch { return fail(400, 'BAD_REQUEST', 'Invalid JSON body'); }
  }
  try {
    const result = await requestUpstream<ReturnRequest>(`${serviceBaseUrls.order}/orders/${encodeURIComponent(orderId)}/returns`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    return ok(result, 'backend', method === 'POST' ? 201 : 200);
  } catch (error) { return toErrorResponse(error); }
}

function readBearerToken(value: string | null) { const [type, token] = value?.split(' ') ?? []; return type?.toLowerCase() === 'bearer' && token ? token : ''; }
