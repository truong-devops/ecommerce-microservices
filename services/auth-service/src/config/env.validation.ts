import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  APP_NAME: Joi.string().default('auth-service'),
  APP_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
  PORT: Joi.number().default(3001),
  API_PREFIX: Joi.string().default('api/v1'),

  DATABASE_URL: Joi.string().uri().required(),
  DB_SSL: Joi.boolean().default(false),

  REDIS_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),
  JWT_MFA_SECRET: Joi.string().min(32).required(),
  JWT_MFA_EXPIRES_IN: Joi.string().default('10m'),

  EMAIL_VERIFY_TOKEN_TTL_MINUTES: Joi.number().integer().min(5).default(60),
  RESET_PASSWORD_TOKEN_TTL_MINUTES: Joi.number().integer().min(5).default(30),

  REFRESH_TOKEN_PEPPER: Joi.string().min(16).required(),
  BCRYPT_SALT_ROUNDS: Joi.number().integer().min(10).max(14).default(12),
  PASSWORD_MIN_LENGTH: Joi.number().integer().min(8).default(10),

  KAFKA_BROKERS: Joi.string().default('localhost:9092'),
  USER_EVENTS_TOPIC: Joi.string().default('user.events'),
  NOTIFICATION_EVENTS_TOPIC: Joi.string().default('notification.events'),
  AUDIT_EVENTS_TOPIC: Joi.string().default('audit.events')
});
