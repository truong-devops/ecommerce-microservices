import { NextResponse } from 'next/server';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

interface ExchangeResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  sessionId: string;
  returnUrl?: string;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const loginUrl = new URL('/login', requestUrl.origin);
  const ticket = requestUrl.searchParams.get('ticket');
  const error = requestUrl.searchParams.get('error');
  const message = requestUrl.searchParams.get('message');

  if (error) {
    loginUrl.searchParams.set('oauthError', message ?? error);
    return NextResponse.redirect(loginUrl);
  }

  if (!ticket) {
    loginUrl.searchParams.set('oauthError', 'Missing login ticket');
    return NextResponse.redirect(loginUrl);
  }

  try {
    const exchanged = await requestUpstream<ExchangeResponse>(`${ensureApiV1Base(serviceBaseUrls.auth)}/auth/oauth/exchange-ticket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        loginTicket: ticket,
        app: 'buyer-web'
      })
    });

    const session = {
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      tokenType: exchanged.tokenType,
      expiresIn: exchanged.expiresIn,
      sessionId: exchanged.sessionId
    };

    const returnUrl = resolveReturnUrl(exchanged.returnUrl);
    const html = renderBridgeHtml({
      storageKey: 'buyer_auth_session',
      session,
      returnUrl
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  } catch {
    loginUrl.searchParams.set('oauthError', 'Google login failed');
    return NextResponse.redirect(loginUrl);
  }
}

function resolveReturnUrl(raw: string | undefined): string {
  if (!raw) {
    return '/account';
  }

  const value = raw.trim();
  if (!value.startsWith('/') || value.startsWith('//')) {
    return '/account';
  }

  return value;
}

function renderBridgeHtml(input: { storageKey: string; session: Record<string, unknown>; returnUrl: string }): string {
  const safeStorageKey = JSON.stringify(input.storageKey);
  const safeSession = JSON.stringify(input.session).replace(/</g, '\\u003c');
  const safeReturnUrl = JSON.stringify(input.returnUrl);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Google Login</title>
  </head>
  <body>
    <script>
      try {
        localStorage.setItem(${safeStorageKey}, JSON.stringify(${safeSession}));
      } catch (error) {}
      window.location.replace(${safeReturnUrl});
    </script>
  </body>
</html>`;
}

function ensureApiV1Base(raw: string): string {
  return raw.endsWith('/api/v1') ? raw : `${raw.replace(/\/$/, '')}/api/v1`;
}
