import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const PRODUCT_MANAGE_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'MODERATOR']);
const MAX_SCAN_PAGES = 20;
const PAGE_SIZE = 100;

interface ProductListOutput {
  categoryId: string;
}

interface CategoryOption {
  id: string;
  count: number;
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

  if (!PRODUCT_MANAGE_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to list product categories');
  }

  try {
    const categoryCounter = new Map<string, number>();

    let page = 1;

    while (page <= MAX_SCAN_PAGES) {
      const items = await requestUpstream<ProductListOutput[]>(
        `${serviceBaseUrls.product}/products/my?page=${page}&pageSize=${PAGE_SIZE}&sortBy=updatedAt&sortOrder=DESC`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      for (const item of items) {
        const categoryId = (item.categoryId ?? '').trim();
        if (!categoryId) {
          continue;
        }

        categoryCounter.set(categoryId, (categoryCounter.get(categoryId) ?? 0) + 1);
      }

      if (items.length < PAGE_SIZE) {
        break;
      }

      page += 1;
    }

    const categories: CategoryOption[] = Array.from(categoryCounter.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => (b.count - a.count) || a.id.localeCompare(b.id));

    return ok({
      items: categories,
      scannedPages: Math.min(page, MAX_SCAN_PAGES)
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
