import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';
import { ProductStatus } from '../entities/product-status.enum';

export class ProductVariantDto {
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Za-z0-9._-]+$/)
  sku!: string;

  @IsString()
  @Length(1, 255)
  name!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  compareAtPrice?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class CreateProductDto {
  @IsUUID()
  @IsOptional()
  sellerId?: string;

  @IsString()
  @Length(1, 255)
  name!: string;

  @IsString()
  @Length(1, 255)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @IsOptional()
  slug?: string;

  @IsString()
  @MaxLength(5000)
  @IsOptional()
  description?: string;

  @IsString()
  @Length(1, 64)
  categoryId!: string;

  @IsString()
  @MaxLength(128)
  @IsOptional()
  brand?: string;

  @IsObject()
  @IsOptional()
  attributes?: Record<string, unknown>;

  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  images?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  @IsNotEmpty()
  variants!: ProductVariantDto[];

  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;
}
