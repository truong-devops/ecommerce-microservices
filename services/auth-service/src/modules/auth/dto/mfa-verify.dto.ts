import { IsString, Length } from 'class-validator';

export class MfaVerifyDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}
