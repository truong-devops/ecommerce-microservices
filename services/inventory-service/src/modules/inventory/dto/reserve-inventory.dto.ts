import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class ReserveInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => value.trim().toUpperCase())
  sku!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class ReserveInventoryDto {
  @IsUUID()
  orderId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReserveInventoryItemDto)
  items!: ReserveInventoryItemDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  ttlMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
