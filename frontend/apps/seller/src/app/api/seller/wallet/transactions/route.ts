import type { SellerWalletTransaction } from '@/lib/api/types';
import { toErrorResponse } from '@/lib/server/route-error';
import { ok } from '@/lib/server/seller-api-response';
import { requestUpstreamEnvelope, serviceBaseUrls } from '@/lib/server/upstream-client';
import { authorizeWalletSeller, normalizePositiveInt, paginationFromMeta } from '@/lib/server/wallet-route';

export async function GET(request: Request) {
  const authorization = authorizeWalletSeller(request);
  if (authorization instanceof Response) return authorization;

  const search = new URL(request.url).searchParams;
  const page = normalizePositiveInt(search.get('page'), 1, 1_000_000);
  const pageSize = normalizePositiveInt(search.get('pageSize'), 20, 100);

  try {
    const envelope = await requestUpstreamEnvelope<SellerWalletTransaction[]>(
      `${serviceBaseUrls.wallet}/wallets/me/transactions?page=${page}&pageSize=${pageSize}`,
      { method: 'GET', headers: { Authorization: `Bearer ${authorization.accessToken}` } }
    );
    const items = Array.isArray(envelope.data) ? envelope.data : [];
    return ok({ items, pagination: paginationFromMeta(envelope.meta, items.length, page, pageSize) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
