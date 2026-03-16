import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcryptjs';
import { randomBytes } from 'crypto';

@Injectable()
export class PasswordService {
  constructor(private readonly configService: ConfigService) {}

  hashPassword(plainPassword: string): Promise<string> {
    const saltRounds = this.configService.get<number>('security.bcryptSaltRounds', 12);
    return hash(plainPassword, saltRounds);
  }

  comparePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return compare(plainPassword, hashedPassword);
  }

  generateOpaqueToken(): string {
    return randomBytes(48).toString('hex');
  }
}
