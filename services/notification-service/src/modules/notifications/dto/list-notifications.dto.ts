import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { NotificationCategory } from '../entities/notification-category.enum';
import { NotificationChannel } from '../entities/notification-channel.enum';
import { NotificationStatus } from '../entities/notification-status.enum';

export enum NotificationSortBy {
  CREATED_AT = 'createdAt',
  SENT_AT = 'sentAt',
  STATUS = 'status'
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC'
}

export class ListNotificationsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number;

  @IsEnum(NotificationStatus)
  @IsOptional()
  status?: NotificationStatus;

  @IsEnum(NotificationChannel)
  @IsOptional()
  channel?: NotificationChannel;

  @IsEnum(NotificationCategory)
  @IsOptional()
  category?: NotificationCategory;

  @IsUUID()
  @IsOptional()
  recipientId?: string;

  @IsString()
  @IsOptional()
  eventType?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(NotificationSortBy)
  @IsOptional()
  sortBy?: NotificationSortBy;

  @IsEnum(SortOrder)
  @IsOptional()
  sortOrder?: SortOrder;
}
