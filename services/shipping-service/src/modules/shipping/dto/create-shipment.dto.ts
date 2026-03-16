import { Type } from 'class-transformer';
import { IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, Min } from 'class-validator';

export class CreateShipmentDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  buyerId!: string;

  @IsUUID()
  sellerId!: string;

  @IsString()
  @Length(1, 64)
  provider!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  shippingFee?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  codAmount?: number;

  @IsString()
  @Length(1, 255)
  recipientName!: string;

  @IsString()
  @Length(1, 32)
  recipientPhone!: string;

  @IsString()
  @Length(1, 500)
  recipientAddress!: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  awb?: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  trackingNumber?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
