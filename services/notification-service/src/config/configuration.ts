export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'notification-service',
    env: process.env.APP_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3009),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1'
  },
  database: {
    url: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true'
  },
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    url: process.env.REDIS_URL
  },
  jwt: {
    access: {
      secret: process.env.JWT_ACCESS_SECRET
    }
  },
  dispatch: {
    intervalMs: Number(process.env.DISPATCH_INTERVAL_MS ?? 3000),
    batchSize: Number(process.env.DISPATCH_BATCH_SIZE ?? 50),
    maxRetry: Number(process.env.DISPATCH_MAX_RETRY ?? 10)
  },
  kafka: {
    enabled: process.env.KAFKA_ENABLED !== 'false',
    clientId: process.env.KAFKA_CLIENT_ID ?? 'notification-service',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',').map((value) => value.trim()),
    notificationEventsTopic: process.env.NOTIFICATION_EVENTS_TOPIC ?? 'notification.events',
    consumerGroup: process.env.NOTIFICATION_CONSUMER_GROUP ?? 'notification-service-group'
  }
});
