import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { NotificationAttemptEntity } from '../entities/notification-attempt.entity';

@Injectable()
export class NotificationAttemptRepository {
  constructor(
    @InjectRepository(NotificationAttemptEntity)
    private readonly repository: Repository<NotificationAttemptEntity>
  ) {}

  async save(attempt: Partial<NotificationAttemptEntity>, manager?: EntityManager): Promise<NotificationAttemptEntity> {
    const repo = manager ? manager.getRepository(NotificationAttemptEntity) : this.repository;
    return repo.save(attempt);
  }
}
