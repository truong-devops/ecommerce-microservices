import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { PaymentStatus } from '../entities/payment-status.enum';

export enum PaymentSortBy {
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
  STATUS = 'status'
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC'
}

export class ListPaymentsDto {
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

  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;

  @IsUUID()
  @IsOptional()
  orderId?: string;

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsUUID()
  @IsOptional()
  sellerId?: string;

  @IsString()
  @IsOptional()
  provider?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(PaymentSortBy)
  @IsOptional()
  sortBy?: PaymentSortBy;

  @IsEnum(SortOrder)
  @IsOptional()
  sortOrder?: SortOrder;
}
