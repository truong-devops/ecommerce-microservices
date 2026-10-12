import type { SellerPayout, SellerPayoutStatus } from '@/lib/api/types';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, requestUpstreamEnvelope, serviceBaseUrls } from '@/lib/server/upstream-client';
import { authorizeWalletSeller, normalizePositiveInt, paginationFromMeta } from '@/lib/server/wallet-route';

const PAYOUT_STATUSES = new Set<SellerPayoutStatus>(['REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED']);

export async function GET(request: Request) {
  const authorization = authorizeWalletSeller(request);
  if (authorization instanceof Response) return authorization;
  const search = new URL(request.url).searchParams;
  const page = normalizePositiveInt(search.get('page'), 1, 1_000_000);
  const pageSize = normalizePositiveInt(search.get('pageSize'), 20, 100);
  const status = search.get('status')?.toUpperCase() ?? '';
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (PAYOUT_STATUSES.has(status as SellerPayoutStatus)) query.set('status', status);

  try {
    const envelope = await requestUpstreamEnvelope<SellerPayout[]>(`${serviceBaseUrls.wallet}/payouts?${query.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${authorization.accessToken}` }
    });
    const items = Array.isArray(envelope.data) ? envelope.data : [];
    return ok({ items, pagination: paginationFromMeta(envelope.meta, items.length, page, pageSize) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const authorization = authorizeWalletSeller(request);
  if (authorization instanceof Response) return authorization;
  const idempotencyKey = request.headers.get('idempotency-key')?.trim() ?? '';
  if (idempotencyKey.length < 8 || idempotencyKey.length > 255) return fail(400, 'VALIDATION_FAILED', 'Idempotency-Key chưa hợp lệ');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'VALIDATION_FAILED', 'Invalid payout payload');
  const input = body as Record<string, unknown>;
  const amount = input.amount;
  const currency = typeof input.currency === 'string' ? input.currency.toUpperCase() : 'VND';
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0 || currency !== 'VND') {
    return fail(400, 'VALIDATION_FAILED', 'Số tiền rút chưa hợp lệ');
  }

  try {
    const envelope = await requestUpstreamEnvelope<SellerPayout>(`${serviceBaseUrls.wallet}/payouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorization.accessToken}`, 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ amount, currency })
    });
    const response = ok(envelope.data, 'backend', envelope.status === 200 ? 200 : 201);
    if (envelope.idempotentReplayed) response.headers.set('Idempotent-Replayed', 'true');
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
