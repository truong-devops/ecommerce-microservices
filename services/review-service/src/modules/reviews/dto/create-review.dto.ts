import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateReviewDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  productId!: string;

  @IsUUID()
  sellerId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  title?: string;

  @IsString()
  @MaxLength(2000)
  content!: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  @IsOptional()
  images?: string[];
}
