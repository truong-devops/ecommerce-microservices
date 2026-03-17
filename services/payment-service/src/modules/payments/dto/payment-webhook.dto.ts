import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';
import { PaymentStatus } from '../entities/payment-status.enum';

export class PaymentWebhookDto {
  @IsString()
  @MaxLength(128)
  providerEventId!: string;

  @IsUUID()
  @IsOptional()
  paymentId?: string;

  @IsUUID()
  @IsOptional()
  orderId?: string;

  @IsString()
  @MaxLength(128)
  @IsOptional()
  gatewayTransactionId?: string;

  @IsString()
  @MaxLength(128)
  @IsOptional()
  providerPaymentId?: string;

  @IsString()
  @MaxLength(128)
  eventType!: string;

  @IsEnum(PaymentStatus)
  status!: PaymentStatus;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  amount?: number;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  @IsOptional()
  currency?: string;

  @IsISO8601()
  @IsOptional()
  occurredAt?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  signature?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  rawPayload?: Record<string, unknown>;
}
