import type { CreateOrderInput, Order, OrderListOutput, OrderStatus, Payment } from '@frontend/buyer-contracts';

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

export function cancelOrder(accessToken: string, orderId: string): Promise<Order> {
  return requestBuyerApi<Order>(`/orders/${encodeURIComponent(orderId)}/cancel`, { method: 'PATCH', body: '{}' }, accessToken);
}

export function confirmOrderReceived(accessToken: string, orderId: string): Promise<Order> {
  return requestBuyerApi<Order>(`/orders/${encodeURIComponent(orderId)}/confirm-received`, { method: 'PATCH', body: '{}' }, accessToken);
}

export function createPaymentIntent(accessToken: string, order: Order, idempotencyKey: string): Promise<Payment> {
  return requestBuyerApi<Payment>(
    '/payments/intents',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        orderId: order.id,
        currency: order.currency,
        amount: order.totalAmount,
        description: `Payment for ${order.orderNumber}`,
        autoCapture: true
      })
    },
    accessToken
  );
}

export function fetchPaymentForOrder(accessToken: string, orderId: string): Promise<Payment | null> {
  return requestBuyerApi<Payment | null>(`/payments/order/${encodeURIComponent(orderId)}`, { method: 'GET' }, accessToken);
}
