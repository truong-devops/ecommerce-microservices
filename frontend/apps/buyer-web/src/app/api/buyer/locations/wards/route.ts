import { fail, ok } from '@/lib/server/buyer-api-response';

interface WardRecord {
  code?: unknown;
  name?: unknown;
}

interface ProvinceDetailRecord {
  wards?: unknown;
}

const LOCATIONS_API_BASE_URL = 'https://provinces.open-api.vn/api/v2';
const PROVINCE_CODE_PATTERN = /^\d{1,3}$/;

export async function GET(request: Request) {
  const provinceCode = new URL(request.url).searchParams.get('provinceCode')?.trim() ?? '';
  if (!PROVINCE_CODE_PATTERN.test(provinceCode)) {
    return fail(400, 'INVALID_PROVINCE_CODE', 'provinceCode is required');
  }

  try {
    const response = await fetch(`${LOCATIONS_API_BASE_URL}/p/${provinceCode}?depth=2`, {
      next: { revalidate: 86_400 }
    });
    if (!response.ok) {
      return fail(502, 'LOCATION_PROVIDER_ERROR', 'Cannot load wards');
    }

    const data = (await response.json()) as ProvinceDetailRecord;
    if (!Array.isArray(data.wards)) {
      return fail(502, 'LOCATION_PROVIDER_ERROR', 'Invalid wards response');
    }

    return ok(
      data.wards.map(toLocationOption).filter((item): item is { code: string; name: string } => item !== null),
      'backend'
    );
  } catch {
    return fail(502, 'LOCATION_PROVIDER_UNAVAILABLE', 'Cannot connect to province provider');
  }
}

function toLocationOption(record: WardRecord): { code: string; name: string } | null {
  if (typeof record.code !== 'number' || typeof record.name !== 'string' || record.name.trim() === '') {
    return null;
  }

  return {
    code: String(record.code),
    name: record.name.trim()
  };
}
