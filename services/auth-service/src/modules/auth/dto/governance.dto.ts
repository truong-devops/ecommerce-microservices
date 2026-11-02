import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class GovernanceListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;
}

export class CreateGovernancePolicyDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  code!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  description!: string;

  @IsString()
  @IsIn(['MARKETPLACE', 'PRODUCT', 'VIDEO', 'CHAT', 'FINANCE', 'SECURITY'])
  scope!: string;

  @IsOptional()
  @IsString()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(20000)
  content!: string;

  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}

export class UpdateGovernancePolicyDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['MARKETPLACE', 'PRODUCT', 'VIDEO', 'CHAT', 'FINANCE', 'SECURITY'])
  scope?: string;

  @IsOptional()
  @IsString()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(20000)
  content?: string;

  @IsOptional()
  @IsDateString()
  effectiveAt?: string | null;
}

export class RecordGovernanceActionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  action!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(64)
  resourceType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  resourceId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  description!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateGovernanceTeamMemberDto {
  @IsOptional()
  @IsString()
  @IsIn(['MODERATOR', 'ADMIN'])
  role?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
