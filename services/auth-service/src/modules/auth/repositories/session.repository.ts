import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SessionEntity } from '../entities/session.entity';

@Injectable()
export class SessionRepository {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly repository: Repository<SessionEntity>
  ) {}

  create(session: Partial<SessionEntity>): SessionEntity {
    return this.repository.create(session);
  }

  save(session: SessionEntity): Promise<SessionEntity> {
    return this.repository.save(session);
  }

  findById(id: string): Promise<SessionEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  findActiveByUserId(userId: string): Promise<SessionEntity[]> {
    return this.repository.find({
      where: {
        userId,
        revokedAt: IsNull()
      },
      order: {
        createdAt: 'DESC'
      }
    });
  }

  async revokeById(sessionId: string, reason: string): Promise<void> {
    await this.repository.update(
      { id: sessionId, revokedAt: IsNull() },
      {
        revokedAt: new Date(),
        revokeReason: reason
      }
    );
  }

  async revokeAllByUserId(userId: string, reason: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(SessionEntity)
      .set({
        revokedAt: new Date(),
        revokeReason: reason
      })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .execute();
  }
}
