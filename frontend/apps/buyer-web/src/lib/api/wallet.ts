import { requestBuyerApi } from './client';
import type { BuyerRefundPayout, BuyerWalletBalance, BuyerWalletBankAccount, BuyerWalletPage, BuyerWalletTransaction } from './types';

function auth(accessToken: string, init?: RequestInit): RequestInit {
  return { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) } };
}

export const getBuyerWallet = (accessToken: string) => requestBuyerApi<BuyerWalletBalance>('/api/buyer/wallet', auth(accessToken));

export const listBuyerWalletTransactions = (accessToken: string) =>
  requestBuyerApi<BuyerWalletPage<BuyerWalletTransaction>>('/api/buyer/wallet/transactions', auth(accessToken));

export const getBuyerWalletBankAccount = (accessToken: string) =>
  requestBuyerApi<BuyerWalletBankAccount>('/api/buyer/wallet/bank-account', auth(accessToken));

export const updateBuyerWalletBankAccount = (accessToken: string, input: { bankCode: string; accountNumber: string; accountHolderName: string }) =>
  requestBuyerApi<BuyerWalletBankAccount>('/api/buyer/wallet/bank-account', auth(accessToken, { method: 'PUT', body: JSON.stringify(input) }));

export const listBuyerRefundPayouts = (accessToken: string) =>
  requestBuyerApi<BuyerWalletPage<BuyerRefundPayout>>('/api/buyer/wallet/payouts', auth(accessToken));

export const createBuyerRefundPayout = (accessToken: string, amount: number) =>
  requestBuyerApi<BuyerRefundPayout>(
    '/api/buyer/wallet/payouts',
    auth(accessToken, {
      method: 'POST',
      headers: { 'Idempotency-Key': `customer-refund-${crypto.randomUUID()}` },
      body: JSON.stringify({ amount, currency: 'VND' })
    })
  );
