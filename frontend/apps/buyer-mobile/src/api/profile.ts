import type { BuyerProfile, UpdateBuyerProfileInput } from '@frontend/buyer-contracts';

import { normalizeProfile, validateProfileInput } from '@/domain/profile';

import { requestBuyerApi } from './client';

export async function fetchProfile(accessToken: string): Promise<BuyerProfile> {
  const profile = await requestBuyerApi<Parameters<typeof normalizeProfile>[0]>('/users/me', { method: 'GET' }, accessToken);
  return normalizeProfile(profile);
}

export async function updateProfile(accessToken: string, input: UpdateBuyerProfileInput): Promise<BuyerProfile> {
  const profile = await requestBuyerApi<Parameters<typeof normalizeProfile>[0]>(
    '/users/me',
    { method: 'PATCH', body: JSON.stringify(validateProfileInput(input)) },
    accessToken
  );
  return normalizeProfile(profile);
}
