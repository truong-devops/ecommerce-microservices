import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}
