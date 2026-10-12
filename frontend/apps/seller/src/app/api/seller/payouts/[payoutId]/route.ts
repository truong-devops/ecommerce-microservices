import type { SellerPayout } from '@/lib/api/types';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';
import { authorizeWalletSeller } from '@/lib/server/wallet-route';

interface RouteContext {
  params: Promise<{ payoutId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const authorization = authorizeWalletSeller(request);
  if (authorization instanceof Response) return authorization;
  const { payoutId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payoutId)) {
    return fail(400, 'VALIDATION_FAILED', 'Mã yêu cầu rút tiền chưa hợp lệ');
  }

  try {
    const payout = await requestUpstream<SellerPayout>(`${serviceBaseUrls.wallet}/payouts/${encodeURIComponent(payoutId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${authorization.accessToken}` }
    });
    return ok(payout);
  } catch (error) {
    return toErrorResponse(error);
  }
}
