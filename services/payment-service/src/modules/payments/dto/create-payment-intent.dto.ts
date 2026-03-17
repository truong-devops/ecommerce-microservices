import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min
} from 'class-validator';
import { PaymentStatus } from '../entities/payment-status.enum';

export class CreatePaymentIntentDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  @IsOptional()
  sellerId?: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  provider?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  autoCapture?: boolean;

  @IsEnum(PaymentStatus)
  @IsOptional()
  simulatedStatus?: PaymentStatus;
}
