import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { AccessTokenPayload, RefreshTokenPayload } from '../../../common/types/jwt-payload.type';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { sha256 } from '../../../common/utils/hash.util';

interface AccessTokenInput {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
  tokenVersion: number;
}

interface TokenIssueResult {
  token: string;
  jti: string;
  expiresAt: Date;
  expiresAtEpochSeconds: number;
}

@Injectable()
export class TokenService {
  private readonly refreshPepper: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {
    this.refreshPepper = this.configService.getOrThrow<string>('security.refreshTokenPepper');
  }

  async issueAccessToken(input: AccessTokenInput): Promise<TokenIssueResult> {
    const expiresIn = this.configService.getOrThrow<string>('jwt.access.expiresIn');
    const jti = randomUUID();

    const payload: AccessTokenPayload = {
      sub: input.userId,
      email: input.email,
      role: input.role as AccessTokenPayload['role'],
      sessionId: input.sessionId,
      jti,
      tokenVersion: input.tokenVersion
    };

    const token = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('jwt.access.secret'),
      expiresIn
    });

    const expiresAtEpochSeconds = this.getExpirationEpochSeconds(expiresIn);

    return {
      token,
      jti,
      expiresAt: new Date(expiresAtEpochSeconds * 1000),
      expiresAtEpochSeconds
    };
  }

  async issueRefreshToken(input: { userId: string; sessionId: string; tokenVersion: number }): Promise<TokenIssueResult> {
    const expiresIn = this.configService.getOrThrow<string>('jwt.refresh.expiresIn');
    const jti = randomUUID();

    const payload: RefreshTokenPayload = {
      sub: input.userId,
      sessionId: input.sessionId,
      jti,
      tokenVersion: input.tokenVersion
    };

    const token = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('jwt.refresh.secret'),
      expiresIn
    });

    const expiresAtEpochSeconds = this.getExpirationEpochSeconds(expiresIn);

    return {
      token,
      jti,
      expiresAt: new Date(expiresAtEpochSeconds * 1000),
      expiresAtEpochSeconds
    };
  }

  verifyRefreshToken(refreshToken: string): RefreshTokenPayload {
    try {
      return this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('jwt.refresh.secret')
      });
    } catch {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Invalid refresh token'
      });
    }
  }

  hashRefreshToken(refreshToken: string): string {
    return sha256(`${refreshToken}.${this.refreshPepper}`);
  }

  getAccessTokenTtlSeconds(): number {
    return this.toSeconds(this.configService.getOrThrow<string>('jwt.access.expiresIn'));
  }

  getRefreshTokenTtlSeconds(): number {
    return this.toSeconds(this.configService.getOrThrow<string>('jwt.refresh.expiresIn'));
  }

  private getExpirationEpochSeconds(expiresIn: string): number {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const seconds = this.toSeconds(expiresIn);
    return nowSeconds + seconds;
  }

  private toSeconds(expiresIn: string): number {
    const input = expiresIn.trim();

    if (/^\d+$/.test(input)) {
      return Number(input);
    }

    const match = input.match(/^(\d+)([smhd])$/i);
    if (!match) {
      throw new Error(`Unsupported JWT expires format: ${expiresIn}`);
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();

    if (unit === 's') return value;
    if (unit === 'm') return value * 60;
    if (unit === 'h') return value * 3600;
    return value * 86400;
  }
}
