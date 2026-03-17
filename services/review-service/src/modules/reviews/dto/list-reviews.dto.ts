import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ReviewStatus } from '../enums/review-status.enum';

export enum ReviewSortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  RATING = 'rating'
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC'
}

export class ListReviewsDto {
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

  @IsUUID()
  @IsOptional()
  productId?: string;

  @IsUUID()
  @IsOptional()
  sellerId?: string;

  @IsUUID()
  @IsOptional()
  buyerId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @IsEnum(ReviewStatus)
  @IsOptional()
  status?: ReviewStatus;

  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(ReviewSortBy)
  @IsOptional()
  sortBy?: ReviewSortBy;

  @IsEnum(SortOrder)
  @IsOptional()
  sortOrder?: SortOrder;
}
