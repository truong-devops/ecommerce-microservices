import { NextResponse } from 'next/server';
import { serviceBaseUrls } from '@/lib/server/upstream-client';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const callbackUrl = new URL('/api/buyer/auth/google/callback', requestUrl.origin).toString();
  const returnUrl = resolveReturnUrl(requestUrl.searchParams.get('returnUrl'));

  const authorizeUrl = new URL(`${ensureApiV1Base(serviceBaseUrls.auth)}/auth/oauth/google/authorize`);
  authorizeUrl.searchParams.set('app', 'buyer-web');
  authorizeUrl.searchParams.set('callbackUrl', callbackUrl);
  authorizeUrl.searchParams.set('returnUrl', returnUrl);

  return NextResponse.redirect(authorizeUrl.toString());
}

function resolveReturnUrl(raw: string | null): string {
  if (!raw) {
    return '/account';
  }

  const value = raw.trim();
  if (!value.startsWith('/') || value.startsWith('//')) {
    return '/account';
  }

  return value;
}

function ensureApiV1Base(raw: string): string {
  return raw.endsWith('/api/v1') ? raw : `${raw.replace(/\/$/, '')}/api/v1`;
}
