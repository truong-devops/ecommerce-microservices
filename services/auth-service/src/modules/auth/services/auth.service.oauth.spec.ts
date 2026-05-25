import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

const challenge = 'a'.repeat(43);

describe('AuthService mobile OAuth boundary', () => {
  function setup(redisPayload?: string) {
    const config = {
      get: jest.fn((key: string, fallback: unknown) => {
        const values: Record<string, unknown> = {
          'oauth.buyerMobileCallbackUrl': 'dtcommercebuyer://auth/google/callback',
          'oauth.google.scopes': ['openid', 'email', 'profile']
        };
        return values[key] ?? fallback;
      }),
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'oauth.google.clientId': 'client-id',
          'oauth.google.redirectUri': 'https://api.example/api/v1/auth/oauth/google/callback'
        };
        return values[key];
      })
    };
    const userRepository = { findById: jest.fn() };
    const redis = {
      setWithTtl: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(redisPayload ?? null),
      delete: jest.fn().mockResolvedValue(undefined)
    };
    const password = { generateOpaqueToken: jest.fn().mockReturnValue('state-token') };
    const service = new AuthService(
      config as never,
      userRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      password as never,
      {} as never,
      {} as never,
      redis as never,
      {} as never,
      {} as never,
      {} as never
    );
    return { service, redis, userRepository };
  }

  it('stores an app-bound PKCE challenge for a valid mobile authorize request', async () => {
    const { service, redis } = setup();

    const url = await service.buildGoogleAuthorizeUrl({
      app: 'buyer-mobile',
      callbackUrl: 'dtcommercebuyer://auth/google/callback',
      codeChallenge: challenge
    });

    expect(url).toContain('accounts.google.com');
    const storedState = JSON.parse(redis.setWithTtl.mock.calls[0][1] as string) as Record<string, string>;
    expect(storedState).toMatchObject({ app: 'buyer-mobile', codeChallenge: challenge });
  });

  it('rejects mobile authorize requests without PKCE or with a different callback', async () => {
    const { service } = setup();

    await expect(
      service.buildGoogleAuthorizeUrl({ app: 'buyer-mobile', callbackUrl: 'dtcommercebuyer://auth/google/callback' })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.buildGoogleAuthorizeUrl({
        app: 'buyer-mobile',
        callbackUrl: 'https://evil.example/google/callback',
        codeChallenge: challenge
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an exchanged mobile ticket when the PKCE verifier does not match', async () => {
    const payload = JSON.stringify({ app: 'buyer-mobile', userId: 'buyer-1', returnUrl: '/', codeChallenge: challenge });
    const { service, userRepository } = setup(payload);

    await expect(
      service.exchangeOauthTicket(
        { app: 'buyer-mobile', loginTicket: 'ticket-1', codeVerifier: 'different-verifier-value-that-is-long-enough-0000' },
        {} as never
      )
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(userRepository.findById).not.toHaveBeenCalled();
  });
});
