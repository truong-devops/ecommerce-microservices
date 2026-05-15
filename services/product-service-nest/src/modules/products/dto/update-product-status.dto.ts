import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ProductStatus } from '../entities/product-status.enum';

export class UpdateProductStatusDto {
  @IsEnum(ProductStatus)
  status!: ProductStatus;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}
