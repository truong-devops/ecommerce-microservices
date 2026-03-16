import { IsEnum, IsISO8601, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ShipmentStatus } from '../entities/shipment-status.enum';

export class CreateTrackingEventDto {
  @IsEnum(ShipmentStatus)
  status!: ShipmentStatus;

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

  @IsISO8601()
  @IsOptional()
  occurredAt?: string;

  @IsObject()
  @IsOptional()
  rawPayload?: Record<string, unknown>;
}
