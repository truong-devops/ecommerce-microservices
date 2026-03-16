import { HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../../common/utils/app-exception.util';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { CartItem, CartValidationIssue } from '../entities/cart.types';

@Injectable()
export class CartValidationClientService {
  private readonly enabled: boolean;
  private readonly productServiceBaseUrl: string;
  private readonly inventoryServiceBaseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>('dependencies.validationEnabled', false);
    this.productServiceBaseUrl = this.configService.get<string>('dependencies.productServiceBaseUrl', '');
    this.inventoryServiceBaseUrl = this.configService.get<string>('dependencies.inventoryServiceBaseUrl', '');
    this.timeoutMs = this.configService.get<number>('dependencies.timeoutMs', 5000);
  }

  async validateItem(item: CartItem, includeExternalChecks = true): Promise<CartValidationIssue[]> {
    if (!this.enabled || !includeExternalChecks) {
      return [];
    }

    const issues: CartValidationIssue[] = [];

    if (this.productServiceBaseUrl) {
      const response = await this.request('GET', `${this.productServiceBaseUrl.replace(/\/+$/, '')}/products/${item.productId}`);
      if (response.status === 404) {
        issues.push({
          code: ErrorCode.NOT_FOUND,
          message: 'Product not found',
          itemId: item.id,
          productId: item.productId
        });
      } else if (!response.ok) {
        throw new ServiceUnavailableException({
          code: ErrorCode.CART_DEPENDENCY_UNAVAILABLE,
          message: 'Product service validation failed'
        });
      }
    }

    if (this.inventoryServiceBaseUrl) {
      const inventoryUrl = `${this.inventoryServiceBaseUrl.replace(/\/+$/, '')}/inventory/validate?sku=${encodeURIComponent(item.sku)}&quantity=${item.quantity}`;
      const response = await this.request('GET', inventoryUrl);
      if (!response.ok) {
        throw new ServiceUnavailableException({
          code: ErrorCode.CART_DEPENDENCY_UNAVAILABLE,
          message: 'Inventory service validation failed'
        });
      }
    }

    return issues;
  }

  private async request(method: 'GET' | 'POST', url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          accept: 'application/json'
        }
      });
    } catch {
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, {
        code: ErrorCode.CART_DEPENDENCY_UNAVAILABLE,
        message: 'Dependency service unavailable'
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
