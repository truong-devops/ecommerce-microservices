import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { OrderStatus } from '../entities/order-status.enum';

export enum OrderSortBy {
  CREATED_AT = 'createdAt',
  TOTAL_AMOUNT = 'totalAmount',
  ORDER_NUMBER = 'orderNumber'
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC'
}

export class ListOrdersDto {
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

  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @IsEnum(OrderSortBy)
  @IsOptional()
  sortBy?: OrderSortBy;

  @IsEnum(SortOrder)
  @IsOptional()
  sortOrder?: SortOrder;

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  search?: string;
}
