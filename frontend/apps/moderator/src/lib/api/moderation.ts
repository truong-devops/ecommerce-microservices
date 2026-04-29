import { requestModeratorApi } from './client';
import type { ModerationListOutput, ModerationProduct, ModerationProductStatus } from './types';

interface ListModerationProductsInput {
  accessToken: string;
  page?: number;
  pageSize?: number;
  status?: ModerationProductStatus;
  search?: string;
}

function toQueryString(input: Omit<ListModerationProductsInput, 'accessToken'>): string {
  const params = new URLSearchParams();

  if (input.page) {
    params.set('page', String(input.page));
  }

  if (input.pageSize) {
    params.set('pageSize', String(input.pageSize));
  }

  if (input.status) {
    params.set('status', input.status);
  }

  if (input.search) {
    params.set('search', input.search);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function listModerationProducts(input: ListModerationProductsInput): Promise<ModerationListOutput> {
  const { accessToken, ...query } = input;

  return requestModeratorApi<ModerationListOutput>(`/api/moderator/moderation/products${toQueryString(query)}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function updateModerationProductStatus(
  accessToken: string,
  productId: string,
  payload: { status: ModerationProductStatus; reason?: string }
): Promise<ModerationProduct> {
  return requestModeratorApi<ModerationProduct>(`/api/moderator/moderation/products/${productId}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}
