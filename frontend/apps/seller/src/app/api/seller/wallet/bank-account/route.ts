import type { SellerBankAccount } from '@/lib/api/types';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';
import { authorizeWalletSeller } from '@/lib/server/wallet-route';

export async function GET(request: Request) {
  const authorization = authorizeWalletSeller(request);
  if (authorization instanceof Response) return authorization;

  try {
    const account = await requestUpstream<SellerBankAccount>(`${serviceBaseUrls.wallet}/wallets/me/bank-account`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${authorization.accessToken}` }
    });
    return ok(account);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  const authorization = authorizeWalletSeller(request);
  if (authorization instanceof Response) return authorization;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'VALIDATION_FAILED', 'Invalid bank account payload');

  const input = body as Record<string, unknown>;
  const bankCode = typeof input.bankCode === 'string' ? input.bankCode.trim().toUpperCase() : '';
  const accountNumber = typeof input.accountNumber === 'string' ? input.accountNumber.trim() : '';
  const accountHolderName = typeof input.accountHolderName === 'string' ? input.accountHolderName.trim().toUpperCase() : '';
  if (!/^[A-Z0-9_-]{2,32}$/.test(bankCode) || !/^\d{6,20}$/.test(accountNumber) || accountHolderName.length < 2 || accountHolderName.length > 255) {
    return fail(400, 'VALIDATION_FAILED', 'Thông tin tài khoản ngân hàng chưa hợp lệ');
  }

  try {
    const account = await requestUpstream<SellerBankAccount>(`${serviceBaseUrls.wallet}/wallets/me/bank-account`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorization.accessToken}` },
      body: JSON.stringify({ bankCode, accountNumber, accountHolderName })
    });
    return ok(account);
  } catch (error) {
    return toErrorResponse(error);
  }
}
