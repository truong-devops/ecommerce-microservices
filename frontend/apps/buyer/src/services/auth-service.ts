import { apiBaseUrl } from '../constants/env';
import { ApiEnvelope } from '../types/api';
import { LoginRequest, LoginResponse, RegisterRequest, RegisterResponse } from '../types/auth';

const authBasePath = '/api/v1/auth';

function buildAuthUrl(endpoint: string): string {
  return `${apiBaseUrl}${authBasePath}/${endpoint}`;
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

async function postJson<TRequest, TResponse>(endpoint: string, body: TRequest): Promise<TResponse> {
  const requestUrl = buildAuthUrl(endpoint);
  let response: Response;

  try {
    response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error(`Cannot connect to API (${requestUrl}). Ensure api-gateway is running on localhost:8080.`);
  }

  let payload: ApiEnvelope<TResponse> | null = null;

  try {
    payload = (await response.json()) as ApiEnvelope<TResponse>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || payload.success === false) {
    throw new Error(getErrorMessage(response, payload));
  }

  return payload.data;
}

export async function registerUser(request: RegisterRequest): Promise<RegisterResponse> {
  return postJson<RegisterRequest, RegisterResponse>('register', request);
}

export async function loginUser(request: LoginRequest): Promise<LoginResponse> {
  return postJson<LoginRequest, LoginResponse>('login', request);
}
