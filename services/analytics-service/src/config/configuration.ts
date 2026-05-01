export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'analytics-service',
    env: process.env.APP_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3010),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1'
  },
  postgres: {
    url: process.env.DATABASE_URL ?? 'postgresql://ecommerce:ecommerce@localhost:5432/ecommerce',
    ssl: process.env.DB_SSL === 'true',
    poolMax: Number(process.env.DB_POOL_MAX ?? 10)
  },
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    url: process.env.REDIS_URL ?? ''
  },
  jwt: {
    access: {
      secret: process.env.JWT_ACCESS_SECRET
    }
  },
  kafka: {
    enabled: process.env.KAFKA_ENABLED !== 'false',
    clientId: process.env.KAFKA_CLIENT_ID ?? 'analytics-service',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',').map((value) => value.trim()),
    analyticsEventsTopic: process.env.ANALYTICS_EVENTS_TOPIC ?? 'analytics.events',
    consumerGroup: process.env.ANALYTICS_CONSUMER_GROUP ?? 'analytics-service-group'
  },
  ingest: {
    dedupeTtlSeconds: Number(process.env.INGEST_DEDUPE_TTL_SECONDS ?? 172800)
  }
});
