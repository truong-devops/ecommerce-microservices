import { ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';
import { normalizePositiveInt } from '../_utils';

const SESSION_STATUSES = new Set(['DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED']);

export async function GET(request: Request) {
  const input = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  query.set('page', String(normalizePositiveInt(input.get('page'), 1)));
  query.set('pageSize', String(normalizePositiveInt(input.get('pageSize'), 20, 100)));

  const status = input.get('status')?.trim().toUpperCase() ?? '';
  if (SESSION_STATUSES.has(status)) {
    query.set('status', status);
  }

  try {
    const sessions = await requestUpstream<unknown[]>(`${serviceBaseUrls.live}/live/sessions?${query.toString()}`);
    return ok(sessions);
  } catch (error) {
    return toErrorResponse(error);
  }
}
