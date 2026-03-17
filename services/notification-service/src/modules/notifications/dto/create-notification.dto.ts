import { ArrayMinSize, IsArray, IsEnum, IsObject, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { NotificationCategory } from '../entities/notification-category.enum';
import { NotificationChannel } from '../entities/notification-channel.enum';

export class CreateNotificationDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  recipientIds!: string[];

  @IsEnum(NotificationChannel)
  @IsOptional()
  channel?: NotificationChannel;

  @IsEnum(NotificationCategory)
  @IsOptional()
  category?: NotificationCategory;

  @IsString()
  @MaxLength(128)
  @IsOptional()
  eventType?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  subject?: string;

  @IsString()
  @Length(1, 2000)
  content!: string;

  @IsObject()
  @IsOptional()
  payload?: Record<string, unknown>;
}
