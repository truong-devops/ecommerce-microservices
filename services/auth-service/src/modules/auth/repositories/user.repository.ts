import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>
  ) {}

  create(user: Partial<UserEntity>): UserEntity {
    return this.repository.create(user);
  }

  save(user: UserEntity): Promise<UserEntity> {
    return this.repository.save(user);
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.repository.findOne({ where: { email } });
  }

  findById(id: string): Promise<UserEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  async incrementTokenVersion(userId: string): Promise<void> {
    await this.repository.increment({ id: userId }, 'tokenVersion', 1);
  }
}
