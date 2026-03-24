import { IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import { UserGender } from '../enums/user-gender.enum';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  lastName?: string;

  @IsOptional()
  @Matches(/^\+?[1-9]\d{7,14}$/)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  address?: string;

  @IsOptional()
  @IsEnum(UserGender)
  gender?: UserGender;

  @IsOptional()
  @IsDateString({ strict: true })
  dateOfBirth?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  avatarUrl?: string | null;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;
}
