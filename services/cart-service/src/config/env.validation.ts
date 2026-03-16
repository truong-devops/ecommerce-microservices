import Joi from 'joi';

export const envValidationSchema = Joi.object({
  APP_NAME: Joi.string().default('cart-service'),
  APP_ENV: Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
  PORT: Joi.number().default(3004),

  REDIS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  REDIS_URL: Joi.string().uri().required(),

  CART_TTL_SECONDS: Joi.number().integer().min(60).default(259200),
  CART_MAX_QTY_PER_ITEM: Joi.number().integer().min(1).max(10000).default(99),
  CART_DEFAULT_CURRENCY: Joi.string().length(3).uppercase().default('USD'),
  CART_PERSISTENCE_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),

  DATABASE_URL: Joi.when('CART_PERSISTENCE_ENABLED', {
    is: true,
    then: Joi.string().uri().required(),
    otherwise: Joi.string().optional().allow('')
  }),
  DB_SSL: Joi.boolean().truthy('true').falsy('false').default(false),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),

  KAFKA_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  KAFKA_CLIENT_ID: Joi.string().default('cart-service'),
  KAFKA_BROKERS: Joi.string().default('localhost:9092'),
  CART_EVENTS_TOPIC: Joi.string().default('cart.events'),

  CART_VALIDATE_EXTERNAL: Joi.boolean().truthy('true').falsy('false').default(false),
  PRODUCT_SERVICE_BASE_URL: Joi.string().uri().optional().allow(''),
  INVENTORY_SERVICE_BASE_URL: Joi.string().uri().optional().allow(''),
  DEPENDENCY_TIMEOUT_MS: Joi.number().integer().min(100).max(30000).default(5000)
});
