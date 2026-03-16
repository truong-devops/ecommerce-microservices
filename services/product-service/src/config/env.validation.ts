import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  APP_NAME: Joi.string().default('product-service'),
  APP_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
  PORT: Joi.number().default(3003),
  API_PREFIX: Joi.string().default('api/v1'),

  DATABASE_URL: Joi.string().required(),
  DATABASE_NAME: Joi.string().default('ecommerce_product'),

  REDIS_ENABLED: Joi.boolean().default(false),
  REDIS_URL: Joi.string().uri().optional(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),

  KAFKA_ENABLED: Joi.boolean().default(false),
  KAFKA_CLIENT_ID: Joi.string().default('product-service'),
  KAFKA_BROKERS: Joi.string().default('localhost:9092'),
  PRODUCT_EVENTS_TOPIC: Joi.string().default('product.events'),
  AUDIT_EVENTS_TOPIC: Joi.string().default('audit.events'),

  SEARCH_ENABLED: Joi.boolean().default(false),
  OPENSEARCH_URL: Joi.string().uri().optional(),
  OPENSEARCH_INDEX: Joi.string().default('products'),
  OPENSEARCH_USERNAME: Joi.string().allow('').optional(),
  OPENSEARCH_PASSWORD: Joi.string().allow('').optional(),
  OPENSEARCH_TIMEOUT_MS: Joi.number().integer().min(1000).default(5000)
});
