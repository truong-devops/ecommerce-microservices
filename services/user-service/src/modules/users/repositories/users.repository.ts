import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Not, Repository } from 'typeorm';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserEntity } from '../entities/user.entity';
import { UserStatus } from '../enums/user-status.enum';

export interface PaginatedUsers {
  items: UserEntity[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>
  ) {}

  async createUser(payload: Partial<UserEntity>): Promise<UserEntity> {
    const entity = this.userRepository.create(payload);
    return this.userRepository.save(entity);
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({
      where: {
        id,
        status: Not(UserStatus.DELETED)
      }
    });
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({
      where: { email: ILike(email) }
    });
  }

  async findAll(query: ListUsersQueryDto): Promise<PaginatedUsers> {
    const qb = this.userRepository.createQueryBuilder('user');

    if (query.status) {
      qb.andWhere('user.status = :status', { status: query.status });
    } else {
      qb.andWhere('user.status != :deletedStatus', { deletedStatus: UserStatus.DELETED });
    }

    if (query.role) {
      qb.andWhere('user.role = :role', { role: query.role });
    }

    if (query.search) {
      qb.andWhere(
        '(user.email ILIKE :search OR user.first_name ILIKE :search OR user.last_name ILIKE :search)',
        { search: `%${query.search.trim()}%` }
      );
    }

    qb.orderBy(`user.${this.resolveSortField(query.sortBy)}`, query.sortOrder);

    const totalItems = await qb.getCount();
    const page = query.page;
    const pageSize = query.pageSize;

    qb.skip((page - 1) * pageSize).take(pageSize);

    const items = await qb.getMany();
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    return {
      items,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages
      }
    };
  }

  async updateUser(id: string, payload: UpdateUserDto): Promise<UserEntity | null> {
    await this.userRepository.update({ id, status: Not(UserStatus.DELETED) }, payload);
    return this.findById(id);
  }

  async updateStatus(id: string, status: UserStatus): Promise<UserEntity | null> {
    await this.userRepository.update({ id, status: Not(UserStatus.DELETED) }, { status });
    return this.findById(id);
  }

  async softDelete(id: string): Promise<UserEntity | null> {
    const user = await this.findById(id);
    if (!user) {
      return null;
    }

    user.status = UserStatus.DELETED;
    user.deletedAt = new Date();
    return this.userRepository.save(user);
  }

  private resolveSortField(sortBy: ListUsersQueryDto['sortBy']): string {
    switch (sortBy) {
      case 'email':
        return 'email';
      case 'firstName':
        return 'first_name';
      case 'lastName':
        return 'last_name';
      case 'updatedAt':
        return 'updated_at';
      case 'createdAt':
      default:
        return 'created_at';
    }
  }
}
