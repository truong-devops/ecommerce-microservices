import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  Min
} from 'class-validator';

export class AddCartItemDto {
  @IsString()
  @Length(1, 64)
  productId!: string;

  @IsString()
  @Length(1, 64)
  @IsOptional()
  variantId?: string;

  @IsString()
  @Length(1, 64)
  sku!: string;

  @IsString()
  @Length(1, 255)
  name!: string;

  @IsUrl()
  @IsOptional()
  image?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  quantity!: number;

  @IsString()
  @Length(1, 64)
  sellerId!: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  @IsOptional()
  currency?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  expectedVersion?: number;
}
