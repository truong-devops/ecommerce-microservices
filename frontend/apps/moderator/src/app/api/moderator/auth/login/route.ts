import { fail, ok } from '@/lib/server/moderator-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const MODERATOR_ROLES = new Set(['MODERATOR', 'ADMIN', 'SUPER_ADMIN']);

interface LoginRequestBody {
  email?: unknown;
  password?: unknown;
  mfaCode?: unknown;
}

interface UpstreamLoginOutput {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  sessionId: string;
  user: {
    id: string;
    email: string;
    role: string;
    isEmailVerified: boolean;
    mfaEnabled: boolean;
  };
}

export async function POST(request: Request) {
  let body: LoginRequestBody;

  try {
    body = (await request.json()) as LoginRequestBody;
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const mfaCode = typeof body.mfaCode === 'string' ? body.mfaCode : undefined;

  if (!email || !password) {
    return fail(400, 'BAD_REQUEST', 'Email and password are required');
  }

  try {
    const loggedIn = await requestUpstream<UpstreamLoginOutput>(`${serviceBaseUrls.auth}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        mfaCode
      })
    });

    if (!MODERATOR_ROLES.has(loggedIn.user.role)) {
      return fail(403, 'FORBIDDEN', 'Role is not allowed for moderator dashboard');
    }

    return ok({
      session: {
        accessToken: loggedIn.accessToken,
        refreshToken: loggedIn.refreshToken,
        tokenType: loggedIn.tokenType,
        expiresIn: loggedIn.expiresIn,
        sessionId: loggedIn.sessionId
      },
      user: loggedIn.user
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
