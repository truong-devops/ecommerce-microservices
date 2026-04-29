export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'shipping-service',
    env: process.env.APP_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3008),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1'
  },
  database: {
    url: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true'
  },
  redis: {
    url: process.env.REDIS_URL
  },
  jwt: {
    access: {
      secret: process.env.JWT_ACCESS_SECRET
    }
  },
  outbox: {
    dispatcherIntervalMs: Number(process.env.OUTBOX_DISPATCH_INTERVAL_MS ?? 3000),
    batchSize: Number(process.env.OUTBOX_BATCH_SIZE ?? 50),
    maxRetry: Number(process.env.OUTBOX_MAX_RETRY ?? 10)
  },
  webhookIdempotency: {
    ttlMinutes: Number(process.env.WEBHOOK_IDEMPOTENCY_TTL_MINUTES ?? 1440)
  },
  kafka: {
    enabled: process.env.KAFKA_ENABLED !== 'false',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',').map((value) => value.trim()),
    orderEventsTopic: process.env.ORDER_EVENTS_TOPIC ?? 'order.events',
    orderEventsConsumerGroup: process.env.ORDER_EVENTS_CONSUMER_GROUP ?? 'shipping-service-order-events-group',
    shippingEventsTopic: process.env.SHIPPING_EVENTS_TOPIC ?? 'shipping.events',
    notificationEventsTopic: process.env.NOTIFICATION_EVENTS_TOPIC ?? 'notification.events',
    analyticsEventsTopic: process.env.ANALYTICS_EVENTS_TOPIC ?? 'analytics.events'
  }
});
