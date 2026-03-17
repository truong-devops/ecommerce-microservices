import { IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AdjustStockDto {
  @IsInt()
  deltaOnHand!: number;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsInt()
  expectedVersion?: number;
}
