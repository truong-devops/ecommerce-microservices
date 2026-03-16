import { IsEnum, IsISO8601, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ShipmentStatus } from '../entities/shipment-status.enum';

export class ShippingWebhookDto {
  @IsString()
  @MaxLength(128)
  providerEventId!: string;

  @IsUUID()
  @IsOptional()
  orderId?: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  awb?: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  trackingNumber?: string;

  @IsEnum(ShipmentStatus)
  status!: ShipmentStatus;

  @IsISO8601()
  @IsOptional()
  occurredAt?: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  eventCode?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  location?: string;

  @IsObject()
  @IsOptional()
  rawPayload?: Record<string, unknown>;
}
