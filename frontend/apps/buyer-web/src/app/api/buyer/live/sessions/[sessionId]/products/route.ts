import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

interface RouteContext {
  params: {
    sessionId: string;
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const sessionId = context.params.sessionId?.trim();
  if (!sessionId) {
    return fail(400, 'BAD_REQUEST', 'Missing session id');
  }

  try {
    const products = await requestUpstream<unknown[]>(`${serviceBaseUrls.gateway}/live/sessions/${encodeURIComponent(sessionId)}/products`);
    return ok(products);
  } catch (error) {
    return toErrorResponse(error);
  }
}
