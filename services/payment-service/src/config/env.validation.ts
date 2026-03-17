import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  APP_NAME: Joi.string().default('payment-service'),
  APP_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
  PORT: Joi.number().default(3006),
  API_PREFIX: Joi.string().default('api/v1'),

  DATABASE_URL: Joi.string().uri().required(),
  DB_SSL: Joi.boolean().default(false),

  REDIS_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),

  IDEMPOTENCY_RECORD_TTL_MINUTES: Joi.number().integer().min(1).default(60),
  IDEMPOTENCY_LOCK_TTL_SECONDS: Joi.number().integer().min(5).default(30),
  WEBHOOK_IDEMPOTENCY_TTL_MINUTES: Joi.number().integer().min(5).default(1440),

  OUTBOX_DISPATCH_INTERVAL_MS: Joi.number().integer().min(500).default(3000),
  OUTBOX_BATCH_SIZE: Joi.number().integer().min(1).max(500).default(50),
  OUTBOX_MAX_RETRY: Joi.number().integer().min(1).max(100).default(10),

  PAYMENT_GATEWAY: Joi.string().valid('mock', 'vnpay').default('mock'),

  VNPAY_TMN_CODE: Joi.string().allow('').default(''),
  VNPAY_HASH_SECRET: Joi.string().allow('').default(''),
  VNPAY_PAY_URL: Joi.string().uri().default('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'),
  VNPAY_RETURN_URL: Joi.string().uri().default('http://localhost:3000/payment/vnpay-return'),
  VNPAY_IPN_URL: Joi.string().uri().default('http://localhost:3006/api/v1/payments/webhooks/vnpay'),
  VNPAY_LOCALE: Joi.string().default('vn'),
  VNPAY_ORDER_TYPE: Joi.string().default('other'),
  VNPAY_REFUND_SIMULATION: Joi.boolean().default(true),

  KAFKA_BROKERS: Joi.string().default('localhost:9092'),
  PAYMENT_EVENTS_TOPIC: Joi.string().default('payment.events'),
  NOTIFICATION_EVENTS_TOPIC: Joi.string().default('notification.events'),
  ANALYTICS_EVENTS_TOPIC: Joi.string().default('analytics.events')
});
