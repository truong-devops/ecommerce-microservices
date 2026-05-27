import { requestBuyerApi } from './client';

export interface VietnamLocationOption {
  code: string;
  name: string;
}

export function getVietnamProvinces(): Promise<VietnamLocationOption[]> {
  return requestBuyerApi<VietnamLocationOption[]>('/api/buyer/locations/provinces');
}

export function getVietnamWards(provinceCode: string): Promise<VietnamLocationOption[]> {
  const query = new URLSearchParams({ provinceCode });
  return requestBuyerApi<VietnamLocationOption[]>(`/api/buyer/locations/wards?${query.toString()}`);
}
