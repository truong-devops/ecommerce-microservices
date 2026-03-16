import { IsEmail } from 'class-validator';

export class ResendVerifyEmailDto {
  @IsEmail()
  email!: string;
}
