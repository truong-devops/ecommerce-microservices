import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const SHOP_DECOR_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT']);

interface ShopDecorRecord {
  sellerId: string;
  shopName: string;
  slogan: string;
  logoUrl: string;
  bannerUrl: string;
  accentColor: string;
  navItems: string[];
  introTitle: string;
  introDescription: string;
  featuredCategories: string[];
  updatedAt: string;
}

interface UpdateShopDecorBody {
  shopName?: unknown;
  slogan?: unknown;
  logoUrl?: unknown;
  bannerUrl?: unknown;
  accentColor?: unknown;
  navItems?: unknown;
  introTitle?: unknown;
  introDescription?: unknown;
  featuredCategories?: unknown;
}

export async function GET(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!SHOP_DECOR_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to manage shop decor');
  }

  try {
    const decor = await requestUpstream<ShopDecorRecord>(`${serviceBaseUrls.product}/shops/me/decor`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return ok(decor);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!SHOP_DECOR_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to manage shop decor');
  }

  let body: UpdateShopDecorBody;
  try {
    body = (await request.json()) as UpdateShopDecorBody;
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  const sanitized = sanitizeUpdateBody(body);
  if (!sanitized) {
    return fail(400, 'BAD_REQUEST', 'Invalid shop decor payload');
  }

  if (Object.keys(sanitized).length === 0) {
    return fail(400, 'BAD_REQUEST', 'No valid field to update');
  }

  try {
    const updated = await requestUpstream<ShopDecorRecord>(`${serviceBaseUrls.product}/shops/me/decor`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sanitized)
    });

    return ok(updated);
  } catch (error) {
    return toErrorResponse(error);
  }
}

function sanitizeUpdateBody(input: UpdateShopDecorBody): Partial<ShopDecorRecord> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const output: Partial<ShopDecorRecord> = {};

  if (typeof input.shopName === 'string') {
    output.shopName = input.shopName.trim().slice(0, 120);
  }
  if (typeof input.slogan === 'string') {
    output.slogan = input.slogan.trim().slice(0, 240);
  }
  if (typeof input.logoUrl === 'string') {
    output.logoUrl = input.logoUrl.trim().slice(0, 500);
  }
  if (typeof input.bannerUrl === 'string') {
    output.bannerUrl = input.bannerUrl.trim().slice(0, 500);
  }
  if (typeof input.accentColor === 'string') {
    output.accentColor = input.accentColor.trim().slice(0, 20);
  }
  if (Array.isArray(input.navItems)) {
    output.navItems = input.navItems
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8);
  }
  if (typeof input.introTitle === 'string') {
    output.introTitle = input.introTitle.trim().slice(0, 180);
  }
  if (typeof input.introDescription === 'string') {
    output.introDescription = input.introDescription.trim().slice(0, 500);
  }
  if (Array.isArray(input.featuredCategories)) {
    output.featuredCategories = input.featuredCategories
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 10);
  }

  return output;
}
