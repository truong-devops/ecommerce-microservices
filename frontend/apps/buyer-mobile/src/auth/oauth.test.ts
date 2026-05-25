import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildMobileGoogleAuthorizeUrl, extractOauthTicket, MOBILE_OAUTH_CALLBACK_URL, toBase64Url } from './oauth-contract';

describe('mobile oauth PKCE boundary', () => {
  it('builds an authorize request bound to the app callback and challenge', () => {
    const url = new URL(buildMobileGoogleAuthorizeUrl('https://api.dt-commerce.site/api/v1', 'challenge-value'));
    assert.equal(url.searchParams.get('app'), 'buyer-mobile');
    assert.equal(url.searchParams.get('callbackUrl'), MOBILE_OAUTH_CALLBACK_URL);
    assert.equal(url.searchParams.get('codeChallenge'), 'challenge-value');
  });

  it('accepts tickets only from the registered deep link', () => {
    assert.equal(extractOauthTicket('dtcommercebuyer://auth/google/callback?ticket=ticket-1'), 'ticket-1');
    assert.throws(() => extractOauthTicket('https://evil.example/auth/google/callback?ticket=ticket-1'), /không hợp lệ/);
  });

  it('converts base64 to an RFC 7636 safe value', () => {
    assert.equal(toBase64Url('ab+c/de=='), 'ab-c_de');
  });
});
