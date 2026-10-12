import { requestSellerApi } from './client';
import type {
  CreateSellerPayoutInput,
  ListSellerFinanceInput,
  ListSellerPayoutsInput,
  SellerBankAccount,
  SellerPayout,
  SellerPayoutListOutput,
  SellerPayoutSummary,
  SellerWalletBalance,
  SellerWalletTransactionListOutput,
  UpdateSellerBankAccountInput
} from './types';

function withAuth(accessToken: string, init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {})
    }
  };
}

function paginationQuery(input?: ListSellerFinanceInput): URLSearchParams {
  const query = new URLSearchParams();
  if (input?.page) query.set('page', String(input.page));
  if (input?.pageSize) query.set('pageSize', String(input.pageSize));
  return query;
}

export function getSellerWallet(accessToken: string): Promise<SellerWalletBalance> {
  return requestSellerApi<SellerWalletBalance>('/api/seller/wallet', withAuth(accessToken, { method: 'GET', cache: 'no-store' }));
}

export function listSellerWalletTransactions(accessToken: string, input?: ListSellerFinanceInput): Promise<SellerWalletTransactionListOutput> {
  const query = paginationQuery(input).toString();
  return requestSellerApi<SellerWalletTransactionListOutput>(
    `/api/seller/wallet/transactions${query ? `?${query}` : ''}`,
    withAuth(accessToken, { method: 'GET', cache: 'no-store' })
  );
}

export function getSellerBankAccount(accessToken: string): Promise<SellerBankAccount> {
  return requestSellerApi<SellerBankAccount>('/api/seller/wallet/bank-account', withAuth(accessToken, { method: 'GET', cache: 'no-store' }));
}

export function updateSellerBankAccount(accessToken: string, input: UpdateSellerBankAccountInput): Promise<SellerBankAccount> {
  return requestSellerApi<SellerBankAccount>(
    '/api/seller/wallet/bank-account',
    withAuth(accessToken, { method: 'PUT', body: JSON.stringify(input) })
  );
}

export function createSellerPayout(accessToken: string, input: CreateSellerPayoutInput, idempotencyKey: string): Promise<SellerPayout> {
  return requestSellerApi<SellerPayout>(
    '/api/seller/payouts',
    withAuth(accessToken, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ amount: input.amount, currency: input.currency ?? 'VND' })
    })
  );
}

export function listSellerPayouts(accessToken: string, input?: ListSellerPayoutsInput): Promise<SellerPayoutListOutput> {
  const query = paginationQuery(input);
  if (input?.status) query.set('status', input.status);
  const serialized = query.toString();
  return requestSellerApi<SellerPayoutListOutput>(
    `/api/seller/payouts${serialized ? `?${serialized}` : ''}`,
    withAuth(accessToken, { method: 'GET', cache: 'no-store' })
  );
}

export function getSellerPayout(accessToken: string, payoutId: string): Promise<SellerPayout> {
  return requestSellerApi<SellerPayout>(
    `/api/seller/payouts/${encodeURIComponent(payoutId)}`,
    withAuth(accessToken, { method: 'GET', cache: 'no-store' })
  );
}

export function getSellerPayoutSummary(accessToken: string, weekStart: Date, monthStart: Date): Promise<SellerPayoutSummary> {
  const query = new URLSearchParams({ weekStart: weekStart.toISOString(), monthStart: monthStart.toISOString() });
  return requestSellerApi<SellerPayoutSummary>(
    `/api/seller/payouts/summary?${query.toString()}`,
    withAuth(accessToken, { method: 'GET', cache: 'no-store' })
  );
}
