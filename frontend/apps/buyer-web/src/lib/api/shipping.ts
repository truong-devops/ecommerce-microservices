import { requestBuyerApi } from './client';
import type { Shipment, ShipmentTrackingEventsOutput } from './types';

interface AuthRequestInit extends RequestInit {
  accessToken: string;
}

function withAuth(accessToken: string, init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {})
    }
  };
}

export function fetchBuyerShipmentByOrderId(input: AuthRequestInit & { orderId: string }): Promise<Shipment | null> {
  const { accessToken, orderId, ...init } = input;

  return requestBuyerApi<Shipment | null>(
    `/api/buyer/shipments/order/${encodeURIComponent(orderId)}`,
    withAuth(accessToken, {
      method: 'GET',
      cache: 'no-store',
      ...init
    })
  );
}

export function fetchBuyerShipmentTrackingEvents(
  input: AuthRequestInit & { shipmentId: string }
): Promise<ShipmentTrackingEventsOutput> {
  const { accessToken, shipmentId, ...init } = input;

  return requestBuyerApi<ShipmentTrackingEventsOutput>(
    `/api/buyer/shipments/${encodeURIComponent(shipmentId)}/tracking-events`,
    withAuth(accessToken, {
      method: 'GET',
      cache: 'no-store',
      ...init
    })
  );
}
