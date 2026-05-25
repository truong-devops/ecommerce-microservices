export const MOBILE_OAUTH_CALLBACK_URL = 'dtcommercebuyer://auth/google/callback';

export function buildMobileGoogleAuthorizeUrl(apiBaseUrl: string, challenge: string, returnUrl = '/'): string {
  const url = new URL(`${apiBaseUrl.replace(/\/$/, '')}/auth/oauth/google/authorize`);
  url.searchParams.set('app', 'buyer-mobile');
  url.searchParams.set('callbackUrl', MOBILE_OAUTH_CALLBACK_URL);
  url.searchParams.set('returnUrl', returnUrl);
  url.searchParams.set('codeChallenge', challenge);
  return url.toString();
}

export function extractOauthTicket(callbackResultUrl: string): string {
  const callback = new URL(callbackResultUrl);
  if (callback.protocol !== 'dtcommercebuyer:' || callback.pathname !== '/google/callback' || callback.hostname !== 'auth') {
    throw new Error('OAuth callback URL không hợp lệ');
  }
  const error = callback.searchParams.get('error');
  if (error) {
    throw new Error(callback.searchParams.get('message') ?? error);
  }
  const ticket = callback.searchParams.get('ticket');
  if (!ticket) {
    throw new Error('OAuth callback không có login ticket');
  }
  return ticket;
}

export function toBase64Url(value: string): string {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
