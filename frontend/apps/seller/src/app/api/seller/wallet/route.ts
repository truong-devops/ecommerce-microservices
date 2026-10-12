import type { SellerWalletBalance } from '@/lib/api/types';
import { toErrorResponse } from '@/lib/server/route-error';
import { ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';
import { authorizeWalletSeller } from '@/lib/server/wallet-route';

export async function GET(request: Request) {
  const authorization = authorizeWalletSeller(request);
  if (authorization instanceof Response) return authorization;

  try {
    const wallet = await requestUpstream<SellerWalletBalance>(`${serviceBaseUrls.wallet}/wallets/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${authorization.accessToken}` }
    });
    return ok(wallet);
  } catch (error) {
    return toErrorResponse(error);
  }
}
