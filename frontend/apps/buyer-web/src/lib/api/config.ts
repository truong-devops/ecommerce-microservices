import { requestBuyerApi } from './client';

export interface BuyerRuntimeConfig {
  onlinePaymentEnabled: boolean;
}

export function fetchBuyerRuntimeConfig(): Promise<BuyerRuntimeConfig> {
  return requestBuyerApi<BuyerRuntimeConfig>('/api/buyer/config', {
    method: 'GET',
    cache: 'no-store'
  });
}
