import { requestSellerApi } from './client';

export interface VietnamLocationOption {
  code: string;
  name: string;
}

export function getVietnamProvinces(): Promise<VietnamLocationOption[]> {
  return requestSellerApi<VietnamLocationOption[]>('/api/seller/locations/provinces');
}

export function getVietnamWards(provinceCode: string): Promise<VietnamLocationOption[]> {
  const query = new URLSearchParams({ provinceCode });
  return requestSellerApi<VietnamLocationOption[]>(`/api/seller/locations/wards?${query.toString()}`);
}
