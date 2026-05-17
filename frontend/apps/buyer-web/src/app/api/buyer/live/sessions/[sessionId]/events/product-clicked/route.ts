import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';
import { optionalAuthorizationHeader } from '../../../../_utils';

interface RouteContext {
  params: {
    sessionId: string;
  };
}

export async function POST(request: Request, context: RouteContext) {
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

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(400, 'BAD_REQUEST', 'Invalid product click payload');
  }

  try {
    const result = await requestUpstream<unknown>(`${serviceBaseUrls.live}/live/sessions/${encodeURIComponent(sessionId)}/events/product-clicked`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(optionalAuthorizationHeader(request) ?? {})
      },
      body: JSON.stringify(body)
    });
    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
