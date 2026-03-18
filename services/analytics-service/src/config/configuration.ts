export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'analytics-service',
    env: process.env.APP_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3010),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1'
  },
  clickhouse: {
    url: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DATABASE ?? 'ecommerce_analytics',
    username: process.env.CLICKHOUSE_USERNAME ?? 'default',
    password: process.env.CLICKHOUSE_PASSWORD ?? '',
    requestTimeoutMs: Number(process.env.CLICKHOUSE_REQUEST_TIMEOUT_MS ?? 10000)
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
