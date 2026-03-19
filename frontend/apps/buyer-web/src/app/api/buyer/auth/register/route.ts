import { ok, fail } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

interface RegisterRequestBody {
  email?: unknown;
  password?: unknown;
  role?: unknown;
}

interface UpstreamRegisterOutput {
  userId: string;
  email: string;
  role: string;
  emailVerificationRequired: boolean;
  verifyToken?: string;
}

export async function POST(request: Request) {
  let body: RegisterRequestBody;

  try {
    body = (await request.json()) as RegisterRequestBody;
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const role = body.role === 'SELLER' ? 'SELLER' : 'CUSTOMER';

  if (!email || !password) {
    return fail(400, 'BAD_REQUEST', 'Email and password are required');
  }

  try {
    const registered = await requestUpstream<UpstreamRegisterOutput>(`${serviceBaseUrls.auth}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        role
      })
    });

    if (typeof registered.verifyToken === 'string' && registered.verifyToken.length > 0) {
      try {
        await requestUpstream<Record<string, unknown>>(`${serviceBaseUrls.auth}/auth/verify-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            token: registered.verifyToken
          })
        });
      } catch {
        // Keep register response successful even when auto-verify fails.
      }
    }

    return ok(
      {
        userId: registered.userId,
        email: registered.email,
        role: registered.role,
        emailVerificationRequired: registered.emailVerificationRequired
      },
      'backend'
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
