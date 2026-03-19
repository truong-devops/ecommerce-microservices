import { requestBuyerApi } from './client';
import type { LoginInput, LoginOutput, LogoutInput, MeOutput, RegisterInput, RegisterOutput } from './types';

export function registerBuyer(payload: RegisterInput): Promise<RegisterOutput> {
  return requestBuyerApi<RegisterOutput>('/api/buyer/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function loginBuyer(payload: LoginInput): Promise<LoginOutput> {
  return requestBuyerApi<LoginOutput>('/api/buyer/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function logoutBuyer(payload: LogoutInput): Promise<{ message: string }> {
  return requestBuyerApi<{ message: string }>('/api/buyer/auth/logout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${payload.accessToken}`
    },
    body: JSON.stringify({ refreshToken: payload.refreshToken })
  });
}

export function getBuyerMe(accessToken: string): Promise<MeOutput> {
  return requestBuyerApi<MeOutput>('/api/buyer/auth/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });
}
