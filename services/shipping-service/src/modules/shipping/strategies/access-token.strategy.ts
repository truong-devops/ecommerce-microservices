import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { AccessTokenPayload } from '../../../common/types/jwt-payload.type';
import { RequestWithContext } from '../../../common/types/request-context.type';
import { RedisService } from '../../../common/utils/redis.service';

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy, 'jwt-access') {
  constructor(
    configService: ConfigService,
    private readonly redisService: RedisService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.access.secret')
    });
  }

  async validate(payload: AccessTokenPayload): Promise<RequestWithContext['user']> {
    if (!payload.sub || !payload.email || !payload.role) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Invalid token payload'
      });
    }

    if (payload.jti) {
      const revoked = await this.redisService.get(`revoked:access:${payload.jti}`);
      if (revoked) {
        throw new UnauthorizedException({
          code: ErrorCode.UNAUTHORIZED,
          message: 'Access token revoked'
        });
      }
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sessionId,
      jti: payload.jti,
      tokenVersion: payload.tokenVersion
    };
  }
}
