import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { RefreshTokenEntity } from '../entities/refresh-token.entity';

@Injectable()
export class RefreshTokenRepository {
  constructor(
    @InjectRepository(RefreshTokenEntity)
    private readonly repository: Repository<RefreshTokenEntity>
  ) {}

  create(input: Partial<RefreshTokenEntity>): RefreshTokenEntity {
    return this.repository.create(input);
  }

  save(token: RefreshTokenEntity): Promise<RefreshTokenEntity> {
    return this.repository.save(token);
  }

  findByJti(jti: string): Promise<RefreshTokenEntity | null> {
    return this.repository.findOne({ where: { jti } });
  }

  async revokeByJti(jti: string): Promise<void> {
    await this.repository.update(
      { jti, revokedAt: IsNull() },
      {
        revokedAt: new Date()
      }
    );
  }

  async revokeAllBySessionId(sessionId: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(RefreshTokenEntity)
      .set({ revokedAt: new Date() })
      .where('session_id = :sessionId', { sessionId })
      .andWhere('revoked_at IS NULL')
      .execute();
  }

  async revokeAllByUserId(userId: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(RefreshTokenEntity)
      .set({ revokedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .execute();
  }
}
