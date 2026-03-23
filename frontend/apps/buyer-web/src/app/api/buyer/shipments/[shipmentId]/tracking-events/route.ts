import type { ShipmentTrackingEventsOutput } from '@/lib/api/types';
import { readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

interface RouteContext {
  params: {
    shipmentId: string;
  };
}

const SHIPMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: RouteContext) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const shipmentId = normalizeShipmentId(context.params.shipmentId);
  if (!SHIPMENT_ID_PATTERN.test(shipmentId)) {
    return fail(400, 'BAD_REQUEST', 'Invalid shipment id');
  }

  try {
    const trackingEvents = await requestUpstream<ShipmentTrackingEventsOutput>(
      `${serviceBaseUrls.shipping}/shipments/${encodeURIComponent(shipmentId)}/tracking-events`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    return ok(trackingEvents, 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

function normalizeShipmentId(raw: string): string {
  try {
    return decodeURIComponent(raw ?? '').trim();
  } catch {
    return '';
  }
}
