import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';

export class CreateOrderItemDto {
  @IsString()
  @Length(6, 128)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/)
  productId!: string;

  @IsString()
  @Length(1, 64)
  sku!: string;

  @IsString()
  @Length(1, 255)
  productName!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;
}

export class CreateOrderDto {
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  shippingAmount?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  discountAmount?: number;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  @IsNotEmpty()
  items!: CreateOrderItemDto[];
}
