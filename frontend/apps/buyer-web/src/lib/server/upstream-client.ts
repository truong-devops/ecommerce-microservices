const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:12000/api/v1';
const AUTH_SERVICE_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? API_GATEWAY_BASE_URL;
const USER_SERVICE_BASE_URL = process.env.USER_SERVICE_BASE_URL ?? API_GATEWAY_BASE_URL;
const PRODUCT_SERVICE_BASE_URL = process.env.PRODUCT_SERVICE_BASE_URL ?? API_GATEWAY_BASE_URL;
const REVIEW_SERVICE_BASE_URL = process.env.REVIEW_SERVICE_BASE_URL ?? API_GATEWAY_BASE_URL;
const ORDER_SERVICE_BASE_URL = process.env.ORDER_SERVICE_BASE_URL ?? API_GATEWAY_BASE_URL;
const PAYMENT_SERVICE_BASE_URL = process.env.PAYMENT_SERVICE_BASE_URL ?? API_GATEWAY_BASE_URL;
const INVENTORY_SERVICE_BASE_URL = process.env.INVENTORY_SERVICE_BASE_URL ?? API_GATEWAY_BASE_URL;
const SHIPPING_SERVICE_BASE_URL = process.env.SHIPPING_SERVICE_BASE_URL ?? API_GATEWAY_BASE_URL;
const CHAT_SERVICE_BASE_URL = process.env.CHAT_SERVICE_BASE_URL ?? API_GATEWAY_BASE_URL;
const LIVE_SERVICE_BASE_URL = process.env.LIVE_SERVICE_BASE_URL ?? API_GATEWAY_BASE_URL;
const ANALYTICS_SERVICE_BASE_URL = process.env.ANALYTICS_SERVICE_BASE_URL ?? API_GATEWAY_BASE_URL;

export const serviceBaseUrls = {
  gateway: API_GATEWAY_BASE_URL,
  auth: AUTH_SERVICE_BASE_URL,
  user: USER_SERVICE_BASE_URL,
  product: PRODUCT_SERVICE_BASE_URL,
  review: REVIEW_SERVICE_BASE_URL,
  order: ORDER_SERVICE_BASE_URL,
  payment: PAYMENT_SERVICE_BASE_URL,
  inventory: INVENTORY_SERVICE_BASE_URL,
  shipping: SHIPPING_SERVICE_BASE_URL,
  chat: CHAT_SERVICE_BASE_URL,
  live: LIVE_SERVICE_BASE_URL,
  analytics: ANALYTICS_SERVICE_BASE_URL
};

export class UpstreamHttpError extends Error {
  status: number;
  code: string;
  isNetworkError: boolean;

  constructor(status: number, code: string, message: string, isNetworkError = false) {
    super(message);
    this.name = 'UpstreamHttpError';
    this.status = status;
    this.code = code;
    this.isNetworkError = isNetworkError;
  }
}

interface UpstreamErrorBody {
  success?: false;
  error?: {
    code?: string;
    message?: string;
  };
}

interface UpstreamSuccessBody<T> {
  success: true;
  data: T;
}

export async function requestUpstream<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      cache: 'no-store'
    });
  } catch {
    throw new UpstreamHttpError(503, 'UPSTREAM_UNAVAILABLE', 'Cannot connect to upstream service', true);
  }

  const text = await response.text();
  const payload = safeParseJson(text) as UpstreamSuccessBody<T> | UpstreamErrorBody | null;

  if (!response.ok) {
    const code = payload && 'error' in payload ? (payload.error?.code ?? `HTTP_${response.status}`) : `HTTP_${response.status}`;
    const message =
      payload && 'error' in payload
        ? (payload.error?.message ?? `Upstream request failed with status ${response.status}`)
        : `Upstream request failed with status ${response.status}`;

    throw new UpstreamHttpError(response.status, code, message);
  }

  if (payload && typeof payload === 'object' && 'success' in payload) {
    if (payload.success === true) {
      return payload.data;
    }

    const code = payload.error?.code ?? 'UPSTREAM_ERROR';
    const message = payload.error?.message ?? 'Upstream request failed';
    throw new UpstreamHttpError(response.status, code, message);
  }

  if (payload === null) {
    throw new UpstreamHttpError(502, 'INVALID_UPSTREAM_RESPONSE', 'Upstream returned non-JSON response');
  }

  return payload as T;
}

function safeParseJson(raw: string): unknown | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
