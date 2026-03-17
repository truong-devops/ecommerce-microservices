import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class ValidateInventoryDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => value.trim().toUpperCase())
  sku!: string;

  @Transform(({ value }: { value: string }) => Number(value))
  @IsInt()
  @Min(1)
  quantity!: number;
}
