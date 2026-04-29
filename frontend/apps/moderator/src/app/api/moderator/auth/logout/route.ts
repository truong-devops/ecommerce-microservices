import { fail, ok } from '@/lib/server/moderator-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

function readBearerToken(value: string | null): string {
  if (!value) {
    return '';
  }

  const [type, token] = value.split(' ');
  if (!type || !token || type.toLowerCase() !== 'bearer') {
    return '';
  }

  return token;
}

interface LogoutRequestBody {
  refreshToken?: unknown;
}

export async function POST(request: Request) {
  let body: LogoutRequestBody;

  try {
    body = (await request.json()) as LogoutRequestBody;
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid JSON body');
  }

  const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken : '';
  const accessToken = readBearerToken(request.headers.get('authorization'));

  if (!refreshToken) {
    return fail(400, 'BAD_REQUEST', 'refreshToken is required');
  }

  try {
    const loggedOut = await requestUpstream<{ message: string }>(`${serviceBaseUrls.auth}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({ refreshToken })
    });

    return ok({ message: loggedOut.message });
  } catch (error) {
    return toErrorResponse(error);
  }
}
