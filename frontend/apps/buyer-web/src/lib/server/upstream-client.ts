const AUTH_SERVICE_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3001/api/v1';
const PRODUCT_SERVICE_BASE_URL = process.env.PRODUCT_SERVICE_BASE_URL ?? 'http://localhost:3003/api/v1';

export const serviceBaseUrls = {
  auth: AUTH_SERVICE_BASE_URL,
  product: PRODUCT_SERVICE_BASE_URL
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
    const code = payload && 'error' in payload ? payload.error?.code ?? `HTTP_${response.status}` : `HTTP_${response.status}`;
    const message =
      payload && 'error' in payload
        ? payload.error?.message ?? `Upstream request failed with status ${response.status}`
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
