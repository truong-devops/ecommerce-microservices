import type { SellerPayoutSummary } from '@/lib/api/types';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';
import { authorizeWalletSeller } from '@/lib/server/wallet-route';

export async function GET(request: Request) {
  const authorization = authorizeWalletSeller(request);
  if (authorization instanceof Response) return authorization;

  const search = new URL(request.url).searchParams;
  const weekStart = parseDate(search.get('weekStart'));
  const monthStart = parseDate(search.get('monthStart'));
  if (!weekStart || !monthStart) return fail(400, 'VALIDATION_FAILED', 'Khoảng thời gian báo cáo chưa hợp lệ');

  const query = new URLSearchParams({ weekStart: weekStart.toISOString(), monthStart: monthStart.toISOString() });
  try {
    const summary = await requestUpstream<SellerPayoutSummary>(`${serviceBaseUrls.wallet}/payouts/summary?${query.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${authorization.accessToken}` }
    });
    return ok(summary);
  } catch (error) {
    return toErrorResponse(error);
  }
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
