import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const SHOP_PROFILE_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT']);

interface UpstreamUserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  address: string | null;
  addressProvince: string | null;
  addressProvinceCode: string | null;
  addressWard: string | null;
  addressWardCode: string | null;
  avatarUrl: string | null;
}

interface ShopProfileOutput {
  userId: string;
  shopName: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  phone: string;
  address: string;
  addressProvince: string;
  addressProvinceCode: string;
  addressWard: string;
  addressWardCode: string;
  avatarUrl: string;
}

interface ShopProfilePatchBody {
  shopName?: unknown;
  contactFirstName?: unknown;
  contactLastName?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
  addressProvince?: unknown;
  addressProvinceCode?: unknown;
  addressWard?: unknown;
  addressWardCode?: unknown;
  avatarUrl?: unknown;
}

interface UserServiceUpdatePayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  addressProvince?: string;
  addressProvinceCode?: string;
  addressWard?: string;
  addressWardCode?: string;
  avatarUrl?: string | null;
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

  if (!SHOP_PROFILE_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to access shop profile');
  }

  try {
    const user = await resolveUserProfile(accessToken);
    return ok(toShopProfileOutput(user));
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

  if (!SHOP_PROFILE_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to update shop profile');
  }

  let rawBody: ShopProfilePatchBody;
  try {
    rawBody = (await request.json()) as ShopProfilePatchBody;
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  const updatePayload = sanitizeUpdatePayload(rawBody);
  if (!updatePayload) {
    return fail(400, 'BAD_REQUEST', 'Invalid profile payload');
  }

  if (Object.keys(updatePayload).length === 0) {
    return fail(400, 'BAD_REQUEST', 'No valid field to update');
  }

  try {
    const existing = await resolveUserProfile(accessToken);
    const existingEmail = toSafeText(existing.email).toLowerCase();
    if (typeof updatePayload.email === 'string' && updatePayload.email.toLowerCase() === existingEmail) {
      delete updatePayload.email;
    }

    if (Object.keys(updatePayload).length === 0) {
      return ok(toShopProfileOutput(existing));
    }

    const updated = await requestUpstream<UpstreamUserProfile>(`${serviceBaseUrls.user}/users/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(updatePayload)
    });

    return ok(toShopProfileOutput(updated));
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function resolveUserProfile(accessToken: string): Promise<UpstreamUserProfile> {
  return requestUpstream<UpstreamUserProfile>(`${serviceBaseUrls.user}/users/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

function toShopProfileOutput(user: UpstreamUserProfile): ShopProfileOutput {
  const contactFirstName = toSafeText(user.firstName);
  const contactLastName = toSafeText(user.lastName);
  const email = toSafeText(user.email);
  const shopName = `${contactLastName} ${contactFirstName}`.trim() || email;

  return {
    userId: user.id,
    shopName,
    contactFirstName,
    contactLastName,
    email,
    phone: toSafeText(user.phone),
    address: toSafeText(user.address),
    addressProvince: toSafeText(user.addressProvince),
    addressProvinceCode: toSafeText(user.addressProvinceCode),
    addressWard: toSafeText(user.addressWard),
    addressWardCode: toSafeText(user.addressWardCode),
    avatarUrl: toSafeText(user.avatarUrl)
  };
}

function sanitizeUpdatePayload(input: ShopProfilePatchBody): UserServiceUpdatePayload | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const payload: UserServiceUpdatePayload = {};

  if (typeof input.contactFirstName === 'string') {
    payload.firstName = input.contactFirstName.trim();
    if (!payload.firstName) {
      return null;
    }
  }

  if (typeof input.contactLastName === 'string') {
    payload.lastName = input.contactLastName.trim();
    if (!payload.lastName) {
      return null;
    }
  }

  if (typeof input.email === 'string') {
    payload.email = input.email.trim().toLowerCase();
    if (!payload.email) {
      return null;
    }
  }

  if (typeof input.phone === 'string') {
    const normalizedPhone = input.phone.trim().replace(/\s+/g, '');
    if (normalizedPhone) {
      payload.phone = normalizedPhone;
    }
  }

  if (typeof input.address === 'string') {
    payload.address = input.address.trim();
  }

  if (typeof input.addressProvince === 'string') {
    payload.addressProvince = input.addressProvince.trim();
  }

  if (typeof input.addressProvinceCode === 'string') {
    payload.addressProvinceCode = input.addressProvinceCode.trim();
  }

  if (typeof input.addressWard === 'string') {
    payload.addressWard = input.addressWard.trim();
  }

  if (typeof input.addressWardCode === 'string') {
    payload.addressWardCode = input.addressWardCode.trim();
  }

  if (typeof input.avatarUrl === 'string') {
    payload.avatarUrl = input.avatarUrl.trim() || null;
  }

  if (typeof input.shopName === 'string' && input.shopName.trim()) {
    const shopNameParts = splitShopName(input.shopName);
    payload.lastName = payload.lastName ?? shopNameParts.lastName;
    payload.firstName = payload.firstName ?? shopNameParts.firstName;
  }

  return payload;
}

function splitShopName(input: string): { firstName: string; lastName: string } {
  const cleaned = input.trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    return { firstName: 'Shop', lastName: 'Seller' };
  }

  const parts = cleaned.split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'Shop' };
  }

  const firstName = parts.pop() ?? 'Shop';
  const lastName = parts.join(' ') || 'Seller';
  return { firstName, lastName };
}

function toSafeText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}
