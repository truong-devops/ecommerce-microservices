import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mergeRotatedTokens, parseSession, serializeSession } from './session';

const session = {
  accessToken: 'access',
  refreshToken: 'refresh',
  tokenType: 'Bearer' as const,
  expiresIn: 3600,
  sessionId: 'session-1',
  user: { id: 'buyer-1', email: 'buyer@example.com', role: 'CUSTOMER', isEmailVerified: true }
};

describe('mobile auth session persistence', () => {
  it('round-trips a valid auth session', () => {
    assert.deepEqual(parseSession(serializeSession(session)), session);
  });

  it('does not restore malformed credentials', () => {
    assert.equal(parseSession('{"accessToken":"only-access"}'), null);
    assert.equal(parseSession('not-json'), null);
  });

  it('keeps the signed-in user while rotating access credentials', () => {
    assert.deepEqual(
      mergeRotatedTokens(session, {
        accessToken: 'next-access',
        refreshToken: 'next-refresh',
        tokenType: 'Bearer',
        expiresIn: 7200,
        sessionId: 'session-1'
      }),
      { ...session, accessToken: 'next-access', refreshToken: 'next-refresh', expiresIn: 7200 }
    );
  });
});
