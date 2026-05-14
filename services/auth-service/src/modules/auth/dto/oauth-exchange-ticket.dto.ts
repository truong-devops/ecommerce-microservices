import { IsIn, IsString } from 'class-validator';

export class OauthExchangeTicketDto {
  @IsString()
  loginTicket!: string;

  @IsString()
  @IsIn(['buyer-web', 'seller', 'moderator'])
  app!: string;
}

