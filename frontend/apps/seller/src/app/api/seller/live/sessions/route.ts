import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';
import { authorizeLiveSeller, normalizePositiveInt, parseObjectBody } from '../_utils';

const SESSION_STATUSES = new Set(['DRAFT', 'SCHEDULED', 'LIVE', 'PAUSED', 'ENDED', 'CANCELLED']);

export async function GET(request: Request) {
  const authorized = authorizeLiveSeller(request);
  if (authorized instanceof Response) {
    return authorized;
  }

  const input = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  query.set('page', String(normalizePositiveInt(input.get('page'), 1)));
  query.set('pageSize', String(normalizePositiveInt(input.get('pageSize'), 20, 100)));

  const status = input.get('status')?.trim().toUpperCase() ?? '';
  if (SESSION_STATUSES.has(status)) {
    query.set('status', status);
  }

  try {
    const sessions = await requestUpstream<unknown[]>(`${serviceBaseUrls.live}/live/sessions/my?${query.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${authorized.accessToken}` }
    });
    return ok(sessions);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const authorized = authorizeLiveSeller(request);
  if (authorized instanceof Response) {
    return authorized;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  if (!parseObjectBody(body)) {
    return fail(400, 'BAD_REQUEST', 'Invalid live session payload');
  }

  try {
    const created = await requestUpstream<unknown>(`${serviceBaseUrls.live}/live/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authorized.accessToken}`
      },
      body: JSON.stringify(body)
    });
    return ok(created, 'backend', 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
