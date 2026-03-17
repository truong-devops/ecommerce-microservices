import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import { Role } from '../../../common/constants/role.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequestWithContext } from '../../../common/types/request-context.type';
import { CreatePaymentIntentDto, CreateRefundDto, ListPaymentsDto, PaymentWebhookDto } from '../dto';
import { PaymentsService } from '../services/payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('intents')
  @Roles(Role.CUSTOMER)
  async createPaymentIntent(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreatePaymentIntentDto
  ): Promise<Record<string, unknown>> {
    return this.paymentsService.createPaymentIntent(user!, request.requestId, idempotencyKey, dto);
  }

  @Get()
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async listPayments(@CurrentUser() user: RequestWithContext['user'], @Query() query: ListPaymentsDto): Promise<Record<string, unknown>> {
    return this.paymentsService.listPayments(user!, query);
  }

  @Get('order/:orderId')
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async getPaymentByOrderId(
    @CurrentUser() user: RequestWithContext['user'],
    @Param('orderId') orderId: string
  ): Promise<Record<string, unknown>> {
    return this.paymentsService.getPaymentByOrderId(user!, orderId);
  }

  @Get(':id')
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async getPaymentById(@CurrentUser() user: RequestWithContext['user'], @Param('id') id: string): Promise<Record<string, unknown>> {
    return this.paymentsService.getPaymentById(user!, id);
  }

  @Post(':id/refunds')
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.SUPPORT, Role.SUPER_ADMIN)
  async createRefund(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Param('id') id: string,
    @Body() dto: CreateRefundDto
  ): Promise<Record<string, unknown>> {
    return this.paymentsService.createRefund(user!, request.requestId, id, dto);
  }

  @Get(':id/refunds')
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async listRefunds(@CurrentUser() user: RequestWithContext['user'], @Param('id') id: string): Promise<Record<string, unknown>> {
    return this.paymentsService.listRefunds(user!, id);
  }

  @Public()
  @Post('webhooks/:provider')
  async handleProviderWebhook(
    @Req() request: RequestWithContext,
    @Param('provider') provider: string,
    @Body() dto: PaymentWebhookDto
  ): Promise<Record<string, unknown>> {
    return this.paymentsService.handleProviderWebhook(request.requestId, provider, dto);
  }
}
