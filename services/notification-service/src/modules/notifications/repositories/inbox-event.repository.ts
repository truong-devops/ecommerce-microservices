import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { InboxEventEntity } from '../entities/inbox-event.entity';

@Injectable()
export class InboxEventRepository {
  constructor(
    @InjectRepository(InboxEventEntity)
    private readonly repository: Repository<InboxEventEntity>
  ) {}

  async save(event: Partial<InboxEventEntity>, manager?: EntityManager): Promise<InboxEventEntity> {
    const repo = manager ? manager.getRepository(InboxEventEntity) : this.repository;
    return repo.save(event);
  }

  async findByEventKey(eventKey: string): Promise<InboxEventEntity | null> {
    return this.repository.findOne({
      where: { eventKey }
    });
  }
}
