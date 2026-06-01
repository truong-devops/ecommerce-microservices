import type {
  CreateOrderInput,
  CreatePaymentIntentInput,
  Order,
  OrderListOutput,
  OrderStatus,
  Payment,
  Shipment,
  ShippingQuotesOutput
} from '@frontend/buyer-contracts';

import { requestBuyerApi } from './client';

export async function fetchOrders(accessToken: string, status?: OrderStatus): Promise<Order[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const payload = await requestBuyerApi<Order[] | OrderListOutput>(`/orders${query}`, { method: 'GET' }, accessToken);
  return Array.isArray(payload) ? payload : payload.items;
}

export function fetchOrder(accessToken: string, orderId: string): Promise<Order> {
  return requestBuyerApi<Order>(`/orders/${encodeURIComponent(orderId)}`, { method: 'GET' }, accessToken);
}

export function createOrder(accessToken: string, payload: CreateOrderInput, idempotencyKey: string): Promise<Order> {
  return requestBuyerApi<Order>(
    '/orders',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export function quoteShipping(
  accessToken: string,
  payload: { sellerIds: string[]; destinationProvince: string }
): Promise<ShippingQuotesOutput> {
  return requestBuyerApi<ShippingQuotesOutput>(
    '/orders/shipping-quotes',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export function cancelOrder(accessToken: string, orderId: string): Promise<Order> {
  return requestBuyerApi<Order>(`/orders/${encodeURIComponent(orderId)}/cancel`, { method: 'PATCH', body: '{}' }, accessToken);
}

export function confirmOrderReceived(accessToken: string, orderId: string): Promise<Order> {
  return requestBuyerApi<Order>(`/orders/${encodeURIComponent(orderId)}/confirm-received`, { method: 'PATCH', body: '{}' }, accessToken);
}

export function createPaymentIntent(accessToken: string, order: Order, idempotencyKey: string): Promise<Payment> {
  const payload: CreatePaymentIntentInput = {
    orderId: order.id,
    sellerId: order.sellerId,
    currency: order.currency,
    amount: order.totalAmount,
    description: `Payment for ${order.orderNumber}`,
    autoCapture: true
  };

  return requestBuyerApi<Payment>(
    '/payments/intents',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export async function fetchPaymentForOrder(accessToken: string, orderId: string): Promise<Payment | null> {
  try {
    return await requestBuyerApi<Payment | null>(`/payments/order/${encodeURIComponent(orderId)}`, { method: 'GET' }, accessToken);
  } catch (error) {
    if (error instanceof Error && /payment .*not found|payment_not_found|not found/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}

export async function fetchShipmentForOrder(accessToken: string, orderId: string): Promise<Shipment | null> {
  try {
    return await requestBuyerApi<Shipment | null>(`/shipments/order/${encodeURIComponent(orderId)}`, { method: 'GET' }, accessToken);
  } catch (error) {
    if (error instanceof Error && /shipment .*not found|shipment_not_found|not found/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}
