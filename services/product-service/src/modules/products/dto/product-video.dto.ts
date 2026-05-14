import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';
import { ProductVideoStatus } from '../entities/product-video-status.enum';

export class VideoProductTagPositionDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  x?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  y?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  startSec?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  endSec?: number;
}

export class VideoProductInputDto {
  @IsString()
  @Length(1, 64)
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  sortOrder?: number;

  @ValidateNested()
  @Type(() => VideoProductTagPositionDto)
  @IsObject()
  @IsOptional()
  tagPosition?: VideoProductTagPositionDto;
}

export class CreateProductVideoDto {
  @IsUUID()
  @IsOptional()
  sellerId?: string;

  @IsString()
  @Length(3, 120)
  title!: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VideoProductInputDto)
  products!: VideoProductInputDto[];
}

export class UpdateProductVideoDto {
  @IsString()
  @Length(3, 120)
  @IsOptional()
  title?: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VideoProductInputDto)
  @IsOptional()
  products?: VideoProductInputDto[];
}

export class ConfirmVideoMediaDto {
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9/_\-.]{1,1023}$/)
  mediaObjectKey!: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  mediaUrl?: string;

  @IsString()
  @Matches(/^video\/(mp4|webm)$/)
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  sizeBytes?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(600)
  @IsOptional()
  durationSec?: number;
}

export class ConfirmVideoThumbnailDto {
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9/_\-.]{1,1023}$/)
  thumbnailObjectKey!: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  thumbnailUrl?: string;
}

export class ListProductVideosDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number;

  @IsEnum(ProductVideoStatus)
  @IsOptional()
  status?: ProductVideoStatus;

  @IsString()
  @IsOptional()
  sellerId?: string;

  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;
}

export class TrackVideoEventDto {
  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  source?: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  anonymousSessionId?: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  clientEventId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  watchTimeSec?: number;
}
