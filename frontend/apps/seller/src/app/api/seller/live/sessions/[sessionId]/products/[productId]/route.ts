import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';
import { authorizeLiveSeller } from '../../../../_utils';

interface RouteContext {
  params: {
    sessionId: string;
    productId: string;
  };
}

export async function DELETE(request: Request, context: RouteContext) {
  const authorized = authorizeLiveSeller(request);
  if (authorized instanceof Response) {
    return authorized;
  }

  const sessionId = context.params.sessionId?.trim();
  const productId = context.params.productId?.trim();
  if (!sessionId || !productId) {
    return fail(400, 'BAD_REQUEST', 'Missing session id or product id');
  }

  try {
    const product = await requestUpstream<unknown>(
      `${serviceBaseUrls.live}/live/sessions/${encodeURIComponent(sessionId)}/products/${encodeURIComponent(productId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authorized.accessToken}` }
      }
    );
    return ok(product);
  } catch (error) {
    return toErrorResponse(error);
  }
}
