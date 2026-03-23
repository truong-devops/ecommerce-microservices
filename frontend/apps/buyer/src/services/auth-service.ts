import { apiResolverVersion, authApiBaseUrlCandidates } from '../constants/env';
import { ApiEnvelope } from '../types/api';
import {
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  RegisterRequest,
  RegisterResponse,
  VerifyEmailRequest,
  VerifyEmailResponse
} from '../types/auth';

function buildAuthPaths(endpoint: string): string[] {
  return [`/api/v1/auth/${endpoint}`, `/api/auth/${endpoint}`, `/auth/${endpoint}`];
}

function getErrorMessage(response: Response, payload: ApiEnvelope<unknown> | null): string {
  if (payload && payload.success === false) {
    return payload.error.message;
  }

  if (response.status === 401) {
    return 'Unauthorized request. Please verify your credentials.';
  }

  if (response.status === 409) {
    return 'Conflict request. Data may already exist.';
  }

  return `Request failed with status ${response.status}.`;
}

function isRetryableFailure(response: Response, payload: ApiEnvelope<unknown> | null): boolean {
  if (response.status === 404 || response.status === 408 || response.status === 429 || response.status >= 500) {
    return true;
  }

  if (!payload || payload.success !== false) {
    return false;
  }

  const errorCode = payload.error.code?.toLowerCase();
  if (!errorCode) {
    return false;
  }

  return errorCode.includes('upstream_timeout') || errorCode.includes('bad_gateway') || errorCode.includes('service_unavailable');
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function postJson<TRequest, TResponse>(endpoint: string, body: TRequest): Promise<TResponse> {
  const authPaths = buildAuthPaths(endpoint);
  let latestResponse: Response | null = null;
  let latestPayload: ApiEnvelope<TResponse> | null = null;
  let networkFailed = true;
  const connectionErrors: string[] = [];

  for (const baseUrl of authApiBaseUrlCandidates) {
    for (const path of authPaths) {
      const requestUrl = `${baseUrl}${path}`;
      let response: Response;

      try {
        response = await fetchWithTimeout(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
        networkFailed = false;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown_network_error';
        connectionErrors.push(`${requestUrl} -> ${reason}`);
        continue;
      }

      let payload: ApiEnvelope<TResponse> | null = null;

      try {
        payload = (await response.json()) as ApiEnvelope<TResponse>;
      } catch {
        payload = null;
      }

      latestResponse = response;
      latestPayload = payload;

      if (isRetryableFailure(response, payload)) {
        continue;
      }

      if (!response.ok || !payload || payload.success === false) {
        throw new Error(getErrorMessage(response, payload));
      }

      return payload.data;
    }
  }

  if (networkFailed) {
    const detailMessage =
      connectionErrors.length > 0 ? ` Details: ${connectionErrors.slice(0, 3).join(' | ')}` : '';
    throw new Error(
      `Cannot connect to API (resolver ${apiResolverVersion}). Checked ${authApiBaseUrlCandidates.join(', ')}. Ensure api-gateway (8080) or auth-service (3001) is running.${detailMessage}`
    );
  }

  throw new Error(latestResponse ? getErrorMessage(latestResponse, latestPayload) : 'Route not found.');
}

export async function registerUser(request: RegisterRequest): Promise<RegisterResponse> {
  return postJson<RegisterRequest, RegisterResponse>('register', request);
}

export async function loginUser(request: LoginRequest): Promise<LoginResponse> {
  return postJson<LoginRequest, LoginResponse>('login', request);
}

export async function verifyEmail(request: VerifyEmailRequest): Promise<VerifyEmailResponse> {
  return postJson<VerifyEmailRequest, VerifyEmailResponse>('verify-email', request);
}

export async function refreshAccessToken(request: RefreshTokenRequest): Promise<RefreshTokenResponse> {
  return postJson<RefreshTokenRequest, RefreshTokenResponse>('refresh-token', request);
}

export function isTokenInvalidMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('invalid token') ||
    normalized.includes('unauthorized') ||
    normalized.includes('token expired') ||
    normalized.includes('jwt expired') ||
    normalized.includes('token claims')
  );
}
