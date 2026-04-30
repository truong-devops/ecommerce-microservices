import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls, UpstreamHttpError } from '@/lib/server/upstream-client';

const SHOP_PROFILE_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT']);

interface UpstreamUserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  address: string | null;
  avatarUrl: string | null;
  status?: string;
}

interface AccessTokenClaims {
  sub: string;
  email: string;
  role: string;
}

type UpstreamUsersListResponse = UpstreamUserProfile[] | { items?: UpstreamUserProfile[] };

interface ShopProfileOutput {
  userId: string;
  shopName: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  phone: string;
  address: string;
  avatarUrl: string;
}

interface ShopProfilePatchBody {
  shopName?: unknown;
  contactFirstName?: unknown;
  contactLastName?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
  avatarUrl?: unknown;
}

interface UserServiceUpdatePayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
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
    const user = await resolveUserProfile(accessToken, claims);

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
    const existing = await resolveUserProfile(accessToken, claims);
    const existingEmail = toSafeText(existing.email).toLowerCase();
    if (typeof updatePayload.email === 'string' && updatePayload.email.toLowerCase() === existingEmail) {
      delete updatePayload.email;
    }

    if (Object.keys(updatePayload).length === 0) {
      return ok(toShopProfileOutput(existing));
    }

    const updated = await requestUpstream<UpstreamUserProfile>(`${serviceBaseUrls.user}/users/${encodeURIComponent(existing.id)}`, {
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

async function resolveUserProfile(accessToken: string, claims: AccessTokenClaims): Promise<UpstreamUserProfile> {
  const byId = await findUserById(accessToken, claims.sub);
  if (byId) {
    return byId;
  }

  const byEmail = await findUserByEmail(accessToken, claims.email);
  if (byEmail) {
    if (isDeletedStatus(byEmail.status)) {
      const revived = await reviveDeletedUser(accessToken, byEmail.id);
      return revived ?? byEmail;
    }

    return byEmail;
  }

  return createUserProfile(accessToken, claims);
}

async function findUserById(accessToken: string, userId: string): Promise<UpstreamUserProfile | null> {
  try {
    return await requestUpstream<UpstreamUserProfile>(`${serviceBaseUrls.user}/users/${encodeURIComponent(userId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  } catch (error) {
    if (error instanceof UpstreamHttpError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

async function findUserByEmail(accessToken: string, email: string): Promise<UpstreamUserProfile | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const fromExactSearch = await findUserByEmailUsingSearch(accessToken, normalized);
  if (fromExactSearch) {
    return fromExactSearch;
  }

  const fromDefaultScan = await findUserByEmailByScan(accessToken, normalized);
  if (fromDefaultScan) {
    return fromDefaultScan;
  }

  const fromDeletedSearch = await findUserByEmailUsingSearch(accessToken, normalized, 'deleted');
  if (fromDeletedSearch) {
    return fromDeletedSearch;
  }

  return findUserByEmailByScan(accessToken, normalized, 'deleted');
}

async function createUserProfile(accessToken: string, claims: AccessTokenClaims): Promise<UpstreamUserProfile> {
  const fallbackName = parseNameFromEmail(claims.email);
  const role = mapToUserServiceRole(claims.role);
  const normalizedEmail = claims.email.trim().toLowerCase();

  try {
    return await requestUpstream<UpstreamUserProfile>(`${serviceBaseUrls.user}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        email: normalizedEmail,
        firstName: fallbackName.firstName,
        lastName: fallbackName.lastName,
        role,
        status: 'active',
        emailVerified: true
      })
    });
  } catch (error) {
    if (error instanceof UpstreamHttpError && error.status === 409) {
      const existing = await findUserByEmail(accessToken, normalizedEmail);
      if (existing) {
        if (isDeletedStatus(existing.status)) {
          const revived = await reviveDeletedUser(accessToken, existing.id);
          if (revived) {
            return revived;
          }
        }

        return existing;
      }
    }

    throw error;
  }
}

function parseNameFromEmail(email: string): { firstName: string; lastName: string } {
  const local = email.split('@')[0]?.trim() ?? '';
  const cleaned = local.replace(/[._-]+/g, ' ').trim();

  if (!cleaned) {
    return { firstName: 'Seller', lastName: 'Shop' };
  }

  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: capitalize(parts[0]), lastName: 'Seller' };
  }

  const firstName = capitalize(parts.pop() ?? 'Seller');
  const lastName = capitalize(parts.join(' '));
  return { firstName, lastName: lastName || 'Seller' };
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function mapToUserServiceRole(role: string): 'seller' | 'admin' | 'buyer' {
  const normalized = role.trim().toUpperCase();
  if (normalized === 'ADMIN' || normalized === 'SUPER_ADMIN') {
    return 'admin';
  }
  if (normalized === 'SELLER' || normalized === 'SUPPORT') {
    return 'seller';
  }
  return 'buyer';
}

function toSafeText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

async function findUserByEmailUsingSearch(
  accessToken: string,
  normalizedEmail: string,
  status?: 'deleted'
): Promise<UpstreamUserProfile | null> {
  const candidates = [normalizedEmail];
  const localPart = normalizedEmail.split('@')[0]?.trim();
  if (localPart && localPart !== normalizedEmail) {
    candidates.push(localPart);
  }

  for (const keyword of candidates) {
    const query = new URLSearchParams({
      page: '1',
      pageSize: '100',
      search: keyword
    });
    if (status) {
      query.set('status', status);
    }

    const users = await requestUpstream<UpstreamUsersListResponse>(`${serviceBaseUrls.user}/users?${query.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const items = extractUserItems(users);
    const found = items.find((item) => toSafeText(item.email).toLowerCase() === normalizedEmail);
    if (found) {
      return found;
    }
  }

  return null;
}

async function findUserByEmailByScan(
  accessToken: string,
  normalizedEmail: string,
  status?: 'deleted'
): Promise<UpstreamUserProfile | null> {
  const maxPages = 10;
  const pageSize = 100;

  for (let page = 1; page <= maxPages; page += 1) {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy: 'createdAt',
      sortOrder: 'DESC'
    });
    if (status) {
      query.set('status', status);
    }

    const users = await requestUpstream<UpstreamUsersListResponse>(`${serviceBaseUrls.user}/users?${query.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const items = extractUserItems(users);
    const found = items.find((item) => toSafeText(item.email).toLowerCase() === normalizedEmail);
    if (found) {
      return found;
    }

    if (items.length < pageSize) {
      break;
    }
  }

  return null;
}

async function reviveDeletedUser(accessToken: string, userId: string): Promise<UpstreamUserProfile | null> {
  try {
    const updated = await requestUpstream<UpstreamUserProfile>(`${serviceBaseUrls.user}/users/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ status: 'active' })
    });

    return updated;
  } catch (error) {
    if (error instanceof UpstreamHttpError && (error.status === 404 || error.status === 400)) {
      return null;
    }

    throw error;
  }
}

function isDeletedStatus(status: unknown): boolean {
  return typeof status === 'string' && status.trim().toLowerCase() === 'deleted';
}

function extractUserItems(input: UpstreamUsersListResponse): UpstreamUserProfile[] {
  if (Array.isArray(input)) {
    return input;
  }

  if (input && typeof input === 'object' && Array.isArray(input.items)) {
    return input.items;
  }

  return [];
}
