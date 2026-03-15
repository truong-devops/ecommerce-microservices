import { Injectable } from '@nestjs/common';
import { SessionRepository } from '../repositories/session.repository';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';
import { SessionEntity } from '../entities/session.entity';
import { RedisService } from '../../../common/utils/redis.service';

@Injectable()
export class SessionService {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly redisService: RedisService
  ) {}

  async createSession(input: { userId: string; ipAddress?: string; userAgent?: string }): Promise<SessionEntity> {
    const session = this.sessionRepository.create({
      userId: input.userId,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      lastActivityAt: new Date()
    });

    return this.sessionRepository.save(session);
  }

  listActiveSessions(userId: string): Promise<SessionEntity[]> {
    return this.sessionRepository.findActiveByUserId(userId);
  }

  getSessionById(sessionId: string): Promise<SessionEntity | null> {
    return this.sessionRepository.findById(sessionId);
  }

  async revokeSession(sessionId: string, reason: string): Promise<void> {
    await this.sessionRepository.revokeById(sessionId, reason);
    await this.refreshTokenRepository.revokeAllBySessionId(sessionId);
    await this.redisService.setWithTtl(`revoked:session:${sessionId}`, '1', 60 * 60 * 24 * 30);
  }

  async revokeAllSessions(userId: string, reason: string): Promise<void> {
    await this.sessionRepository.revokeAllByUserId(userId, reason);
    await this.refreshTokenRepository.revokeAllByUserId(userId);
  }

  async revokeAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    await this.redisService.setWithTtl(`revoked:access:${jti}`, '1', Math.max(1, ttlSeconds));
  }
}
