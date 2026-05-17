import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';
import { authorizeLiveSeller, parseObjectBody } from '../../../_utils';

interface RouteContext {
  params: {
    sessionId: string;
  };
}

export async function GET(request: Request, context: RouteContext) {
  const authorized = authorizeLiveSeller(request);
  if (authorized instanceof Response) {
    return authorized;
  }

  const sessionId = context.params.sessionId?.trim();
  if (!sessionId) {
    return fail(400, 'BAD_REQUEST', 'Missing session id');
  }

  try {
    const products = await requestUpstream<unknown[]>(`${serviceBaseUrls.live}/live/sessions/${encodeURIComponent(sessionId)}/products`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${authorized.accessToken}` }
    });
    return ok(products);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const authorized = authorizeLiveSeller(request);
  if (authorized instanceof Response) {
    return authorized;
  }

  const sessionId = context.params.sessionId?.trim();
  if (!sessionId) {
    return fail(400, 'BAD_REQUEST', 'Missing session id');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  if (!parseObjectBody(body)) {
    return fail(400, 'BAD_REQUEST', 'Invalid product pin payload');
  }

  try {
    const product = await requestUpstream<unknown>(`${serviceBaseUrls.live}/live/sessions/${encodeURIComponent(sessionId)}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authorized.accessToken}`
      },
      body: JSON.stringify(body)
    });
    return ok(product, 'backend', 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
