import { requestSellerApi } from './client';
import type { LoginInput, LoginOutput, LogoutInput, MeOutput } from './types';

export function loginSeller(payload: LoginInput): Promise<LoginOutput> {
  return requestSellerApi<LoginOutput>('/api/seller/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function getSellerMe(accessToken: string): Promise<MeOutput> {
  return requestSellerApi<MeOutput>('/api/seller/auth/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });
}

export function logoutSeller(payload: LogoutInput): Promise<{ message: string }> {
  return requestSellerApi<{ message: string }>('/api/seller/auth/logout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${payload.accessToken}`
    },
    body: JSON.stringify({
      refreshToken: payload.refreshToken
    })
  });
}
