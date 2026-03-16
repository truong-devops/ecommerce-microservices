import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateUserDto } from '../dto/create-user.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserEntity } from '../entities/user.entity';
import { UsersService } from '../services/users.service';

@Controller(['users', 'v1/users'])
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  createUser(@Body() body: CreateUserDto): Promise<UserEntity> {
    return this.usersService.create(body);
  }

  @Get()
  findUsers(
    @Query() query: ListUsersQueryDto
  ): Promise<{
    items: UserEntity[];
    pagination: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  findUserById(@Param('id') id: string): Promise<UserEntity> {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  updateUser(@Param('id') id: string, @Body() body: UpdateUserDto): Promise<UserEntity> {
    return this.usersService.update(id, body);
  }

  @Patch(':id/status')
  updateUserStatus(@Param('id') id: string, @Body() body: UpdateUserStatusDto): Promise<UserEntity> {
    return this.usersService.updateStatus(id, body);
  }

  @Delete(':id')
  deleteUser(@Param('id') id: string): Promise<UserEntity> {
    return this.usersService.remove(id);
  }
}
