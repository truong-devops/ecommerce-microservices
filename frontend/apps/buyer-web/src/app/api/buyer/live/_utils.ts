import { readBearerToken } from '@/lib/server/access-token';

export function optionalAuthorizationHeader(request: Request): Record<string, string> | undefined {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
}

export function normalizePositiveInt(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}
