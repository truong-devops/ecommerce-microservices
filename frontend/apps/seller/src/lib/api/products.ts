import { SellerApiClientError, requestSellerApi } from './client';
import type {
  CreateSellerProductInput,
  SellerCategoryListOutput,
  SellerProductListOutput,
  SellerProduct,
  SellerProductStatus,
  UpdateSellerProductInput,
  UploadSellerProductImageInput,
  UploadSellerProductImageOutput
} from './types';

export function createSellerProduct(accessToken: string, payload: CreateSellerProductInput): Promise<SellerProduct> {
  return requestSellerApi<SellerProduct>('/api/seller/products', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

interface ListSellerProductsInput {
  accessToken: string;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: SellerProductStatus;
}

export function listSellerProducts(input: ListSellerProductsInput): Promise<SellerProductListOutput> {
  const params = new URLSearchParams();
  params.set('page', String(input.page ?? 1));
  params.set('pageSize', String(input.pageSize ?? 20));

  if (input.search?.trim()) {
    params.set('search', input.search.trim());
  }

  if (input.status) {
    params.set('status', input.status);
  }

  return requestSellerApi<SellerProductListOutput>(`/api/seller/products?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.accessToken}`
    },
    cache: 'no-store'
  });
}

export function getSellerProductById(accessToken: string, productId: string): Promise<SellerProduct> {
  return requestSellerApi<SellerProduct>(`/api/seller/products/${productId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });
}

export function updateSellerProduct(accessToken: string, productId: string, payload: UpdateSellerProductInput): Promise<SellerProduct> {
  return requestSellerApi<SellerProduct>(`/api/seller/products/${productId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

export function softDeleteSellerProduct(accessToken: string, productId: string): Promise<SellerProduct> {
  return requestSellerApi<SellerProduct>(`/api/seller/products/${productId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function listSellerCategories(accessToken: string): Promise<SellerCategoryListOutput> {
  return requestSellerApi<SellerCategoryListOutput>('/api/seller/products/categories', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });
}

export async function uploadSellerProductImage(
  accessToken: string,
  input: UploadSellerProductImageInput
): Promise<UploadSellerProductImageOutput> {
  const formData = new FormData();
  formData.set('file', input.file);

  if (input.folder?.trim()) {
    formData.set('folder', input.folder.trim());
  }

  const response = await fetch('/api/seller/products/upload-image', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: formData
  });

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new SellerApiClientError('INVALID_RESPONSE', 'Invalid API response');
  }

  if (!response.ok || !isSuccessPayload<UploadSellerProductImageOutput>(payload)) {
    if (isFailurePayload(payload)) {
      throw new SellerApiClientError(payload.error.code, payload.error.message);
    }

    throw new SellerApiClientError('REQUEST_FAILED', 'Request failed');
  }

  return payload.data;
}

function isSuccessPayload<T>(input: unknown): input is { success: true; data: T } {
  return Boolean(
    input &&
      typeof input === 'object' &&
      'success' in input &&
      (input as { success?: boolean }).success === true &&
      'data' in input
  );
}

function isFailurePayload(input: unknown): input is { success: false; error: { code: string; message: string } } {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const payload = input as {
    success?: boolean;
    error?: {
      code?: unknown;
      message?: unknown;
    };
  };

  return payload.success === false && typeof payload.error?.code === 'string' && typeof payload.error?.message === 'string';
}
