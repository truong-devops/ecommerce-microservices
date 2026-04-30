import type { BuyerShopDetail } from '@/lib/api/types';
import { ok, fail } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

interface RouteContext {
  params: {
    sellerId: string;
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const sellerId = decodeSellerId(context.params.sellerId);
  if (!sellerId) {
    return fail(400, 'BAD_REQUEST', 'Invalid seller id');
  }

  try {
    const shop = await requestUpstream<BuyerShopDetail>(
      `${serviceBaseUrls.product}/shops/${encodeURIComponent(sellerId)}/decor`
    );

    return ok(shop, 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

function decodeSellerId(raw: string): string {
  try {
    return decodeURIComponent(raw ?? '').trim();
  } catch {
    return '';
  }
}
