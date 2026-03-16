import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailVerificationTokenEntity } from '../entities/email-verification-token.entity';

@Injectable()
export class EmailVerificationTokenRepository {
  constructor(
    @InjectRepository(EmailVerificationTokenEntity)
    private readonly repository: Repository<EmailVerificationTokenEntity>
  ) {}

  create(input: Partial<EmailVerificationTokenEntity>): EmailVerificationTokenEntity {
    return this.repository.create(input);
  }

  save(token: EmailVerificationTokenEntity): Promise<EmailVerificationTokenEntity> {
    return this.repository.save(token);
  }

  findByTokenHash(tokenHash: string): Promise<EmailVerificationTokenEntity | null> {
    return this.repository.findOne({ where: { tokenHash } });
  }

  async invalidateByUserId(userId: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(EmailVerificationTokenEntity)
      .set({ usedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('used_at IS NULL')
      .execute();
  }
}
