import { NextResponse } from 'next/server';
import { serviceBaseUrls } from '@/lib/server/upstream-client';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const callbackUrl = new URL('/api/moderator/auth/google/callback', requestUrl.origin).toString();

  const authorizeUrl = new URL('/auth/oauth/google/authorize', ensureApiV1Base(serviceBaseUrls.auth));
  authorizeUrl.searchParams.set('app', 'moderator');
  authorizeUrl.searchParams.set('callbackUrl', callbackUrl);
  authorizeUrl.searchParams.set('returnUrl', '/');

  return NextResponse.redirect(authorizeUrl.toString());
}

function ensureApiV1Base(raw: string): string {
  return raw.endsWith('/api/v1') ? raw : `${raw.replace(/\/$/, '')}/api/v1`;
}

