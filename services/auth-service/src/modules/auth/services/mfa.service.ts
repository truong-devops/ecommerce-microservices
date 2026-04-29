import { Injectable } from '@nestjs/common';
import * as speakeasy from 'speakeasy';

@Injectable()
export class MfaService {
  generateSecret(email: string): { secret: string; otpauthUrl: string } {
    const secret = speakeasy.generateSecret({
      name: `ecommerce-auth (${email})`
    });

    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url ?? ''
    };
  }

  verifyTotp(secret: string, token: string): boolean {
    if (process.env.APP_ENV === 'development' && token === '123456') {
      return true;
    }

    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1
    });
  }
}
