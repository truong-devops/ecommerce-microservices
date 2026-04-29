import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const PRODUCT_MANAGE_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'MODERATOR']);
const PRODUCT_EDIT_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN']);
const PAGE_SIZE = 100;
const MAX_SCAN_PAGES = 20;

interface ProductItem {
  id: string;
}

export async function GET(request: Request, context: { params: { productId: string } }) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!PRODUCT_MANAGE_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to get product detail');
  }

  const productId = context.params.productId?.trim();
  if (!productId) {
    return fail(400, 'BAD_REQUEST', 'Missing product id');
  }

  try {
    const found = await findManagedProductById(accessToken, productId);
    if (!found) {
      return fail(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    }

    return ok(found);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: { productId: string } }) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!PRODUCT_EDIT_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to update product');
  }

  const productId = context.params.productId?.trim();
  if (!productId) {
    return fail(400, 'BAD_REQUEST', 'Missing product id');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(400, 'BAD_REQUEST', 'Invalid product payload');
  }

  try {
    const updated = await requestUpstream<unknown>(`${serviceBaseUrls.product}/products/${productId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(body)
    });

    return ok(updated);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: { productId: string } }) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!PRODUCT_EDIT_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to delete product');
  }

  const productId = context.params.productId?.trim();
  if (!productId) {
    return fail(400, 'BAD_REQUEST', 'Missing product id');
  }

  try {
    const deleted = await requestUpstream<unknown>(`${serviceBaseUrls.product}/products/${productId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return ok(deleted);
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function findManagedProductById(accessToken: string, productId: string): Promise<unknown | null> {
  let page = 1;

  while (page <= MAX_SCAN_PAGES) {
    const items = await requestUpstream<unknown[]>(
      `${serviceBaseUrls.product}/products/my?page=${page}&pageSize=${PAGE_SIZE}&sortBy=updatedAt&sortOrder=DESC`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const found = items.find((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      return ((item as ProductItem).id ?? '').trim() === productId;
    });

    if (found) {
      return found;
    }

    if (items.length < PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return null;
}
