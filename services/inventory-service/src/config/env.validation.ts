import Joi from 'joi';

export const envValidationSchema = Joi.object({
  APP_NAME: Joi.string().default('inventory-service'),
  APP_ENV: Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
  PORT: Joi.number().default(3007),

  DATABASE_URL: Joi.string().uri().required(),
  DB_SSL: Joi.boolean().truthy('true').falsy('false').default(false),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),

  RESERVATION_DEFAULT_TTL_MINUTES: Joi.number().integer().min(1).max(1440).default(10),
  RESERVATION_EXPIRE_CHECK_INTERVAL_MS: Joi.number().integer().min(1000).default(15000),
  RESERVATION_EXPIRE_BATCH_SIZE: Joi.number().integer().min(1).max(10000).default(200),

  OUTBOX_DISPATCH_INTERVAL_MS: Joi.number().integer().min(500).default(3000),
  OUTBOX_BATCH_SIZE: Joi.number().integer().min(1).max(500).default(50),
  OUTBOX_MAX_RETRY: Joi.number().integer().min(1).max(100).default(10),

  KAFKA_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  KAFKA_BROKERS: Joi.string().default('localhost:9092'),
  INVENTORY_EVENTS_TOPIC: Joi.string().default('inventory.events'),
  KAFKA_CONSUMER_GROUP_ID: Joi.string().default('inventory-service-group')
});
