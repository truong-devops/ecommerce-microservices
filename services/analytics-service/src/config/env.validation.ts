import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  APP_NAME: Joi.string().default('analytics-service'),
  APP_ENV: Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
  PORT: Joi.number().default(3010),
  API_PREFIX: Joi.string().default('api/v1'),

  CLICKHOUSE_URL: Joi.string().uri().required(),
  CLICKHOUSE_DATABASE: Joi.string().default('ecommerce_analytics'),
  CLICKHOUSE_USERNAME: Joi.string().default('default'),
  CLICKHOUSE_PASSWORD: Joi.string().allow('').default(''),
  CLICKHOUSE_REQUEST_TIMEOUT_MS: Joi.number().integer().min(1000).default(10000),

  REDIS_ENABLED: Joi.boolean().default(false),
  REDIS_URL: Joi.string().uri().allow('').optional(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),

  KAFKA_ENABLED: Joi.boolean().default(true),
  KAFKA_CLIENT_ID: Joi.string().default('analytics-service'),
  KAFKA_BROKERS: Joi.string().default('localhost:9092'),
  ANALYTICS_EVENTS_TOPIC: Joi.string().default('analytics.events'),
  ANALYTICS_CONSUMER_GROUP: Joi.string().default('analytics-service-group'),

  INGEST_DEDUPE_TTL_SECONDS: Joi.number().integer().min(60).default(172800)
});
