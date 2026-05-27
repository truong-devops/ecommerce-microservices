export interface VietnamLocationOption {
  code: string;
  name: string;
}

interface LocationRecord {
  code?: unknown;
  name?: unknown;
}

interface ProvinceDetailRecord {
  wards?: unknown;
}

const LOCATIONS_API_BASE_URL = 'https://provinces.open-api.vn/api/v2';

export async function fetchVietnamProvinces(): Promise<VietnamLocationOption[]> {
  const response = await fetch(`${LOCATIONS_API_BASE_URL}/`);
  if (!response.ok) {
    throw new Error('Không tải được danh sách tỉnh/thành phố');
  }
  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error('Dữ liệu tỉnh/thành phố không hợp lệ');
  }
  return data.map(toLocationOption).filter((item): item is VietnamLocationOption => item !== null);
}

export async function fetchVietnamWards(provinceCode: string): Promise<VietnamLocationOption[]> {
  const normalizedProvinceCode = provinceCode.trim();
  if (!/^\d{1,3}$/.test(normalizedProvinceCode)) {
    throw new Error('Vui lòng chọn tỉnh/thành phố');
  }
  const response = await fetch(`${LOCATIONS_API_BASE_URL}/p/${normalizedProvinceCode}?depth=2`);
  if (!response.ok) {
    throw new Error('Không tải được danh sách phường/xã');
  }
  const data = (await response.json()) as ProvinceDetailRecord;
  if (!Array.isArray(data.wards)) {
    throw new Error('Dữ liệu phường/xã không hợp lệ');
  }
  return data.wards.map(toLocationOption).filter((item): item is VietnamLocationOption => item !== null);
}

function toLocationOption(record: LocationRecord): VietnamLocationOption | null {
  if (typeof record.code !== 'number' || typeof record.name !== 'string' || record.name.trim() === '') {
    return null;
  }
  return {
    code: String(record.code),
    name: record.name.trim()
  };
}
