import type { ProductRecommendationOutput } from '@/lib/api/types';
import { ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

interface RouteContext {
  params: {
    productId: string;
  };
}

export async function GET(request: Request, context: RouteContext) {
  let productId = '';
  try {
    productId = decodeURIComponent(context.params.productId ?? '').trim();
  } catch {
    productId = '';
  }

  if (!productId) {
    return ok(emptyRecommendation(''), 'backend');
  }

  const requestUrl = new URL(request.url);
  const limit = sanitizeLimit(requestUrl.searchParams.get('limit'));
  const query = new URLSearchParams();
  query.set('limit', String(limit));

  try {
    const data = await requestUpstream<ProductRecommendationOutput>(
      `${serviceBaseUrls.analytics}/analytics/recommendations/products/${encodeURIComponent(productId)}?${query.toString()}`
    );

    return ok(normalizeRecommendation(data, productId), 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

function normalizeRecommendation(data: ProductRecommendationOutput, productId: string): ProductRecommendationOutput {
  return {
    productId: data.productId || productId,
    sellerId: data.sellerId ?? null,
    generatedAt: data.generatedAt ?? null,
    items: Array.isArray(data.items)
      ? data.items
          .filter((item) => typeof item.productId === 'string' && item.productId.trim().length > 0)
          .map((item) => ({
            productId: item.productId.trim(),
            score: Number.isFinite(item.score) ? item.score : 0,
            reason: item.reason || 'frequently_bought_together'
          }))
      : []
  };
}

function emptyRecommendation(productId: string): ProductRecommendationOutput {
  return {
    productId,
    sellerId: null,
    generatedAt: null,
    items: []
  };
}

function sanitizeLimit(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 6;
  }
  return Math.min(12, Math.floor(parsed));
}
