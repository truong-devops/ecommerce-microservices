import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ErrorCode } from '../constants/error-code.enum';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestWithContext } from '../types/request-context.type';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt-access') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);

    if (isPublic) {
      const request = context.switchToHttp().getRequest<RequestWithContext>();
      const hasBearerToken = typeof request.headers.authorization === 'string' && request.headers.authorization.startsWith('Bearer ');
      if (!hasBearerToken) {
        return true;
      }
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser, _: unknown, context: ExecutionContext): TUser {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);

    if (isPublic) {
      return user;
    }

    if (err || !user) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Unauthorized'
      });
    }

    return user;
  }
}
