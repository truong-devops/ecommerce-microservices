import { requestSellerApi } from './client';
import type { DateRange, SellerDashboardData } from './types';

interface FetchDashboardInput {
  accessToken: string;
  range?: DateRange;
  sellerId?: string;
}

function toQueryString(input?: Pick<FetchDashboardInput, 'range' | 'sellerId'>): string {
  if (!input?.range && !input?.sellerId) {
    return '';
  }

  const params = new URLSearchParams();

  if (input.range?.from) {
    params.set('from', input.range.from);
  }

  if (input.range?.to) {
    params.set('to', input.range.to);
  }

  if (input.sellerId) {
    params.set('sellerId', input.sellerId);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function fetchSellerDashboard(input: FetchDashboardInput): Promise<SellerDashboardData> {
  const { accessToken, range, sellerId } = input;

  return requestSellerApi<SellerDashboardData>(`/api/seller/dashboard${toQueryString({ range, sellerId })}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}
