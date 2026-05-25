import type { AuthSession, BuyerUser, RotatedAuthTokens } from '@frontend/buyer-contracts';

import { requestBuyerApi } from './client';

export function loginBuyer(email: string, password: string): Promise<AuthSession> {
  return requestBuyerApi<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export function registerBuyer(email: string, password: string): Promise<{ email: string; emailVerificationRequired: boolean }> {
  return requestBuyerApi<{ email: string; emailVerificationRequired: boolean }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, role: 'CUSTOMER' })
  });
}

export function exchangeMobileOauthTicket(loginTicket: string, codeVerifier: string): Promise<AuthSession> {
  return requestBuyerApi<AuthSession>('/auth/oauth/exchange-ticket', {
    method: 'POST',
    body: JSON.stringify({ app: 'buyer-mobile', loginTicket, codeVerifier })
  });
}

export function fetchBuyerMe(accessToken: string): Promise<{ user: BuyerUser }> {
  return requestBuyerApi<{ user: BuyerUser }>('/auth/me', { method: 'GET' }, accessToken);
}

export function refreshBuyerSession(refreshToken: string): Promise<RotatedAuthTokens> {
  return requestBuyerApi<RotatedAuthTokens>('/auth/refresh-token', {
    method: 'POST',
    body: JSON.stringify({ refreshToken })
  });
}

export function logoutBuyerSession(session: AuthSession): Promise<{ message: string }> {
  return requestBuyerApi<{ message: string }>(
    '/auth/logout',
    { method: 'POST', body: JSON.stringify({ refreshToken: session.refreshToken }) },
    session.accessToken
  );
}
