import { requestSellerApi } from './client';
import type {
  ListSellerShipmentsInput,
  SellerShipment,
  SellerShipmentListOutput,
  SellerShipmentTrackingEventsOutput
} from './types';

function buildQuery(params?: ListSellerShipmentsInput): string {
  if (!params) {
    return '';
  }

  const query = new URLSearchParams();

  if (typeof params.page === 'number') {
    query.set('page', String(params.page));
  }

  if (typeof params.pageSize === 'number') {
    query.set('pageSize', String(params.pageSize));
  }

  if (params.status) {
    query.set('status', params.status);
  }

  if (params.provider?.trim()) {
    query.set('provider', params.provider.trim());
  }

  if (params.orderId?.trim()) {
    query.set('orderId', params.orderId.trim());
  }

  if (params.search?.trim()) {
    query.set('search', params.search.trim());
  }

  if (params.sortBy) {
    query.set('sortBy', params.sortBy);
  }

  if (params.sortOrder) {
    query.set('sortOrder', params.sortOrder);
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
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

export function listSellerShipments(accessToken: string, params?: ListSellerShipmentsInput): Promise<SellerShipmentListOutput> {
  return requestSellerApi<SellerShipmentListOutput>(`/api/seller/shipments${buildQuery(params)}`, withAuth(accessToken, {
    method: 'GET',
    cache: 'no-store'
  }));
}

export function getSellerShipmentByOrderId(accessToken: string, orderId: string): Promise<SellerShipment | null> {
  return requestSellerApi<SellerShipment | null>(
    `/api/seller/shipments/order/${encodeURIComponent(orderId)}`,
    withAuth(accessToken, {
      method: 'GET',
      cache: 'no-store'
    })
  );
}

export function getSellerShipmentTrackingEvents(
  accessToken: string,
  shipmentId: string
): Promise<SellerShipmentTrackingEventsOutput> {
  return requestSellerApi<SellerShipmentTrackingEventsOutput>(
    `/api/seller/shipments/${encodeURIComponent(shipmentId)}/tracking-events`,
    withAuth(accessToken, {
      method: 'GET',
      cache: 'no-store'
    })
  );
}
