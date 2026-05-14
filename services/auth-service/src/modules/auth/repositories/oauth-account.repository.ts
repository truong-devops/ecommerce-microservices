import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OauthAccountEntity } from '../entities/oauth-account.entity';

@Injectable()
export class OauthAccountRepository {
  constructor(
    @InjectRepository(OauthAccountEntity)
    private readonly repository: Repository<OauthAccountEntity>
  ) {}

  create(input: Partial<OauthAccountEntity>): OauthAccountEntity {
    return this.repository.create(input);
  }

  save(account: OauthAccountEntity): Promise<OauthAccountEntity> {
    return this.repository.save(account);
  }

  findByProviderUserId(provider: string, providerUserId: string): Promise<OauthAccountEntity | null> {
    return this.repository.findOne({
      where: {
        provider,
        providerUserId
      }
    });
  }

  findByProviderEmail(provider: string, providerEmail: string): Promise<OauthAccountEntity | null> {
    return this.repository.findOne({
      where: {
        provider,
        providerEmail
      }
    });
  }
}

