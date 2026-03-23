import { type AccessTokenClaims, decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import type { BuyerProfileOutput } from '@/lib/api/types';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

interface UpstreamUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UpdateProfileBody {
  name?: unknown;
  phone?: unknown;
  address?: unknown;
}

export async function GET(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  try {
    const claims = await verifyAccessTokenAndReadClaims(accessToken);
    if (!claims) {
      return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
    }

    const profile = await requestUpstream<UpstreamUser>(`${serviceBaseUrls.user}/users/${encodeURIComponent(claims.sub)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return ok(toBuyerProfile(profile, claims.email), 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  let body: UpdateProfileBody;
  try {
    body = (await request.json()) as UpdateProfileBody;
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  try {
    const claims = await verifyAccessTokenAndReadClaims(accessToken);
    if (!claims) {
      return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
    }

    const payload = toUpstreamUpdatePayload(body);
    if (!payload) {
      return fail(400, 'BAD_REQUEST', 'At least one profile field is required');
    }

    const updated = await requestUpstream<UpstreamUser>(`${serviceBaseUrls.user}/users/${encodeURIComponent(claims.sub)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });

    return ok(toBuyerProfile(updated, claims.email), 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function verifyAccessTokenAndReadClaims(accessToken: string): Promise<AccessTokenClaims | null> {
  await requestUpstream<Record<string, unknown>>(`${serviceBaseUrls.auth}/auth/sessions`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  return decodeAccessToken(accessToken);
}

function toUpstreamUpdatePayload(body: UpdateProfileBody): Record<string, string> | null {
  const payload: Record<string, string> = {};

  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name) {
      return null;
    }

    const splitName = splitFullName(name);
    payload.firstName = splitName.firstName;
    payload.lastName = splitName.lastName;
  }

  if (typeof body.phone === 'string') {
    const phone = body.phone.trim();
    if (!phone) {
      return null;
    }

    payload.phone = phone;
  }

  if (typeof body.address === 'string') {
    payload.address = body.address.trim();
  }

  return Object.keys(payload).length > 0 ? payload : null;
}

function splitFullName(name: string): { firstName: string; lastName: string } {
  const parts = name
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (parts.length === 0) {
    return {
      firstName: 'Buyer',
      lastName: 'Buyer'
    };
  }

  if (parts.length === 1) {
    const single = parts[0].slice(0, 100);
    return {
      firstName: single,
      lastName: single
    };
  }

  const firstName = parts
    .slice(0, -1)
    .join(' ')
    .slice(0, 100);
  const lastName = parts[parts.length - 1].slice(0, 100);

  return {
    firstName: firstName || lastName,
    lastName
  };
}

function toBuyerProfile(user: UpstreamUser, fallbackEmail: string): BuyerProfileOutput {
  const firstName = typeof user.firstName === 'string' ? user.firstName.trim() : '';
  const lastName = typeof user.lastName === 'string' ? user.lastName.trim() : '';
  const fullName = `${firstName} ${lastName}`.trim();

  return {
    id: user.id,
    email: user.email,
    firstName,
    lastName,
    name: fullName || fallbackNameFromEmail(fallbackEmail),
    phone: typeof user.phone === 'string' ? user.phone : '',
    address: typeof user.address === 'string' ? user.address : '',
    createdAt: typeof user.createdAt === 'string' ? user.createdAt : new Date().toISOString(),
    updatedAt: typeof user.updatedAt === 'string' ? user.updatedAt : new Date().toISOString()
  };
}

function fallbackNameFromEmail(email: string): string {
  const fallback = email.split('@')[0] ?? 'Buyer';
  return fallback.trim() || 'Buyer';
}
