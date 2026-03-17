import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  APP_NAME: Joi.string().default('review-service'),
  APP_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
  PORT: Joi.number().default(3009),
  API_PREFIX: Joi.string().default('api/v1'),
  MONGODB_URI: Joi.string().uri().required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required()
});
