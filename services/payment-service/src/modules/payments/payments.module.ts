import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './controllers/payments.controller';
import { IdempotencyRecordEntity } from './entities/idempotency-record.entity';
import { OutboxEventEntity } from './entities/outbox-event.entity';
import { PaymentAuditLogEntity } from './entities/payment-audit-log.entity';
import { PaymentStatusHistoryEntity } from './entities/payment-status-history.entity';
import { PaymentTransactionEntity } from './entities/payment-transaction.entity';
import { PaymentEntity } from './entities/payment.entity';
import { RefundEntity } from './entities/refund.entity';
import { WebhookIdempotencyRecordEntity } from './entities/webhook-idempotency-record.entity';
import { MockPaymentGatewayProvider } from './providers/mock-payment-gateway.provider';
import { PAYMENT_GATEWAY_PROVIDER, PaymentGatewayProvider } from './providers/payment-gateway-provider.interface';
import { VnpayPaymentGatewayProvider } from './providers/vnpay-payment-gateway.provider';
import { IdempotencyRecordRepository } from './repositories/idempotency-record.repository';
import { OutboxEventRepository } from './repositories/outbox-event.repository';
import { PaymentAuditLogRepository } from './repositories/payment-audit-log.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { PaymentStatusHistoryRepository } from './repositories/payment-status-history.repository';
import { PaymentTransactionRepository } from './repositories/payment-transaction.repository';
import { RefundRepository } from './repositories/refund.repository';
import { WebhookIdempotencyRecordRepository } from './repositories/webhook-idempotency-record.repository';
import { AccessTokenStrategy } from './strategies/access-token.strategy';
import { EventsPublisherService } from './services/events-publisher.service';
import { IdempotencyService } from './services/idempotency.service';
import { OutboxDispatcherService } from './services/outbox-dispatcher.service';
import { PaymentsService } from './services/payments.service';

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: 'jwt-access'
    }),
    TypeOrmModule.forFeature([
      PaymentEntity,
      PaymentTransactionEntity,
      PaymentStatusHistoryEntity,
      PaymentAuditLogEntity,
      IdempotencyRecordEntity,
      WebhookIdempotencyRecordEntity,
      RefundEntity,
      OutboxEventEntity
    ])
  ],
  controllers: [PaymentsController],
  providers: [
    AccessTokenStrategy,
    PaymentRepository,
    PaymentTransactionRepository,
    PaymentStatusHistoryRepository,
    PaymentAuditLogRepository,
    IdempotencyRecordRepository,
    WebhookIdempotencyRecordRepository,
    RefundRepository,
    OutboxEventRepository,
    IdempotencyService,
    EventsPublisherService,
    OutboxDispatcherService,
    PaymentsService,
    MockPaymentGatewayProvider,
    VnpayPaymentGatewayProvider,
    {
      provide: PAYMENT_GATEWAY_PROVIDER,
      inject: [ConfigService, MockPaymentGatewayProvider, VnpayPaymentGatewayProvider],
      useFactory: (
        configService: ConfigService,
        mockProvider: MockPaymentGatewayProvider,
        vnpayProvider: VnpayPaymentGatewayProvider
      ): PaymentGatewayProvider => {
        const provider = configService.get<string>('gateway.provider', 'mock');

        if (provider === 'vnpay') {
          return vnpayProvider;
        }

        return mockProvider;
      }
    }
  ]
})
export class PaymentsModule {}
