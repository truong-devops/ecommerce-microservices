import { NextResponse } from 'next/server';
import { serviceBaseUrls } from '@/lib/server/upstream-client';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const callbackUrl = new URL('/api/seller/auth/google/callback', requestUrl.origin).toString();

  const authorizeUrl = new URL(`${ensureApiV1Base(serviceBaseUrls.auth)}/auth/oauth/google/authorize`);
  authorizeUrl.searchParams.set('app', 'seller');
  authorizeUrl.searchParams.set('callbackUrl', callbackUrl);
  authorizeUrl.searchParams.set('returnUrl', '/');

  try {
    const response = await fetch(authorizeUrl, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'manual'
    });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      return NextResponse.redirect(location);
    }
  } catch {
    // Redirect to the login page below with a useful production-safe error.
  }

  const loginUrl = new URL('/login', requestUrl.origin);
  loginUrl.searchParams.set('oauthError', 'Không thể bắt đầu đăng nhập Google');
  return NextResponse.redirect(loginUrl);
}

function ensureApiV1Base(raw: string): string {
  return raw.endsWith('/api/v1') ? raw : `${raw.replace(/\/$/, '')}/api/v1`;
}
