import { requestModeratorApi } from './client';
import type { LoginInput, LoginOutput, LogoutInput, MeOutput } from './types';

export function loginModerator(payload: LoginInput): Promise<LoginOutput> {
  return requestModeratorApi<LoginOutput>('/api/moderator/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function getModeratorMe(accessToken: string): Promise<MeOutput> {
  return requestModeratorApi<MeOutput>('/api/moderator/auth/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });
}

export function logoutModerator(payload: LogoutInput): Promise<{ message: string }> {
  return requestModeratorApi<{ message: string }>('/api/moderator/auth/logout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${payload.accessToken}`
    },
    body: JSON.stringify({
      refreshToken: payload.refreshToken
    })
  });
}
