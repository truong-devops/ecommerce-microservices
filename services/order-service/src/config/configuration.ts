export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'order-service',
    env: process.env.APP_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3002),
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
  idempotency: {
    recordTtlMinutes: Number(process.env.IDEMPOTENCY_RECORD_TTL_MINUTES ?? 60),
    lockTtlSeconds: Number(process.env.IDEMPOTENCY_LOCK_TTL_SECONDS ?? 30)
  },
  outbox: {
    dispatcherIntervalMs: Number(process.env.OUTBOX_DISPATCH_INTERVAL_MS ?? 3000),
    batchSize: Number(process.env.OUTBOX_BATCH_SIZE ?? 50),
    maxRetry: Number(process.env.OUTBOX_MAX_RETRY ?? 10)
  },
  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',').map((value) => value.trim()),
    orderEventsTopic: process.env.ORDER_EVENTS_TOPIC ?? 'order.events',
    inventoryEventsTopic: process.env.INVENTORY_EVENTS_TOPIC ?? 'inventory.events',
    paymentEventsTopic: process.env.PAYMENT_EVENTS_TOPIC ?? 'payment.events',
    notificationEventsTopic: process.env.NOTIFICATION_EVENTS_TOPIC ?? 'notification.events',
    analyticsEventsTopic: process.env.ANALYTICS_EVENTS_TOPIC ?? 'analytics.events',
    auditEventsTopic: process.env.AUDIT_EVENTS_TOPIC ?? 'audit.events'
  }
});
