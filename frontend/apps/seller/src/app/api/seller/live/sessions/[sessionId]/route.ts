import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';
import { authorizeLiveSeller, parseObjectBody } from '../../_utils';

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
    const detail = await requestUpstream<unknown>(`${serviceBaseUrls.live}/live/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${authorized.accessToken}` }
    });
    return ok(detail);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
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
    return fail(400, 'BAD_REQUEST', 'Invalid live session payload');
  }

  try {
    const updated = await requestUpstream<unknown>(`${serviceBaseUrls.live}/live/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authorized.accessToken}`
      },
      body: JSON.stringify(body)
    });
    return ok(updated);
  } catch (error) {
    return toErrorResponse(error);
  }
}
