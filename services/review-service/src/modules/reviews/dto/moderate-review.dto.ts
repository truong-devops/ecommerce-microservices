import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReviewStatus } from '../enums/review-status.enum';

export class ModerateReviewDto {
  @IsEnum(ReviewStatus)
  status!: ReviewStatus;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}
