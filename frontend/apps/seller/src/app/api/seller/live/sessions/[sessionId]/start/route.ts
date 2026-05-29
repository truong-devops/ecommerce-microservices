import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';
import { authorizeLiveSeller } from '../../../_utils';

interface RouteContext {
  params: Promise<{
    sessionId: string;
  }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const authorized = authorizeLiveSeller(request);
  if (authorized instanceof Response) {
    return authorized;
  }

  const sessionId = (await context.params).sessionId?.trim();
  if (!sessionId) {
    return fail(400, 'BAD_REQUEST', 'Missing session id');
  }

  try {
    const session = await requestUpstream<unknown>(`${serviceBaseUrls.live}/live/sessions/${encodeURIComponent(sessionId)}/start`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${authorized.accessToken}` }
    });
    return ok(session);
  } catch (error) {
    return toErrorResponse(error);
  }
}
