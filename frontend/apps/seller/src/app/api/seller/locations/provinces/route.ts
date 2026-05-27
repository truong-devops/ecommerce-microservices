import { fail, ok } from '@/lib/server/seller-api-response';

interface ProvinceRecord {
  code?: unknown;
  name?: unknown;
}

const LOCATIONS_API_BASE_URL = 'https://provinces.open-api.vn/api/v2';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await fetch(`${LOCATIONS_API_BASE_URL}/`, {
      next: { revalidate: 86_400 }
    });
    if (!response.ok) {
      return fail(502, 'LOCATION_PROVIDER_ERROR', 'Cannot load provinces');
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      return fail(502, 'LOCATION_PROVIDER_ERROR', 'Invalid provinces response');
    }

    return ok(
      data.map(toLocationOption).filter((item): item is { code: string; name: string } => item !== null),
      'backend'
    );
  } catch {
    return fail(502, 'LOCATION_PROVIDER_UNAVAILABLE', 'Cannot connect to province provider');
  }
}

function toLocationOption(record: ProvinceRecord): { code: string; name: string } | null {
  if (typeof record.code !== 'number' || typeof record.name !== 'string' || record.name.trim() === '') {
    return null;
  }

  return {
    code: String(record.code),
    name: record.name.trim()
  };
}
