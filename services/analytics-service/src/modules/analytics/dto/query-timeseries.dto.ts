import { IsIn, IsOptional, IsString } from 'class-validator';
import { QueryAnalyticsBaseDto } from './query-analytics-base.dto';

export class QueryTimeseriesDto extends QueryAnalyticsBaseDto {
  @IsOptional()
  @IsIn(['hour', 'day'])
  interval?: 'hour' | 'day';

  @IsOptional()
  @IsString()
  eventType?: string;
}
