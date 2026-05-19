import type { SellerRecommendationInsights, SellerRecommendationTrainingRun } from '@/lib/api/types';
import { readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/seller-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

export async function GET(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const input = new URL(request.url).searchParams;
  const limit = sanitizeLimit(input.get('limit'));
  const query = new URLSearchParams();
  query.set('limit', String(limit));

  try {
    const insights = await requestUpstream<SellerRecommendationInsights>(
      `${serviceBaseUrls.analytics}/analytics/recommendations/insights?${query.toString()}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    return ok(await normalizeInsights(insights, limit), 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function normalizeInsights(input: SellerRecommendationInsights, limit: number): Promise<SellerRecommendationInsights> {
  const items = Array.isArray(input.items)
    ? input.items.map((item) => ({
        ruleId: item.ruleId,
        antecedentProductIds: Array.isArray(item.antecedentProductIds) ? item.antecedentProductIds : [],
        consequentProductId: item.consequentProductId,
        support: safeNumber(item.support),
        confidence: safeNumber(item.confidence),
        lift: safeNumber(item.lift),
        score: safeNumber(item.score),
        supportCount: safeNumber(item.supportCount),
        transactionCount: safeNumber(item.transactionCount),
        generatedAt: item.generatedAt
      }))
    : [];

  return {
    limit: input.limit || limit,
    sellerId: input.sellerId ?? null,
    latestTrainingRun: normalizeTrainingRun(input.latestTrainingRun),
    productNames: await hydrateProductNames(items.flatMap((item) => [...item.antecedentProductIds, item.consequentProductId])),
    items
  };
}

function normalizeTrainingRun(raw: unknown): SellerRecommendationTrainingRun | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const runId = stringValue(record.runId ?? record.RunID);
  const status = stringValue(record.status ?? record.Status);
  const startedAt = stringValue(record.startedAt ?? record.StartedAt);

  if (!runId && !status && !startedAt) {
    return null;
  }

  return {
    runId,
    status,
    windowDays: safeNumber(record.windowDays ?? record.WindowDays),
    minSupportCount: safeNumber(record.minSupportCount ?? record.MinSupportCount),
    minConfidence: safeNumber(record.minConfidence ?? record.MinConfidence),
    maxAntecedentSize: safeNumber(record.maxAntecedentSize ?? record.MaxAntecedentSize),
    transactionCount: safeNumber(record.transactionCount ?? record.TransactionCount),
    frequentItemsetCount: safeNumber(record.frequentItemsetCount ?? record.FrequentItemsetCount),
    ruleCount: safeNumber(record.ruleCount ?? record.RuleCount),
    startedAt,
    finishedAt: nullableString(record.finishedAt ?? record.FinishedAt),
    errorMessage: nullableString(record.errorMessage ?? record.ErrorMessage)
  };
}

async function hydrateProductNames(productIds: string[]): Promise<Record<string, string>> {
  const uniqueIds = Array.from(new Set(productIds.map((id) => id.trim()).filter(Boolean)));
  const entries = await Promise.all(
    uniqueIds.map(async (productId) => {
      try {
        const product = await requestUpstream<unknown>(`${serviceBaseUrls.product}/products/${encodeURIComponent(productId)}`, {
          method: 'GET'
        });
        const name = extractProductName(product);
        return name ? ([productId, name] as const) : null;
      } catch {
        return null;
      }
    })
  );

  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null));
}

function sanitizeLimit(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 10;
  }
  return Math.min(50, Math.floor(parsed));
}

function extractProductName(product: unknown): string {
  if (!product || typeof product !== 'object') {
    return '';
  }
  return stringValue((product as { name?: unknown }).name);
}

function safeNumber(value: unknown): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nullableString(value: unknown): string | null {
  const normalized = stringValue(value);
  return normalized || null;
}
