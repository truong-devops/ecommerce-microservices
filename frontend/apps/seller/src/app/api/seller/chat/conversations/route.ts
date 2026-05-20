import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const CHAT_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT']);

interface SellerChatConversationPayload {
  items?: unknown;
}

interface PublicUserProfile {
  id: string;
  displayName?: string;
}

interface PublicUsersOutput {
  items?: PublicUserProfile[];
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

  if (!CHAT_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to access chat');
  }

  const input = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  const page = sanitizePositiveInt(input.get('page'), 1, 1, 100000);
  const pageSize = sanitizePositiveInt(input.get('pageSize'), 20, 1, 100);
  query.set('page', String(page));
  query.set('pageSize', String(pageSize));

  const upstreamUrl = `${serviceBaseUrls.chat}/chat/conversations?${query.toString()}`;
  try {
    const payload = await requestUpstream<unknown>(upstreamUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const hydrated = await hydrateBuyerNames(payload, accessToken);
    return ok(hydrated, 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!CHAT_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to access chat');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  const upstreamUrl = `${serviceBaseUrls.chat}/chat/conversations`;
  try {
    const payload = await requestUpstream<unknown>(upstreamUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body ?? {})
    });

    return ok(payload, 'backend', 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}

function sanitizePositiveInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const normalized = Math.floor(n);
  if (normalized < min) return min;
  if (normalized > max) return max;
  return normalized;
}

async function hydrateBuyerNames(payload: unknown, accessToken: string): Promise<unknown> {
  const conversations = getConversationItems(payload);
  const buyerIds = conversations
    .map((item) => getStringField(item, 'buyerId'))
    .filter((value): value is string => Boolean(value));
  const uniqueBuyerIds = [...new Set(buyerIds)];
  if (uniqueBuyerIds.length === 0) {
    return payload;
  }

  let nameMap: Record<string, string> = {};
  try {
    const query = new URLSearchParams();
    query.set('ids', uniqueBuyerIds.join(','));
    const profiles = await requestUpstream<PublicUsersOutput>(`${serviceBaseUrls.user}/users/public?${query.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    nameMap = (profiles.items ?? []).reduce<Record<string, string>>((accumulator, profile) => {
      if (profile.id && profile.displayName?.trim()) {
        accumulator[profile.id] = profile.displayName.trim();
      }
      return accumulator;
    }, {});
  } catch {
    return payload;
  }

  if (Object.keys(nameMap).length === 0) {
    return payload;
  }

  const hydrateOne = (item: unknown): unknown => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return item;
    }

    const conversation = item as Record<string, unknown>;
    const buyerId = getStringField(conversation, 'buyerId');
    const buyerName = buyerId ? nameMap[buyerId] : '';
    if (!buyerName) {
      return item;
    }

    const currentContext = conversation.context && typeof conversation.context === 'object' && !Array.isArray(conversation.context)
      ? (conversation.context as Record<string, unknown>)
      : {};

    return {
      ...conversation,
      context: {
        ...currentContext,
        buyerName
      }
    };
  };

  if (Array.isArray(payload)) {
    return payload.map(hydrateOne);
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as SellerChatConversationPayload).items)) {
    return {
      ...(payload as Record<string, unknown>),
      items: ((payload as SellerChatConversationPayload).items as unknown[]).map(hydrateOne)
    };
  }

  return payload;
}

function getConversationItems(payload: unknown): Record<string, unknown>[] {
  const rawItems: unknown[] = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as SellerChatConversationPayload).items)
      ? ((payload as SellerChatConversationPayload).items as unknown[])
      : [];

  return rawItems.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
}

function getStringField(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  return typeof value === 'string' ? value.trim() : '';
}
