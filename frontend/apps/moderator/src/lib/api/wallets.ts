import { requestModeratorApi } from './client';
import type {
  AdminPayout,
  AdminPayoutTransfer,
  AdminWallet,
  AdminWalletSummary,
  BankAccountStatus,
  PaginatedOutput,
  PayoutStatus,
  WalletAuditLog,
  WalletTransaction
} from './types';

interface AuthenticatedQuery {
  accessToken: string;
}

export interface ListAdminWalletsQuery extends AuthenticatedQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  state?: '' | 'ACTIVE' | 'FROZEN';
  bankStatus?: '' | BankAccountStatus | 'MISSING';
  ownerType?: '' | 'SELLER' | 'CUSTOMER';
}

export async function getWalletSummary(accessToken: string): Promise<AdminWalletSummary> {
  return requestModeratorApi<AdminWalletSummary>('/api/moderator/wallets/summary', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

export async function listAdminWallets(query: ListAdminWalletsQuery): Promise<PaginatedOutput<AdminWallet>> {
  const params = new URLSearchParams({ page: String(query.page ?? 1), pageSize: String(query.pageSize ?? 20) });
  if (query.search) params.set('search', query.search);
  if (query.state) params.set('state', query.state);
  if (query.bankStatus) params.set('bankStatus', query.bankStatus);
  if (query.ownerType) params.set('ownerType', query.ownerType);
  return requestModeratorApi<PaginatedOutput<AdminWallet>>(`/api/moderator/wallets?${params.toString()}`, {
    headers: { Authorization: `Bearer ${query.accessToken}` }
  });
}

export async function getAdminWallet(accessToken: string, walletId: string): Promise<AdminWallet> {
  return requestModeratorApi<AdminWallet>(`/api/moderator/wallets/${walletId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

export async function listWalletTransactions(accessToken: string, walletId: string): Promise<PaginatedOutput<WalletTransaction>> {
  return requestModeratorApi<PaginatedOutput<WalletTransaction>>(`/api/moderator/wallets/${walletId}/transactions?page=1&pageSize=50`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

export async function listAdminPayouts(accessToken: string, walletId?: string, status?: PayoutStatus | ''): Promise<PaginatedOutput<AdminPayout>> {
  const params = new URLSearchParams({ page: '1', pageSize: '50' });
  if (walletId) params.set('walletId', walletId);
  if (status) params.set('status', status);
  return requestModeratorApi<PaginatedOutput<AdminPayout>>(`/api/moderator/wallets/payouts?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

export async function listWalletAuditLogs(accessToken: string, walletId?: string): Promise<PaginatedOutput<WalletAuditLog>> {
  const params = new URLSearchParams({ page: '1', pageSize: '50' });
  if (walletId) params.set('walletId', walletId);
  return requestModeratorApi<PaginatedOutput<WalletAuditLog>>(`/api/moderator/wallets/audit-logs?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

export async function updateWalletFrozen(accessToken: string, walletId: string, isFrozen: boolean, reason: string): Promise<AdminWallet> {
  return requestModeratorApi<AdminWallet>(`/api/moderator/wallets/${walletId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ isFrozen, reason })
  });
}

export async function updateBankAccountStatus(
  accessToken: string,
  walletId: string,
  status: BankAccountStatus,
  reason: string
): Promise<AdminWallet> {
  return requestModeratorApi<AdminWallet>(`/api/moderator/wallets/${walletId}/bank-account/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ status, reason })
  });
}

export async function prepareManualPayout(accessToken: string, payoutId: string): Promise<AdminPayoutTransfer> {
  return requestModeratorApi<AdminPayoutTransfer>(`/api/moderator/wallets/payouts/${payoutId}/prepare`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

export async function completeManualPayout(
  accessToken: string,
  payoutId: string,
  input: { action: 'CONFIRM' | 'REJECT'; providerReference?: string; reason: string }
): Promise<AdminPayout> {
  return requestModeratorApi<AdminPayout>(`/api/moderator/wallets/payouts/${payoutId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input)
  });
}
