import { requestBuyerApi } from './client';
import type { ListProductsInput, ProductDetail, ProductSearchOutput } from './types';

export function fetchProductDetail(productId: string): Promise<ProductDetail> {
  return requestBuyerApi<ProductDetail>(`/api/buyer/products/${encodeURIComponent(productId)}`, {
    method: 'GET',
    cache: 'no-store'
  });
}

function buildProductQuery(params?: ListProductsInput): string {
  if (!params) {
    return '';
  }

  const query = new URLSearchParams();

  if (typeof params.page === 'number') {
    query.set('page', String(params.page));
  }

  if (typeof params.pageSize === 'number') {
    query.set('pageSize', String(params.pageSize));
  }

  if (params.search && params.search.trim().length > 0) {
    query.set('search', params.search.trim());
  }

  if (params.categoryId && params.categoryId.trim().length > 0) {
    query.set('categoryId', params.categoryId.trim());
  }

  if (params.brand && params.brand.trim().length > 0) {
    query.set('brand', params.brand.trim());
  }

  if (params.sortBy) {
    query.set('sortBy', params.sortBy);
  }

  if (params.sortOrder) {
    query.set('sortOrder', params.sortOrder);
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export function fetchBuyerProducts(params?: ListProductsInput): Promise<ProductSearchOutput> {
  return requestBuyerApi<ProductSearchOutput>(`/api/buyer/products${buildProductQuery(params)}`, {
    method: 'GET',
    cache: 'no-store'
  });
}
