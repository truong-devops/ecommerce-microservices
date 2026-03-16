import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  APP_NAME: Joi.string().default('order-service'),
  APP_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
  PORT: Joi.number().default(3002),
  API_PREFIX: Joi.string().default('api/v1'),

  DATABASE_URL: Joi.string().uri().required(),
  DB_SSL: Joi.boolean().default(false),

  REDIS_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),

  IDEMPOTENCY_RECORD_TTL_MINUTES: Joi.number().integer().min(1).default(60),
  IDEMPOTENCY_LOCK_TTL_SECONDS: Joi.number().integer().min(5).default(30),

  OUTBOX_DISPATCH_INTERVAL_MS: Joi.number().integer().min(500).default(3000),
  OUTBOX_BATCH_SIZE: Joi.number().integer().min(1).max(500).default(50),
  OUTBOX_MAX_RETRY: Joi.number().integer().min(1).max(100).default(10),

  KAFKA_BROKERS: Joi.string().default('localhost:9092'),
  ORDER_EVENTS_TOPIC: Joi.string().default('order.events'),
  INVENTORY_EVENTS_TOPIC: Joi.string().default('inventory.events'),
  PAYMENT_EVENTS_TOPIC: Joi.string().default('payment.events'),
  NOTIFICATION_EVENTS_TOPIC: Joi.string().default('notification.events'),
  ANALYTICS_EVENTS_TOPIC: Joi.string().default('analytics.events'),
  AUDIT_EVENTS_TOPIC: Joi.string().default('audit.events')
});
