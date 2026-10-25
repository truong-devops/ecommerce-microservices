import { requestBuyerApi } from './client';
import type { CreatePaymentGroupIntentInput, CreatePaymentIntentInput, Payment, PaymentGroup } from './types';

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

export function createBuyerPaymentIntent(
  input: AuthRequestInit & { payload: CreatePaymentIntentInput; idempotencyKey: string }
): Promise<Payment> {
  const { accessToken, payload, idempotencyKey, ...init } = input;

  return requestBuyerApi<Payment>(
    '/api/buyer/payments/intents',
    withAuth(accessToken, {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(payload),
      ...init
    })
  );
}

export function fetchBuyerPaymentByOrderId(input: AuthRequestInit & { orderId: string }): Promise<Payment | null> {
  const { accessToken, orderId, ...init } = input;

  return requestBuyerApi<Payment | null>(
    `/api/buyer/payments/order/${encodeURIComponent(orderId)}`,
    withAuth(accessToken, {
      method: 'GET',
      cache: 'no-store',
      ...init
    })
  );
}

export function createBuyerPaymentGroupIntent(
  input: AuthRequestInit & { payload: CreatePaymentGroupIntentInput; idempotencyKey: string }
): Promise<PaymentGroup> {
  const { accessToken, payload, idempotencyKey, ...init } = input;
  return requestBuyerApi<PaymentGroup>(
    '/api/buyer/payments/groups/intents',
    withAuth(accessToken, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
      ...init
    })
  );
}

export function fetchBuyerPaymentGroupById(input: AuthRequestInit & { groupId: string }): Promise<PaymentGroup> {
  const { accessToken, groupId, ...init } = input;
  return requestBuyerApi<PaymentGroup>(
    `/api/buyer/payments/groups/${encodeURIComponent(groupId)}`,
    withAuth(accessToken, { method: 'GET', cache: 'no-store', ...init })
  );
}
