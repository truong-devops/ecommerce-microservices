import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  quantity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  expectedVersion?: number;
}
