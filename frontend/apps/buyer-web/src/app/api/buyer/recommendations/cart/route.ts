import type { CartRecommendationOutput } from '@/lib/api/types';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

export async function POST(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  try {
    const data = await requestUpstream<CartRecommendationOutput>(`${serviceBaseUrls.analytics}/analytics/recommendations/cart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });

    return ok(normalizeRecommendation(data), 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

function normalizeRecommendation(data: CartRecommendationOutput): CartRecommendationOutput {
  return {
    productIds: Array.isArray(data.productIds) ? data.productIds : [],
    sellerId: data.sellerId ?? null,
    generatedAt: data.generatedAt ?? null,
    items: Array.isArray(data.items)
      ? data.items
          .filter((item) => typeof item.productId === 'string' && item.productId.trim().length > 0)
          .map((item) => ({
            productId: item.productId.trim(),
            score: Number.isFinite(item.score) ? item.score : 0,
            reason: item.reason || 'cart_pattern_match'
          }))
      : []
  };
}

function readBearerToken(value: string | null): string {
  if (!value) {
    return '';
  }

  const [type, token] = value.split(' ');
  if (!type || !token || type.toLowerCase() !== 'bearer') {
    return '';
  }
  return token.trim();
}
