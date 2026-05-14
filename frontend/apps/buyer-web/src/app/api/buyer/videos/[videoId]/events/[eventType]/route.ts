import { ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const ALLOWED_EVENTS = new Set(['view-started', 'view-qualified', 'product-clicked', 'add-to-cart']);

export async function POST(request: Request, context: { params: { videoId: string; eventType: string } }) {
  const videoId = context.params.videoId?.trim();
  const eventType = context.params.eventType?.trim();

  if (!videoId || !ALLOWED_EVENTS.has(eventType)) {
    return Response.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid video event' }, meta: { timestamp: new Date().toISOString() } },
      { status: 400 }
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const result = await requestUpstream<unknown>(`${serviceBaseUrls.product}/videos/${encodeURIComponent(videoId)}/events/${eventType}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body && typeof body === 'object' ? body : {})
    });

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
