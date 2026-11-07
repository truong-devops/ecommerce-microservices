import * as Crypto from 'expo-crypto';
import { requestBuyerApi } from './client';

export interface BuyerWalletBalance {
  walletId: string | null;
  ownerId: string;
  ownerType: 'CUSTOMER';
  currency: string;
  availableAmount: number;
  payoutPendingAmount: number;
  totalPaidOut: number;
  isFrozen: boolean;
  updatedAt: string;
}

export interface BuyerWalletTransaction {
  id: string;
  type: string;
  referenceType: string;
  referenceId: string;
  amount: number;
  currency: string;
  description?: string;
  occurredAt: string;
  createdAt: string;
}

export interface BuyerWalletBankAccount {
  id: string;
  bankCode: string;
  accountHolderName: string;
  maskedAccountNumber: string;
  status: 'UNVERIFIED' | 'ALLOWLISTED' | 'DISABLED';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BuyerRefundPayout {
  id: string;
  amount: number;
  currency: string;
  status: 'REQUESTED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  bankCode: string;
  accountHolderName: string;
  maskedAccountNumber: string;
  requestedAt: string;
  processedAt?: string;
}

interface PageEnvelope<T> {
  items: T[];
}

export async function fetchBuyerWallet(accessToken: string): Promise<BuyerWalletBalance> {
  return requestBuyerApi<BuyerWalletBalance>('/wallets/me', { method: 'GET' }, accessToken);
}

export async function fetchBuyerBankAccount(accessToken: string): Promise<BuyerWalletBankAccount | null> {
  try {
    return await requestBuyerApi<BuyerWalletBankAccount>('/wallets/me/bank-account', { method: 'GET' }, accessToken);
  } catch {
    return null;
  }
}

export async function updateBuyerBankAccount(
  accessToken: string,
  input: { bankCode: string; accountNumber: string; accountHolderName: string }
): Promise<BuyerWalletBankAccount> {
  return requestBuyerApi<BuyerWalletBankAccount>(
    '/wallets/me/bank-account',
    {
      method: 'PUT',
      body: JSON.stringify(input)
    },
    accessToken
  );
}

export async function fetchBuyerPayouts(accessToken: string): Promise<BuyerRefundPayout[]> {
  try {
    const res = await requestBuyerApi<PageEnvelope<BuyerRefundPayout> | BuyerRefundPayout[]>(
      '/payouts',
      { method: 'GET' },
      accessToken
    );
    return Array.isArray(res) ? res : res.items ?? [];
  } catch {
    return [];
  }
}

export async function fetchBuyerTransactions(accessToken: string): Promise<BuyerWalletTransaction[]> {
  try {
    const res = await requestBuyerApi<PageEnvelope<BuyerWalletTransaction> | BuyerWalletTransaction[]>(
      '/wallets/me/transactions',
      { method: 'GET' },
      accessToken
    );
    return Array.isArray(res) ? res : res.items ?? [];
  } catch {
    return [];
  }
}

export async function createBuyerPayout(accessToken: string, amount: number): Promise<BuyerRefundPayout> {
  return requestBuyerApi<BuyerRefundPayout>(
    '/payouts',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': `customer-refund-${Crypto.randomUUID()}` },
      body: JSON.stringify({ amount, currency: 'VND' })
    },
    accessToken
  );
}
