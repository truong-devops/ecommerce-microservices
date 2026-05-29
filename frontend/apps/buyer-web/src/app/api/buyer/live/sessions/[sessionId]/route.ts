import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';
import { optionalAuthorizationHeader } from '../../_utils';

interface RouteContext {
  params: Promise<{
    sessionId: string;
  }>;
}

export async function GET(request: Request, context: RouteContext) {
  const sessionId = (await context.params).sessionId?.trim();
  if (!sessionId) {
    return fail(400, 'BAD_REQUEST', 'Missing session id');
  }

  try {
    const detail = await requestUpstream<unknown>(`${serviceBaseUrls.gateway}/live/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: optionalAuthorizationHeader(request)
    });
    return ok(detail);
  } catch (error) {
    return toErrorResponse(error);
  }
}
