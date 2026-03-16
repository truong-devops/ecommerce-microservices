import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordResetTokenEntity } from '../entities/password-reset-token.entity';

@Injectable()
export class PasswordResetTokenRepository {
  constructor(
    @InjectRepository(PasswordResetTokenEntity)
    private readonly repository: Repository<PasswordResetTokenEntity>
  ) {}

  create(input: Partial<PasswordResetTokenEntity>): PasswordResetTokenEntity {
    return this.repository.create(input);
  }

  save(token: PasswordResetTokenEntity): Promise<PasswordResetTokenEntity> {
    return this.repository.save(token);
  }

  findByTokenHash(tokenHash: string): Promise<PasswordResetTokenEntity | null> {
    return this.repository.findOne({ where: { tokenHash } });
  }

  async invalidateByUserId(userId: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(PasswordResetTokenEntity)
      .set({ usedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('used_at IS NULL')
      .execute();
  }
}
