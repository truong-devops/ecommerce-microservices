import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  APP_NAME: Joi.string().default('notification-service'),
  APP_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
  PORT: Joi.number().default(3009),
  API_PREFIX: Joi.string().default('api/v1'),

  DATABASE_URL: Joi.string().uri().required(),
  DB_SSL: Joi.boolean().default(false),

  REDIS_ENABLED: Joi.boolean().default(false),
  REDIS_URL: Joi.string().uri().allow('').optional(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),

  DISPATCH_INTERVAL_MS: Joi.number().integer().min(500).default(3000),
  DISPATCH_BATCH_SIZE: Joi.number().integer().min(1).max(500).default(50),
  DISPATCH_MAX_RETRY: Joi.number().integer().min(1).max(100).default(10),

  KAFKA_ENABLED: Joi.boolean().default(true),
  KAFKA_CLIENT_ID: Joi.string().default('notification-service'),
  KAFKA_BROKERS: Joi.string().default('localhost:9092'),
  NOTIFICATION_EVENTS_TOPIC: Joi.string().default('notification.events'),
  NOTIFICATION_CONSUMER_GROUP: Joi.string().default('notification-service-group')
});
