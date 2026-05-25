import { Role } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const currentUser: AuthenticatedUserContext = {
    userId: 'user-1',
    email: 'user@example.com',
    role: Role.CUSTOMER,
    sessionId: 'session-1',
    jti: 'jti-1',
    tokenVersion: 1
  };

  it('delegates getMe to authService', async () => {
    const authService = {
      getMe: jest.fn().mockResolvedValue({
        user: {
          id: 'user-1',
          email: 'user@example.com',
          role: Role.CUSTOMER,
          isEmailVerified: true,
          mfaEnabled: false
        }
      })
    };

    const rateLimiter = {};
    const controller = new AuthController(authService as never, rateLimiter as never);
    const result = await controller.getMe(currentUser);

    expect(authService.getMe).toHaveBeenCalledWith(currentUser);
    expect(result).toEqual({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        role: Role.CUSTOMER,
        isEmailVerified: true,
        mfaEnabled: false
      }
    });
  });

  it('rate limits login before delegating to authService', async () => {
    const authService = {
      login: jest.fn().mockResolvedValue({ accessToken: 'token' })
    };
    const rateLimiter = {
      assertLoginAllowed: jest.fn().mockResolvedValue(undefined)
    };
    const controller = new AuthController(authService as never, rateLimiter as never);
    const request = { ip: '127.0.0.1', header: jest.fn() };
    const dto = { email: 'USER@example.com', password: 'password-123' };

    await expect(controller.login(dto as never, request as never)).resolves.toEqual({ accessToken: 'token' });

    expect(rateLimiter.assertLoginAllowed).toHaveBeenCalledWith(request, dto.email);
    expect(authService.login).toHaveBeenCalledWith(dto, request);
  });

  it('passes the mobile PKCE challenge to Google authorization', async () => {
    const authService = {
      buildGoogleAuthorizeUrl: jest.fn().mockResolvedValue('https://accounts.google.com/authorize')
    };
    const rateLimiter = {
      assertOauthAllowed: jest.fn().mockResolvedValue(undefined)
    };
    const response = { redirect: jest.fn() };
    const request = { ip: '127.0.0.1' };
    const controller = new AuthController(authService as never, rateLimiter as never);

    await controller.googleAuthorize(
      'buyer-mobile',
      'dtcommercebuyer://auth/google/callback',
      '/',
      'challenge',
      request as never,
      response as never
    );

    expect(authService.buildGoogleAuthorizeUrl).toHaveBeenCalledWith({
      app: 'buyer-mobile',
      callbackUrl: 'dtcommercebuyer://auth/google/callback',
      returnUrl: '/',
      codeChallenge: 'challenge'
    });
  });
});
