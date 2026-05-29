import type { ReviewSummary } from '@/lib/api/types';
import { isValidProductId } from '@/lib/product-id';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

interface RouteContext {
  params: Promise<{
    productId: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  let productId = '';
  try {
    productId = decodeURIComponent((await context.params).productId ?? '').trim();
  } catch {
    return fail(400, 'INVALID_PRODUCT_ID', 'Invalid product identifier');
  }

  if (!isValidProductId(productId)) {
    return fail(400, 'INVALID_PRODUCT_ID', 'Invalid product identifier');
  }

  try {
    const result = await requestUpstream<ReviewSummary>(
      `${serviceBaseUrls.review}/reviews/products/${encodeURIComponent(productId)}/summary`,
      {
        method: 'GET',
        cache: 'no-store'
      }
    );

    return ok(result, 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}
