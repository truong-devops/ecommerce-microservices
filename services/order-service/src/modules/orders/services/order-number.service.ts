import { Injectable } from '@nestjs/common';

@Injectable()
export class OrderNumberService {
  generate(): string {
    const now = new Date();
    const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const random = Math.floor(100000 + Math.random() * 900000);
    return `ORD-${date}-${random}`;
  }
}
