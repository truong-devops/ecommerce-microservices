import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReservationActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
