import { type AccessTokenClaims, decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import type { BuyerGender, BuyerProfileOutput } from '@/lib/api/types';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls, UpstreamHttpError } from '@/lib/server/upstream-client';

interface UpstreamUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  address: string | null;
  gender: BuyerGender | null;
  dateOfBirth: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UpdateProfileBody {
  name?: unknown;
  phone?: unknown;
  address?: unknown;
  gender?: unknown;
  dateOfBirth?: unknown;
  avatarUrl?: unknown;
}

const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FULL_NAME_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 255;
const MAX_AVATAR_URL_LENGTH = 500;
const VALID_GENDERS: BuyerGender[] = ['male', 'female', 'other', 'unspecified'];

type UpdatePayloadBuildResult =
  | {
      ok: true;
      payload: Record<string, string | null>;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

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

    const profile = await resolveOrCreateUpstreamUser(accessToken, claims);

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

    const payloadBuildResult = toUpstreamUpdatePayload(body);
    if (!payloadBuildResult.ok) {
      return fail(400, payloadBuildResult.code, payloadBuildResult.message);
    }

    const targetUser = await resolveOrCreateUpstreamUser(accessToken, claims);

    const updated = await requestUpstream<UpstreamUser>(`${serviceBaseUrls.user}/users/${encodeURIComponent(targetUser.id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payloadBuildResult.payload)
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

function toUpstreamUpdatePayload(body: UpdateProfileBody): UpdatePayloadBuildResult {
  const payload: Record<string, string | null> = {};
  const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
  const hasPhone = Object.prototype.hasOwnProperty.call(body, 'phone');
  const hasAddress = Object.prototype.hasOwnProperty.call(body, 'address');
  const hasGender = Object.prototype.hasOwnProperty.call(body, 'gender');
  const hasDateOfBirth = Object.prototype.hasOwnProperty.call(body, 'dateOfBirth');
  const hasAvatarUrl = Object.prototype.hasOwnProperty.call(body, 'avatarUrl');

  if (!hasName && !hasPhone && !hasAddress && !hasGender && !hasDateOfBirth && !hasAvatarUrl) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      message: 'At least one profile field is required'
    };
  }

  if (hasName) {
    if (typeof body.name !== 'string') {
      return {
        ok: false,
        code: 'INVALID_PROFILE_NAME',
        message: 'Name must be a string'
      };
    }

    const name = body.name.trim();
    if (!name) {
      return {
        ok: false,
        code: 'INVALID_PROFILE_NAME',
        message: 'Name cannot be empty'
      };
    }

    if (name.length > MAX_FULL_NAME_LENGTH) {
      return {
        ok: false,
        code: 'INVALID_PROFILE_NAME',
        message: 'Name must be at most 200 characters'
      };
    }

    const splitName = splitFullName(name);
    payload.firstName = splitName.firstName;
    payload.lastName = splitName.lastName;
  }

  if (hasPhone) {
    if (typeof body.phone !== 'string') {
      return {
        ok: false,
        code: 'INVALID_PROFILE_PHONE',
        message: 'Phone must be a string'
      };
    }

    const phone = body.phone.trim();
    if (!PHONE_PATTERN.test(phone)) {
      return {
        ok: false,
        code: 'INVALID_PROFILE_PHONE',
        message: 'Phone must be in international format'
      };
    }

    payload.phone = phone;
  }

  if (hasAddress) {
    if (typeof body.address !== 'string') {
      return {
        ok: false,
        code: 'INVALID_PROFILE_ADDRESS',
        message: 'Address must be a string'
      };
    }

    const address = body.address.trim();
    if (address.length > MAX_ADDRESS_LENGTH) {
      return {
        ok: false,
        code: 'INVALID_PROFILE_ADDRESS',
        message: 'Address must be at most 255 characters'
      };
    }

    payload.address = address;
  }

  if (hasGender) {
    if (typeof body.gender !== 'string') {
      return {
        ok: false,
        code: 'INVALID_PROFILE_GENDER',
        message: 'Gender must be a string'
      };
    }

    const gender = body.gender.trim().toLowerCase();
    if (!VALID_GENDERS.includes(gender as BuyerGender)) {
      return {
        ok: false,
        code: 'INVALID_PROFILE_GENDER',
        message: 'Gender must be one of male, female, other, unspecified'
      };
    }

    payload.gender = gender;
  }

  if (hasDateOfBirth) {
    if (body.dateOfBirth === null) {
      payload.dateOfBirth = null;
    } else if (typeof body.dateOfBirth === 'string') {
      const dateOfBirth = body.dateOfBirth.trim();
      if (!dateOfBirth) {
        payload.dateOfBirth = null;
      } else if (!isValidDateOnly(dateOfBirth)) {
        return {
          ok: false,
          code: 'INVALID_PROFILE_DATE_OF_BIRTH',
          message: 'dateOfBirth must be in YYYY-MM-DD format'
        };
      } else {
        payload.dateOfBirth = dateOfBirth;
      }
    } else {
      return {
        ok: false,
        code: 'INVALID_PROFILE_DATE_OF_BIRTH',
        message: 'dateOfBirth must be a string or null'
      };
    }
  }

  if (hasAvatarUrl) {
    if (body.avatarUrl === null) {
      payload.avatarUrl = null;
    } else if (typeof body.avatarUrl === 'string') {
      const avatarUrl = body.avatarUrl.trim();
      if (!avatarUrl) {
        payload.avatarUrl = null;
      } else if (avatarUrl.length > MAX_AVATAR_URL_LENGTH) {
        return {
          ok: false,
          code: 'INVALID_PROFILE_AVATAR_URL',
          message: `avatarUrl must be at most ${MAX_AVATAR_URL_LENGTH} characters`
        };
      } else if (!isValidHttpUrl(avatarUrl)) {
        return {
          ok: false,
          code: 'INVALID_PROFILE_AVATAR_URL',
          message: 'avatarUrl must be a valid http(s) URL'
        };
      } else {
        payload.avatarUrl = avatarUrl;
      }
    } else {
      return {
        ok: false,
        code: 'INVALID_PROFILE_AVATAR_URL',
        message: 'avatarUrl must be a string or null'
      };
    }
  }

  if (Object.keys(payload).length === 0) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      message: 'At least one profile field is required'
    };
  }

  return {
    ok: true,
    payload
  };
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
  const gender = normalizeGender(user.gender);

  return {
    id: user.id,
    email: user.email,
    firstName,
    lastName,
    name: fullName || fallbackNameFromEmail(fallbackEmail),
    phone: typeof user.phone === 'string' ? user.phone : '',
    address: typeof user.address === 'string' ? user.address : '',
    gender,
    dateOfBirth: typeof user.dateOfBirth === 'string' ? user.dateOfBirth : null,
    avatarUrl: typeof user.avatarUrl === 'string' ? user.avatarUrl : null,
    createdAt: typeof user.createdAt === 'string' ? user.createdAt : new Date().toISOString(),
    updatedAt: typeof user.updatedAt === 'string' ? user.updatedAt : new Date().toISOString()
  };
}

function normalizeGender(value: string | null): BuyerGender {
  if (typeof value !== 'string') {
    return 'unspecified';
  }

  const normalized = value.trim().toLowerCase();
  return (VALID_GENDERS.find((gender) => gender === normalized) ?? 'unspecified') as BuyerGender;
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString().slice(0, 10) === value;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function fallbackNameFromEmail(email: string): string {
  const fallback = email.split('@')[0] ?? 'Buyer';
  return fallback.trim() || 'Buyer';
}

async function resolveOrCreateUpstreamUser(accessToken: string, claims: AccessTokenClaims): Promise<UpstreamUser> {
  try {
    return await fetchUpstreamUserById(accessToken, claims.sub);
  } catch (error) {
    if (!isUserNotFoundError(error)) {
      throw error;
    }
  }

  const existingByEmail = await findUpstreamUserByEmail(accessToken, claims.email);
  if (existingByEmail) {
    return existingByEmail;
  }

  const { firstName, lastName } = splitFullName(fallbackNameFromEmail(claims.email));

  try {
    return await requestUpstream<UpstreamUser>(`${serviceBaseUrls.user}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        email: claims.email.trim().toLowerCase(),
        firstName,
        lastName
      })
    });
  } catch (error) {
    if (!(error instanceof UpstreamHttpError) || error.code !== 'USER_EMAIL_EXISTS') {
      throw error;
    }
  }

  const fallbackExisting = await findUpstreamUserByEmail(accessToken, claims.email);
  if (fallbackExisting) {
    return fallbackExisting;
  }

  throw new UpstreamHttpError(404, 'USER_NOT_FOUND', 'User not found');
}

async function fetchUpstreamUserById(accessToken: string, userId: string): Promise<UpstreamUser> {
  return requestUpstream<UpstreamUser>(`${serviceBaseUrls.user}/users/${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

async function findUpstreamUserByEmail(accessToken: string, email: string): Promise<UpstreamUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const users = await requestUpstream<UpstreamUser[]>(
    `${serviceBaseUrls.user}/users?page=1&pageSize=50&search=${encodeURIComponent(normalizedEmail)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  const exact = users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail);
  return exact ?? null;
}

function isUserNotFoundError(error: unknown): boolean {
  return error instanceof UpstreamHttpError && error.status === 404;
}
