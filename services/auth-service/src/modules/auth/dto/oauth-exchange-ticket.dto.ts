import { IsIn, IsOptional, IsString } from 'class-validator';

export class OauthExchangeTicketDto {
  @IsString()
  loginTicket!: string;

  @IsString()
  @IsIn(['buyer-web', 'buyer-mobile', 'seller', 'moderator'])
  app!: string;

  @IsOptional()
  @IsString()
  codeVerifier?: string;
}
