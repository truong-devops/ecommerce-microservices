import { requestSellerApi } from './client';
import type {
  ConfirmSellerVideoMediaInput,
  CreateSellerVideoInput,
  PresignSellerVideoUploadInput,
  PresignSellerVideoUploadOutput,
  SellerVideo,
  SellerVideoListOutput,
  SellerVideoStatus
} from './types';

interface ListSellerVideosInput {
  accessToken: string;
  page?: number;
  pageSize?: number;
  status?: SellerVideoStatus;
  search?: string;
}

export function listSellerVideos(input: ListSellerVideosInput): Promise<SellerVideoListOutput> {
  const params = new URLSearchParams();
  params.set('page', String(input.page ?? 1));
  params.set('pageSize', String(input.pageSize ?? 20));

  if (input.status) {
    params.set('status', input.status);
  }

  if (input.search?.trim()) {
    params.set('search', input.search.trim());
  }

  return requestSellerApi<SellerVideoListOutput>(`/api/seller/videos?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.accessToken}`
    },
    cache: 'no-store'
  });
}

export function createSellerVideo(accessToken: string, payload: CreateSellerVideoInput): Promise<SellerVideo> {
  return requestSellerApi<SellerVideo>('/api/seller/videos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

export function presignSellerVideoUpload(
  accessToken: string,
  payload: PresignSellerVideoUploadInput
): Promise<PresignSellerVideoUploadOutput> {
  return requestSellerApi<PresignSellerVideoUploadOutput>('/api/seller/videos/uploads/presign', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

export function confirmSellerVideoMedia(
  accessToken: string,
  videoId: string,
  payload: ConfirmSellerVideoMediaInput
): Promise<SellerVideo> {
  return requestSellerApi<SellerVideo>(`/api/seller/videos/${videoId}/media/confirm`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

export function publishSellerVideo(accessToken: string, videoId: string): Promise<SellerVideo> {
  return requestSellerApi<SellerVideo>(`/api/seller/videos/${videoId}/publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function submitSellerVideoReview(accessToken: string, videoId: string): Promise<SellerVideo> {
  return requestSellerApi<SellerVideo>(`/api/seller/videos/${videoId}/submit-review`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function unpublishSellerVideo(accessToken: string, videoId: string): Promise<SellerVideo> {
  return requestSellerApi<SellerVideo>(`/api/seller/videos/${videoId}/unpublish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}
