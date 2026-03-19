import { requestBuyerApi } from './client';
import type { HomeSectionsData } from './types';

export function fetchHomeSections(): Promise<HomeSectionsData> {
  return requestBuyerApi<HomeSectionsData>('/api/buyer/home', {
    method: 'GET',
    cache: 'no-store'
  });
}
