import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  APP_NAME: Joi.string().default('shipping-service'),
  APP_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
  PORT: Joi.number().default(3008),
  API_PREFIX: Joi.string().default('api/v1'),

  DATABASE_URL: Joi.string().uri().required(),
  DB_SSL: Joi.boolean().default(false),

  REDIS_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),

  OUTBOX_DISPATCH_INTERVAL_MS: Joi.number().integer().min(500).default(3000),
  OUTBOX_BATCH_SIZE: Joi.number().integer().min(1).max(500).default(50),
  OUTBOX_MAX_RETRY: Joi.number().integer().min(1).max(100).default(10),

  WEBHOOK_IDEMPOTENCY_TTL_MINUTES: Joi.number().integer().min(5).default(1440),

  KAFKA_ENABLED: Joi.boolean().default(true),
  KAFKA_BROKERS: Joi.string().default('localhost:9092'),
  ORDER_EVENTS_TOPIC: Joi.string().default('order.events'),
  ORDER_EVENTS_CONSUMER_GROUP: Joi.string().default('shipping-service-order-events-group'),
  SHIPPING_EVENTS_TOPIC: Joi.string().default('shipping.events'),
  NOTIFICATION_EVENTS_TOPIC: Joi.string().default('notification.events'),
  ANALYTICS_EVENTS_TOPIC: Joi.string().default('analytics.events')
});
