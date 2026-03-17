import { IsBoolean, IsOptional } from 'class-validator';

export class ValidateCartDto {
  @IsBoolean()
  @IsOptional()
  includeExternalChecks?: boolean;
}
