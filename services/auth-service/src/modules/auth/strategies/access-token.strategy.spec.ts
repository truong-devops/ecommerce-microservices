import { UnauthorizedException } from '@nestjs/common';
import { Role } from '../../../common/constants/role.enum';
import { AccessTokenPayload } from '../../../common/types/jwt-payload.type';
import { AccessTokenStrategy } from './access-token.strategy';

describe('AccessTokenStrategy', () => {
  const payload: AccessTokenPayload = {
    sub: 'user-1',
    email: 'buyer@example.com',
    role: Role.CUSTOMER,
    sessionId: 'session-1',
    jti: 'access-jti-1',
    tokenVersion: 1
  };

  function createStrategy(overrides?: {
    redisGet?: jest.Mock;
    findSessionById?: jest.Mock;
    findUserById?: jest.Mock;
  }) {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('test-secret')
    };
    const userRepository = {
      findById:
        overrides?.findUserById ??
        jest.fn().mockResolvedValue({
          id: 'user-1',
          isActive: true,
          tokenVersion: 1
        })
    };
    const sessionRepository = {
      findById:
        overrides?.findSessionById ??
        jest.fn().mockResolvedValue({
          id: 'session-1',
          revokedAt: null
        })
    };
    const redisService = {
      get: overrides?.redisGet ?? jest.fn().mockResolvedValue(null)
    };

    return {
      strategy: new AccessTokenStrategy(configService as never, userRepository as never, sessionRepository as never, redisService as never),
      userRepository,
      sessionRepository,
      redisService
    };
  }

  it('accepts an access token when the referenced session is active', async () => {
    const { strategy, sessionRepository, redisService } = createStrategy();

    await expect(strategy.validate(payload)).resolves.toEqual({
      userId: 'user-1',
      email: 'buyer@example.com',
      role: Role.CUSTOMER,
      sessionId: 'session-1',
      jti: 'access-jti-1',
      tokenVersion: 1
    });
    expect(redisService.get).toHaveBeenCalledWith('revoked:access:access-jti-1');
    expect(redisService.get).toHaveBeenCalledWith('revoked:session:session-1');
    expect(sessionRepository.findById).toHaveBeenCalledWith('session-1');
  });

  it('rejects an access token when the session is revoked in Redis', async () => {
    const redisGet = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('1');
    const { strategy } = createStrategy({ redisGet });

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an access token when the session is revoked in storage', async () => {
    const findSessionById = jest.fn().mockResolvedValue({
      id: 'session-1',
      revokedAt: new Date()
    });
    const { strategy } = createStrategy({ findSessionById });

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });
});
