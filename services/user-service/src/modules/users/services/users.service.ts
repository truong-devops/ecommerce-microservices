import { ConflictException, Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { USER_SERVICE_ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { CreateUserDto } from '../dto/create-user.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserEntity } from '../entities/user.entity';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import { USER_EVENTS_PUBLISHER, UserEventsPublisher } from '../events/user-events.publisher';
import { PaginatedUsers, UsersRepository } from '../repositories/users.repository';

function isPostgresUniqueViolation(error: unknown): boolean {
  return error instanceof QueryFailedError && (error as QueryFailedError & { code?: string }).code === '23505';
}

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    @Inject(USER_EVENTS_PUBLISHER)
    private readonly userEventsPublisher: UserEventsPublisher
  ) {}

  async create(dto: CreateUserDto): Promise<UserEntity> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.usersRepository.findByEmail(normalizedEmail);
    if (existing && existing.status !== UserStatus.DELETED) {
      throw new ConflictException({
        code: USER_SERVICE_ERROR_CODES.USER_EMAIL_EXISTS,
        message: 'User email already exists'
      });
    }

    try {
      const created = await this.usersRepository.createUser({
        email: normalizedEmail,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone ?? null,
        role: dto.role ?? UserRole.BUYER,
        status: dto.status ?? UserStatus.PENDING,
        emailVerified: dto.emailVerified ?? false
      });

      await this.userEventsPublisher.publishUserRegistered({
        userId: created.id,
        email: created.email,
        role: created.role
      });

      return created;
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException({
          code: USER_SERVICE_ERROR_CODES.USER_EMAIL_EXISTS,
          message: 'User email already exists'
        });
      }

      throw new InternalServerErrorException({
        code: USER_SERVICE_ERROR_CODES.USER_CREATE_FAILED,
        message: 'Failed to create user'
      });
    }
  }

  async findAll(query: ListUsersQueryDto): Promise<PaginatedUsers> {
    return this.usersRepository.findAll(query);
  }

  async findOne(id: string): Promise<UserEntity> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException({
        code: USER_SERVICE_ERROR_CODES.USER_NOT_FOUND,
        message: 'User not found'
      });
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserEntity> {
    await this.findOne(id);

    if (dto.email) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      const existing = await this.usersRepository.findByEmail(normalizedEmail);
      if (existing && existing.id !== id && existing.status !== UserStatus.DELETED) {
        throw new ConflictException({
          code: USER_SERVICE_ERROR_CODES.USER_EMAIL_EXISTS,
          message: 'User email already exists'
        });
      }
      dto.email = normalizedEmail;
    }

    const updated = await this.usersRepository.updateUser(id, dto);
    if (!updated) {
      throw new NotFoundException({
        code: USER_SERVICE_ERROR_CODES.USER_NOT_FOUND,
        message: 'User not found'
      });
    }

    return updated;
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto): Promise<UserEntity> {
    await this.findOne(id);

    const updated = await this.usersRepository.updateStatus(id, dto.status);
    if (!updated) {
      throw new NotFoundException({
        code: USER_SERVICE_ERROR_CODES.USER_NOT_FOUND,
        message: 'User not found'
      });
    }

    return updated;
  }

  async remove(id: string): Promise<UserEntity> {
    const deleted = await this.usersRepository.softDelete(id);
    if (!deleted) {
      throw new NotFoundException({
        code: USER_SERVICE_ERROR_CODES.USER_NOT_FOUND,
        message: 'User not found'
      });
    }

    return deleted;
  }
}
