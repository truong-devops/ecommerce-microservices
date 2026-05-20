import { requestModeratorApi } from './client';
import type { ChatViolationListOutput, ModerationListOutput, ModerationProduct, ModerationProductStatus, ModerationVideo, ModerationVideoListOutput } from './types';

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

export function listModerationVideos(input: { accessToken: string; page?: number; pageSize?: number; status?: string }): Promise<ModerationVideoListOutput> {
  const params = new URLSearchParams();
  params.set('page', String(input.page ?? 1));
  params.set('pageSize', String(input.pageSize ?? 20));
  if (input.status) {
    params.set('status', input.status);
  }

  return requestModeratorApi<ModerationVideoListOutput>(`/api/moderator/moderation/videos?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${input.accessToken}`
    }
  });
}

export function listChatViolations(input: {
  accessToken: string;
  page?: number;
  pageSize?: number;
  senderId?: string;
  ruleId?: string;
  conversationId?: string;
  createdFrom?: string;
  createdTo?: string;
}): Promise<ChatViolationListOutput> {
  const params = new URLSearchParams();
  params.set('page', String(input.page ?? 1));
  params.set('pageSize', String(input.pageSize ?? 50));
  if (input.senderId) {
    params.set('senderId', input.senderId);
  }
  if (input.ruleId) {
    params.set('ruleId', input.ruleId);
  }
  if (input.conversationId) {
    params.set('conversationId', input.conversationId);
  }
  if (input.createdFrom) {
    params.set('createdFrom', input.createdFrom);
  }
  if (input.createdTo) {
    params.set('createdTo', input.createdTo);
  }

  return requestModeratorApi<ChatViolationListOutput>(`/api/moderator/chat/violations?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${input.accessToken}`
    }
  });
}

export function approveModerationVideo(accessToken: string, videoId: string): Promise<ModerationVideo> {
  return requestModeratorApi<ModerationVideo>(`/api/moderator/moderation/videos/${videoId}/approve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function rejectModerationVideo(accessToken: string, videoId: string, reason: string): Promise<ModerationVideo> {
  return requestModeratorApi<ModerationVideo>(`/api/moderator/moderation/videos/${videoId}/reject`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ reason })
  });
}
