import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const INVENTORY_EDIT_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN']);

export async function GET(request: Request, context: { params: Promise<{ sku: string }> }) {
  const auth = authorize(request);
  if (auth.response) {
    return auth.response;
  }

  const sku = (await context.params).sku?.trim();
  if (!sku) {
    return fail(400, 'BAD_REQUEST', 'Missing SKU');
  }

  try {
    const stock = await requestUpstream<unknown>(`${serviceBaseUrls.inventory}/inventory/stocks/${encodeURIComponent(sku)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`
      }
    });

    return ok(stock);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ sku: string }> }) {
  const auth = authorize(request);
  if (auth.response) {
    return auth.response;
  }

  const sku = (await context.params).sku?.trim();
  if (!sku) {
    return fail(400, 'BAD_REQUEST', 'Missing SKU');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(400, 'BAD_REQUEST', 'Invalid stock payload');
  }

  try {
    const stock = await requestUpstream<unknown>(
      `${serviceBaseUrls.inventory}/inventory/stocks/${encodeURIComponent(sku)}/adjust`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.accessToken}`
        },
        body: JSON.stringify(body)
      }
    );

    return ok(stock);
  } catch (error) {
    return toErrorResponse(error);
  }
}

function authorize(request: Request): { accessToken: string; response?: never } | { accessToken?: never; response: Response } {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return { response: fail(401, 'UNAUTHORIZED', 'Missing bearer token') };
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return { response: fail(401, 'UNAUTHORIZED', 'Invalid access token payload') };
  }
  if (!INVENTORY_EDIT_ROLES.has(claims.role)) {
    return { response: fail(403, 'FORBIDDEN', 'Role is not allowed to update inventory') };
  }

  return { accessToken };
}

