import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHmac, timingSafeEqual } from 'crypto';
import { ErrorCode } from '../constants/error-code.enum';
import { Role } from '../constants/role.enum';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUserContext, RequestWithContext } from '../types/request-context.type';

interface AccessTokenPayload {
  sub?: string;
  email?: string;
  role?: string;
  jti?: string;
  sessionId?: string;
  tokenVersion?: number;
  exp?: number;
  iat?: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const authHeader = request.header('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw this.unauthorized('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    request.user = this.verifyAndMapToken(token);
    return true;
  }

  private verifyAndMapToken(token: string): AuthenticatedUserContext {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw this.unauthorized('Invalid token format');
    }

    const [headerPart, payloadPart, signaturePart] = parts;
    const headerRaw = this.decodeBase64Url(headerPart);
    const payloadRaw = this.decodeBase64Url(payloadPart);

    let header: Record<string, unknown>;
    let payload: AccessTokenPayload;

    try {
      header = JSON.parse(headerRaw) as Record<string, unknown>;
      payload = JSON.parse(payloadRaw) as AccessTokenPayload;
    } catch {
      throw this.unauthorized('Invalid token payload');
    }

    if (header.alg !== 'HS256') {
      throw this.unauthorized('Unsupported token algorithm');
    }

    const secret = this.configService.getOrThrow<string>('jwt.access.secret');
    const expectedSignature = createHmac('sha256', secret)
      .update(`${headerPart}.${payloadPart}`)
      .digest('base64url');

    const provided = Buffer.from(signaturePart);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw this.unauthorized('Invalid token signature');
    }

    if (payload.exp && payload.exp * 1000 <= Date.now()) {
      throw this.unauthorized('Token expired');
    }

    if (!payload.sub || !payload.role) {
      throw this.unauthorized('Invalid token claims');
    }

    const role = this.toRole(payload.role);
    if (!role) {
      throw this.unauthorized('Invalid role claim');
    }

    return {
      userId: payload.sub,
      email: payload.email ?? '',
      role,
      jti: payload.jti,
      sessionId: payload.sessionId,
      tokenVersion: payload.tokenVersion
    };
  }

  private decodeBase64Url(value: string): string {
    try {
      return Buffer.from(value, 'base64url').toString('utf8');
    } catch {
      throw this.unauthorized('Invalid base64 token segment');
    }
  }

  private toRole(value: string): Role | null {
    const normalized = value.trim().toUpperCase();
    const roles = Object.values(Role) as string[];
    if (!roles.includes(normalized)) {
      return null;
    }

    return normalized as Role;
  }

  private unauthorized(message: string): UnauthorizedException {
    return new UnauthorizedException({
      code: ErrorCode.UNAUTHORIZED,
      message
    });
  }
}
