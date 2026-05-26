import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  mfaCode?: string;

  @IsOptional()
  @IsIn(['buyer-web', 'buyer-mobile', 'seller', 'moderator'])
  app?: string;
}
